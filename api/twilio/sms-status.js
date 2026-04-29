// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/sms-status — SMS delivery callback (A9).
//
// Twilio fires this as the SMS moves through carrier networks:
//   queued → sent → delivered     (happy path)
//   queued → sent → undelivered   (carrier rejected)
//   queued → failed                (Twilio-side rejection)
//
// Critical for AU because Alpha Sender SMS (when we eventually use it) can
// silently fail at the carrier — this is the only signal a rep gets that
// their message didn't land.
// ─────────────────────────────────────────────────────────────────────────────

import { validateTwilioRequest } from '../_lib/twilioValidate.js';
import { getServerSupabase } from '../_lib/supabase.js';

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
  const messageStatus = body.MessageStatus || body.SmsStatus;
  const errorCode = body.ErrorCode;

  if (!messageSid) {
    res.status(400).send('Missing MessageSid');
    return;
  }

  const supabase = getServerSupabase();
  const updates = { status: messageStatus };
  if (messageStatus === 'delivered') {
    updates.delivered_at = new Date().toISOString();
  }

  await supabase.from('sms_logs').update(updates).eq('twilio_sid', messageSid).then(r => {
    if (r.error) console.warn('[Spartan] sms_logs status update failed (sid=' + messageSid + '):', r.error.message);
  });

  // On hard failure, log the error code for the Reports module (stage 6) to surface.
  if ((messageStatus === 'failed' || messageStatus === 'undelivered') && errorCode) {
    console.warn('[Spartan] SMS delivery failure sid=' + messageSid + ' code=' + errorCode);
  }

  res.status(204).end();
}
