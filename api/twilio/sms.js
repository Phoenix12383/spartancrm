// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/sms — outbound SMS (A7).
//
// Called from the browser (the SMS tab in deal/lead/contact detail). Auth is
// the same Google access token pattern as /token — verified, then resolved
// to a Spartan user.
//
// Body: { to, body, entityId, entityType }
//   - to: customer phone number, any AU format
//   - body: SMS text (max ~160 chars for single-segment GSM-7)
//   - entityId/entityType: which CRM record to attach the activity to
//
// Returns: { sid } on success, { error } on failure.
// ─────────────────────────────────────────────────────────────────────────────

import { getTwilioClient } from '../_lib/twilioClient.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { verifyGoogleAndLookupUser } from '../_lib/auth.js';
import { normalizeAuPhone } from '../_lib/phone.js';
import { appendSmsActivity } from '../_lib/activities.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth — same pattern as /token
  const auth = await verifyGoogleAndLookupUser(req);
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const user = auth.user;

  const { to, body, entityId, entityType } = req.body || {};
  if (!to || !body) {
    res.status(400).json({ error: 'to and body are required' });
    return;
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    res.status(500).json({ error: 'Backend misconfigured: TWILIO_PHONE_NUMBER not set' });
    return;
  }

  const toNumber = normalizeAuPhone(to);
  if (!toNumber) {
    res.status(400).json({ error: 'Invalid destination phone number' });
    return;
  }

  // Send via Twilio REST. statusCallback gets fired as the message moves
  // through carrier networks (queued → sent → delivered or failed).
  const protoForSelf = req.headers['x-forwarded-proto'] || 'https';
  const hostForSelf = req.headers['x-forwarded-host'] || req.headers.host;
  const statusCallbackUrl = `${protoForSelf}://${hostForSelf}/api/twilio/sms-status`;

  let twMsg;
  try {
    const client = getTwilioClient();
    twMsg = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      body: String(body),
      statusCallback: statusCallbackUrl,
    });
  } catch (e) {
    console.error('[Spartan] SMS send failed:', e && e.message ? e.message : e);
    res.status(502).json({ error: 'SMS send failed: ' + (e && e.message ? e.message : 'unknown') });
    return;
  }

  // Log to sms_logs and write the activity row.
  const supabase = getServerSupabase();
  await supabase.from('sms_logs').insert({
    twilio_sid: twMsg.sid,
    direction: 'outbound',
    from_number: fromNumber,
    to_number: toNumber,
    user_id: user.id,
    entity_type: entityType || null,
    entity_id: entityId || null,
    body: String(body),
    status: twMsg.status || 'queued',
    sent_at: new Date().toISOString(),
  }).then(r => {
    if (r.error) console.warn('[Spartan] sms_logs insert failed:', r.error.message);
  });

  if (entityId && entityType) {
    await appendSmsActivity(supabase, {
      entityType,
      entityId,
      byUser: user.name || '',
      direction: 'outbound',
      body: String(body),
      sid: twMsg.sid,
    });
  }

  res.status(200).json({ sid: twMsg.sid, status: twMsg.status || 'queued' });
}
