// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/hangup?sid=<callSid> — forcefully terminate a call.
//
// The browser's Voice SDK has a Call.disconnect() method, but it relies on
// the WebRTC peer connection to deliver the hangup signal to Twilio's
// gateway. In practice that's been unreliable — sometimes .disconnect()
// silently no-ops and the call keeps running until the gateway times out.
//
// This endpoint goes directly to Twilio's REST API
// (POST /2010-04-01/Accounts/{Sid}/Calls/{CallSid}.json with Status=completed)
// from our backend with full account credentials. The gateway terminates
// both legs immediately. No reliance on the WebRTC state machine.
//
// Browser usage: call this in parallel with the SDK's .disconnect() — whichever
// arrives first wins. The other becomes a no-op (already-ended) on the second
// trip through the gateway.
// ─────────────────────────────────────────────────────────────────────────────

import { getTwilioClient } from '../_lib/twilioClient.js';
import { verifyGoogleAndLookupUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth — same Google access token pattern as /token, /sms, /recording-stream
  const auth = await verifyGoogleAndLookupUser(req);
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  // Accept the CallSid via query string OR JSON body so the caller has a choice
  const callSid = (req.query && req.query.sid) || (req.body && req.body.sid) || '';
  const sid = String(callSid).trim();
  if (!sid || !/^[A-Z0-9]+$/i.test(sid)) {
    res.status(400).json({ error: 'Missing or invalid sid' });
    return;
  }

  let client;
  try { client = getTwilioClient(); }
  catch (e) {
    res.status(500).json({ error: 'Twilio client unavailable: ' + (e.message || 'unknown') });
    return;
  }

  try {
    // Twilio's update() with status='completed' is the official "kill this
    // call now" signal. Returns the updated Call resource on success.
    await client.calls(sid).update({ status: 'completed' });
    res.status(200).json({ ok: true, sid });
  } catch (e) {
    // Common errors:
    //   - Call already ended (returns 20003 / 21220 — fine, no-op)
    //   - Call not found (Twilio rejected with code 20404)
    //   - Auth issue (shouldn't happen given env vars are validated)
    const status = e && e.status ? e.status : 502;
    const code = e && e.code ? e.code : 'unknown';
    // 20003 / 21220 are "call already in a terminal state" — treat as success
    if (status === 404 || (code && (String(code) === '20003' || String(code) === '21220'))) {
      res.status(200).json({ ok: true, sid, alreadyEnded: true });
      return;
    }
    console.error('[Spartan] hangup REST call failed:', e && e.message ? e.message : e, 'code=' + code);
    res.status(status).json({ error: 'Failed to terminate call: ' + (e.message || 'unknown'), code });
  }
}
