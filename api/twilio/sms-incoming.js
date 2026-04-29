// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/sms-incoming — inbound SMS webhook (A8).
//
// Twilio fires this when a customer texts our AU number. We:
//   1. Validate the signature
//   2. Look up the sender against contacts/leads to attach the SMS
//   3. Insert sms_logs row (direction: 'inbound')
//   4. Insert activity row so the message appears in the timeline
//
// Returns an empty TwiML <Response/> — no auto-reply for v1. Deferred
// auto-reply ("Got it, a rep will respond shortly") can be added later by
// emitting <Message>...</Message> instead.
// ─────────────────────────────────────────────────────────────────────────────

import { validateTwilioRequest } from '../_lib/twilioValidate.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { findEntityByPhone } from '../_lib/entityLookup.js';
import { appendSmsActivity } from '../_lib/activities.js';

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
  const messageSid = body.MessageSid || body.SmsSid;
  const from = body.From || '';
  const to = body.To || '';
  const messageBody = body.Body || '';

  const supabase = getServerSupabase();

  // Try to attach the SMS to a CRM record by phone match.
  let matched = null;
  try { matched = await findEntityByPhone(supabase, from); } catch(e) {}

  if (messageSid) {
    await supabase.from('sms_logs').insert({
      twilio_sid: messageSid,
      direction: 'inbound',
      from_number: from,
      to_number: to,
      entity_type: matched ? matched.type : null,
      entity_id: matched ? matched.id : null,
      body: messageBody,
      status: 'received',
      sent_at: new Date().toISOString(),
    }).then(r => {
      if (r.error) console.warn('[Spartan] inbound sms_logs insert failed:', r.error.message);
    });
  }

  if (matched) {
    await appendSmsActivity(supabase, {
      entityType: matched.type,
      entityId: matched.id,
      byUser: matched.name || from,
      direction: 'inbound',
      body: messageBody,
      sid: messageSid || ('sms_in_' + Date.now()),
    });
  }

  // Empty TwiML response — Twilio expects valid XML even for no-op
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
}
