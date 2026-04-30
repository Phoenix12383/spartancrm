// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/dial — outbound PSTN-bridge call from the Capacitor wrapper.
//
// Auth:  Authorization: Bearer <google-id-token>  (verifyGoogleIdTokenAndLookupUser).
// Body:  { to, contactName?, entityId?, entityType? }
// Flow:
//   1. Look up the rep's phone from users.phone.
//   2. Twilio rings the rep's mobile FROM the company number.
//   3. When the rep answers, the inline TwiML plays the recording disclaimer
//      then "Connecting you to {contactName}…" then <Dial>s the customer with
//      dual-channel recording (same shape as the desktop voice.js TwiML).
//   4. We pre-insert a call_logs row keyed by the returned Twilio SID so the
//      existing /api/twilio/status webhook can UPDATE it on completion and
//      write the 'call' activity to the timeline.
//
// WebRTC-in-WebView path (the desktop's flow) is intentionally NOT used —
// it's flaky on Android and adds permission burden. PSTN bridge gives us a
// real phone call with bullet-proof recording.
// ─────────────────────────────────────────────────────────────────────────────

import { getTwilioClient } from '../_lib/twilioClient.js';
import { getServerSupabase } from '../_lib/supabase.js';
import { verifyGoogleIdTokenAndLookupUser } from '../_lib/auth.js';
import { normalizeAuPhone } from '../_lib/phone.js';

const RECORDING_DISCLAIMER = 'This call may be recorded for quality and training purposes.';

function escapeXml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth via the wrapper's Google idToken (captured at sign-in, persisted
  // in localStorage as spartan_native_id_token).
  const auth = await verifyGoogleIdTokenAndLookupUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const user = auth.user;

  // verifyGoogleIdTokenAndLookupUser returns a thin user record; re-fetch
  // with the phone column.
  const supabase = getServerSupabase();
  const { data: u, error: ue } = await supabase
    .from('users')
    .select('id, name, email, phone')
    .eq('id', user.id)
    .maybeSingle();
  if (ue || !u) return res.status(500).json({ error: 'User lookup failed' });

  if (!u.phone || !String(u.phone).trim()) {
    // C1 — hard error, prompt the rep to add their number. Mobile UI
    // surfaces this verbatim in a toast.
    return res.status(400).json({
      error: 'NO_REP_PHONE',
      message: 'Add your mobile in Settings → My Profile to enable calls',
    });
  }

  const { to, contactName, entityId, entityType } = req.body || {};
  if (!to) return res.status(400).json({ error: 'to is required' });

  const repPhone = normalizeAuPhone(u.phone);
  const customerPhone = normalizeAuPhone(to);
  if (!repPhone) return res.status(400).json({ error: 'Rep phone is in an unsupported format' });
  if (!customerPhone) return res.status(400).json({ error: 'Customer phone is in an unsupported format' });

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) return res.status(500).json({ error: 'TWILIO_PHONE_NUMBER not configured' });

  // TwiML runs when the rep answers. Disclaimer + connecting-to-name prompt
  // (per option B2), then dual-channel recorded <Dial> to the customer.
  // answerOnBridge="true" defers billing until the customer actually picks
  // up — same pattern as voice.js.
  const safeName = contactName ? escapeXml(contactName) : 'a customer';
  const twiml =
    `<Response>` +
      `<Say voice="Polly.Nicole">${RECORDING_DISCLAIMER}</Say>` +
      `<Say voice="Polly.Nicole">Connecting you to ${safeName}.</Say>` +
      `<Dial callerId="${escapeXml(fromNumber)}" answerOnBridge="true" record="record-from-answer-dual" ` +
        `recordingStatusCallback="https://spaartan.tech/api/twilio/recording" ` +
        `recordingStatusCallbackEvent="completed">` +
        `<Number>${escapeXml(customerPhone)}</Number>` +
      `</Dial>` +
    `</Response>`;

  let call;
  try {
    const client = getTwilioClient();
    call = await client.calls.create({
      to: repPhone,                        // ring the rep first
      from: fromNumber,                    // company caller ID (option A2)
      twiml,                               // plays on rep-answer, then bridges
      statusCallback: 'https://spaartan.tech/api/twilio/status',
      statusCallbackEvent: ['completed'],
      statusCallbackMethod: 'POST',
    });
  } catch (e) {
    console.error('[/api/twilio/dial] calls.create failed:', e.message);
    return res.status(502).json({ error: 'Twilio call failed: ' + e.message });
  }

  // Pre-insert the call_logs row so /api/twilio/status's UPDATE-by-twilio_sid
  // path can attach the activity to the right deal/lead/contact when the
  // call completes. Schema mirrors the row voice.js writes for browser-side
  // calls — the only difference is no live origin marker yet (we could add
  // an `origin: 'mobile-bridge'` column later for analytics).
  try {
    const { error: insErr } = await supabase.from('call_logs').insert({
      twilio_sid: call.sid,
      direction: 'outbound',
      from_number: fromNumber,
      to_number: customerPhone,
      user_id: u.id,
      entity_type: entityType || null,
      entity_id: entityId || null,
      status: 'initiated',
      started_at: new Date().toISOString(),
    });
    if (insErr) console.warn('[/api/twilio/dial] call_logs insert error:', insErr.message);
  } catch (e) {
    console.warn('[/api/twilio/dial] call_logs insert threw:', e.message);
  }

  return res.status(200).json({ ok: true, callSid: call.sid });
}
