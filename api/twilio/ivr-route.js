// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/ivr-route — IVR digit handler (A4).
//
// Twilio calls this when a customer presses a digit on the IVR menu set up by
// /incoming. We look up the team for that digit, find all active users in
// the matching role(s), and simul-ring all of them via stacked <Client>
// elements inside a single <Dial>.
//
// First rep to pick up gets the call. On <Dial timeout> (no one answers in
// 25s) or invalid digit, fall through to voicemail.
// ─────────────────────────────────────────────────────────────────────────────

import { validateTwilioRequest } from '../_lib/twilioValidate.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { findAllActiveUsers } from '../_lib/twilioRouting.js';
import { getPhoneSettings } from '../_lib/phoneSettings.js';

const NO_ANSWER_VOICEMAIL_GREETING = 'Sorry, no one is available to take your call right now. Please leave a message after the beep.';
const INVALID_DIGIT_GREETING = 'Sorry, that was not a valid option. Trying to reach anyone available now.';

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
  const digit = String(body.Digits || '').trim();

  const supabase = getServerSupabase();
  const settings = await getPhoneSettings();
  const ivrMenu = settings.ivr_menu || {};
  const voiceName = settings.voice_name || 'Polly.Nicole';

  // Invalid / unknown digit → ring every active user, then voicemail. Same
  // behaviour as the no-digit path in /incoming so callers who fat-finger
  // a key still reach a human if anyone's around.
  if (!digit || !ivrMenu[digit]) {
    const allUsers = await findAllActiveUsers(supabase);
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voiceName)}">${escapeXml(INVALID_DIGIT_GREETING)}</Say>`;
    if (allUsers.length > 0) {
      const clientsXml = allUsers
        .map(u => `<Client>spartan_${escapeXml(u.id)}</Client>`)
        .join('\n    ');
      twiml += `
  <Dial timeout="25" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed">
    ${clientsXml}
  </Dial>`;
    }
    twiml += `
  <Say voice="${escapeXml(voiceName)}">${escapeXml(NO_ANSWER_VOICEMAIL_GREETING)}</Say>
  <Record action="/api/twilio/voicemail" maxLength="120" timeout="5" playBeep="true" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed"/>
  <Say voice="${escapeXml(voiceName)}">Thanks. Goodbye.</Say>
</Response>`;
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml);
    return;
  }

  // Look up active users for the matched team using the admin-configured roles.
  const teamRoles = (ivrMenu[digit] && ivrMenu[digit].roles) || [];
  let teamUsers = [];
  if (teamRoles.length > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role')
      .in('role', teamRoles)
      .eq('active', true);
    if (!error && data) teamUsers = data;
  }

  // Build simul-ring TwiML. If no users on that team, go straight to voicemail.
  if (teamUsers.length === 0) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voiceName)}">Sorry, no one is currently available in that team. Please leave a message after the beep.</Say>
  <Record action="/api/twilio/voicemail" maxLength="120" timeout="5" playBeep="true" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed"/>
  <Say voice="${escapeXml(voiceName)}">Thanks. Goodbye.</Say>
</Response>`;
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml);
    return;
  }

  // Stack a <Client> per user inside one <Dial>. First to accept wins;
  // others get cancelled by Twilio automatically.
  const clientsXml = teamUsers
    .map(u => `<Client>spartan_${escapeXml(u.id)}</Client>`)
    .join('\n    ');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="25" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed">
    ${clientsXml}
  </Dial>
  <Say voice="${escapeXml(voiceName)}">${escapeXml(NO_ANSWER_VOICEMAIL_GREETING)}</Say>
  <Record action="/api/twilio/voicemail" maxLength="120" timeout="5" playBeep="true" recordingStatusCallback="/api/twilio/recording" recordingStatusCallbackEvent="completed"/>
  <Say voice="${escapeXml(voiceName)}">Thanks. Goodbye.</Say>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml);
}

function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
