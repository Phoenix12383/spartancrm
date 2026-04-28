// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/status — call lifecycle callback.
//
// Twilio calls this at multiple points in a call's lifetime. We're primarily
// interested in the "completed" event — that's when we have the final
// duration and can write the activity row to the entity timeline.
//
// Earlier events (initiated, ringing, answered) are logged but don't trigger
// activity writes — those would just show up as duplicates on the timeline.
// ─────────────────────────────────────────────────────────────────────────────

import { validateTwilioRequest } from '../_lib/twilioValidate.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { findEntityByPhone } from '../_lib/entityLookup.js';
import { appendCallActivity } from '../_lib/activities.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method not allowed');
    return;
  }

  if (!validateTwilioRequest(req, req.body)) {
    res.status(403).send('Invalid Twilio signature');
    return;
  }

  const body = req.body || {};
  const callSid = body.CallSid;
  const callStatus = body.CallStatus; // queued | initiated | ringing | in-progress | completed | busy | no-answer | canceled | failed
  const duration = parseInt(body.CallDuration || '0', 10) || 0;
  const to = body.To || '';

  if (!callSid) {
    res.status(400).send('Missing CallSid');
    return;
  }

  const supabase = getServerSupabase();

  // Update the call_logs row with whatever we now know. Fire-and-forget on the
  // promise — Twilio just wants a 204 fast.
  const updates = { status: callStatus };
  if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'canceled' || callStatus === 'failed') {
    updates.duration_seconds = duration;
    updates.ended_at = new Date().toISOString();
  }

  await supabase.from('call_logs').update(updates).eq('twilio_sid', callSid).then(r => {
    if (r.error) console.warn('[Spartan] call_logs update failed (sid=' + callSid + '):', r.error.message);
  });

  // Only write the activity row on terminal states — earlier events would create
  // duplicates on the timeline. "completed" includes any call that connected,
  // even if briefly; busy/no-answer/canceled/failed cover non-connection cases.
  const isTerminal = ['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(callStatus);
  if (isTerminal) {
    // Re-read the row so we have entity_type/entity_id and user_id (set by /voice)
    const { data: row } = await supabase
      .from('call_logs')
      .select('entity_type, entity_id, user_id, to_number')
      .eq('twilio_sid', callSid)
      .maybeSingle();

    if (row) {
      let entityType = row.entity_type;
      let entityId = row.entity_id;

      // Fall back to phone-based lookup if /voice didn't have entity context
      // (e.g. rep dialled a number not from a CRM record).
      if (!entityType || !entityId) {
        const matched = await findEntityByPhone(supabase, row.to_number || to);
        if (matched) { entityType = matched.type; entityId = matched.id; }
      }

      if (entityType && entityId) {
        // Resolve user_id back to a name for the "by_user" timeline column
        let byUser = '';
        if (row.user_id) {
          const { data: user } = await supabase
            .from('users').select('name').eq('id', row.user_id).maybeSingle();
          if (user) byUser = user.name;
        }

        await appendCallActivity(supabase, {
          entityType,
          entityId,
          byUser,
          durationSeconds: duration,
          outcome: callStatus,
          callSid,
          notes: '',
        });
      }
    }
  }

  res.status(204).end();
}
