// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/voice — outbound TwiML.
//
// Twilio calls this when a Voice SDK device (the rep's browser) places a call.
// We respond with TwiML that:
//   1. Plays the recording disclaimer to the customer ("This call may be
//      recorded for quality and training purposes").
//   2. Dials the customer's number with dual-channel recording enabled.
//
// Webhook signature (X-Twilio-Signature) is verified to keep this endpoint
// from being called by anyone on the open internet.
//
// We also write the initial call_logs row here, so /status has something to
// UPDATE later. The browser sends entityId/entityType as connect() params,
// which Twilio forwards to us as form fields — without that we'd have no way
// to attach the call to the right deal/lead/contact.
// ─────────────────────────────────────────────────────────────────────────────

import { validateTwilioRequest } from '../_lib/twilioValidate.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { normalizeAuPhone } from '../_lib/phone.js';

const RECORDING_DISCLAIMER = 'This call may be recorded for quality and training purposes.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method not allowed');
    return;
  }

  // Verify the request actually came from Twilio. Without this anyone with
  // our webhook URL could drive arbitrary outbound calls billed to our account.
  if (!validateTwilioRequest(req, req.body)) {
    res.status(403).send('Invalid Twilio signature');
    return;
  }

  const body = req.body || {};
  const callSid = body.CallSid;
  const from = body.From || ''; // expected: client:spartan_<userId>
  const to = body.To || body.PhoneNumber || '';
  const entityId = body.entityId || null;
  const entityType = body.entityType || null;

  const fromCallerId = process.env.TWILIO_PHONE_NUMBER;
  if (!fromCallerId) {
    res.status(500).send('Backend misconfigured: TWILIO_PHONE_NUMBER not set');
    return;
  }

  // Extract the rep's user id from the client identity ("client:spartan_u3" → "u3")
  let userId = null;
  if (from && from.startsWith('client:spartan_')) {
    userId = from.slice('client:spartan_'.length);
  }

  // Insert the initial call_logs row so /status (and the browser realtime sub)
  // have something to update. Fire-and-forget — TwiML must return quickly to
  // keep customer dial latency low.
  if (callSid) {
    const supabase = getServerSupabase();
    supabase.from('call_logs').insert({
      twilio_sid: callSid,
      direction: 'outbound',
      from_number: fromCallerId,
      to_number: normalizeAuPhone(to) || to,
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      status: 'initiated',
      started_at: new Date().toISOString(),
    }).then(r => {
      if (r.error) console.warn('[Spartan] call_logs insert failed (sid=' + callSid + '):', r.error.message);
    });
  }

  // Build the TwiML response. answerOnBridge="true" defers billing-start
  // until the customer actually picks up — without it, Twilio answers our
  // leg immediately and bills from then.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Nicole">${RECORDING_DISCLAIMER}</Say>
  <Dial callerId="${escapeXml(fromCallerId)}" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed">
    <Number>${escapeXml(normalizeAuPhone(to) || to)}</Number>
  </Dial>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml);
}

function escapeXml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
