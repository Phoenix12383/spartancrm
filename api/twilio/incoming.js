// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/incoming — inbound call TwiML (A3).
//
// Triggered when a customer rings the Spartan AU number. Decision tree:
//
//   1. After hours? → straight to voicemail (Mon-Fri 8am-5pm AEDT business
//      hours; outside that, ring nobody).
//   2. Known caller? (phone matches a contact / lead / open deal)
//        AND that record has an assigned rep
//        AND that rep is active
//          → ring just that rep for 20s. If they don't answer, fall through
//            to step 3.
//   3. IVR menu — Press 1 for Sales, 2 for Service, 3 for Accounts.
//        On digit press, /api/twilio/ivr-route handles the routing.
//        On no input, fall through to voicemail.
//
// Inbound call_logs row is inserted at the top so the activity timeline
// shows "ringing" before the call is even answered.
// ─────────────────────────────────────────────────────────────────────────────

import { validateTwilioRequest } from '../_lib/twilioValidate.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { findEntityByPhone } from '../_lib/entityLookup.js';
import { findAssignedRepForCaller, IVR_MENU } from '../_lib/twilioRouting.js';
import { isBusinessHours } from '../_lib/businessHours.js';

const GREETING = 'Welcome to Spartan Double Glazing. Press 1 for Sales, 2 for Service, or 3 for Accounts. To speak with anyone, please hold.';
const VOICEMAIL_GREETING = 'Sorry, you have reached us outside business hours. Please leave a message after the beep and we will return your call.';
const NO_ANSWER_VOICEMAIL_GREETING = 'Sorry, no one is available to take your call right now. Please leave a message after the beep.';

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
  const from = body.From || '';
  const to = body.To || '';

  const supabase = getServerSupabase();

  // Look up the caller (if known) so we can attach the call_logs row to the
  // right entity from the moment it starts ringing.
  let matched = null;
  try { matched = await findEntityByPhone(supabase, from); } catch(e) {}

  // Insert the inbound call_logs row immediately. Status updates flow in via
  // /api/twilio/status as the call progresses.
  if (callSid) {
    supabase.from('call_logs').insert({
      twilio_sid: callSid,
      direction: 'inbound',
      from_number: from,
      to_number: to,
      entity_type: matched ? matched.type : null,
      entity_id: matched ? matched.id : null,
      status: 'ringing',
      started_at: new Date().toISOString(),
    }).then(r => {
      if (r.error) console.warn('[Spartan] inbound call_logs insert failed (sid=' + callSid + '):', r.error.message);
    });
  }

  // 1. After hours → voicemail
  if (!isBusinessHours()) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Nicole">${escapeXml(VOICEMAIL_GREETING)}</Say>
  <Record action="/api/twilio/voicemail" maxLength="120" timeout="5" playBeep="true" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed"/>
  <Say voice="Polly.Nicole">Thanks. Goodbye.</Say>
</Response>`;
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml);
    return;
  }

  // 2. Smart routing — known caller with an assigned rep
  let assignedRep = null;
  try { assignedRep = await findAssignedRepForCaller(supabase, from); } catch(e) {}

  // 3. Build TwiML. Stack <Dial> blocks so each falls through to the next on
  // no-answer. Final fallback is voicemail.
  let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;

  if (assignedRep) {
    twiml += `
  <Dial timeout="20" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed">
    <Client>spartan_${escapeXml(assignedRep.id)}</Client>
  </Dial>`;
  }

  // IVR menu (always present as the fallback after smart-routing-no-answer,
  // and as the entry point when there's no smart match).
  twiml += `
  <Gather numDigits="1" timeout="10" action="/api/twilio/ivr-route" method="POST">
    <Say voice="Polly.Nicole">${escapeXml(GREETING)}</Say>
  </Gather>
  <Say voice="Polly.Nicole">${escapeXml(NO_ANSWER_VOICEMAIL_GREETING)}</Say>
  <Record action="/api/twilio/voicemail" maxLength="120" timeout="5" playBeep="true" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed"/>
  <Say voice="Polly.Nicole">Thanks. Goodbye.</Say>
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
