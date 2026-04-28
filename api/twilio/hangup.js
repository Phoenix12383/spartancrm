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

  // Twilio has TWO mutually-exclusive status updates for ending a call:
  //   - Status='canceled'  works on queued/ringing calls (not yet connected)
  //   - Status='completed' works on in-progress calls (already connected)
  // Sending the wrong one for the call's current state is a silent no-op.
  // We don't know the state from the browser side reliably, so try cancel
  // first (which handles the "rep clicks End while customer phone is still
  // ringing" case — the most common cause of confusion). If that fails with
  // an "invalid status transition" error, the call is already in-progress,
  // so try completed.
  let result = null;
  let lastError = null;

  try {
    result = await client.calls(sid).update({ status: 'canceled' });
  } catch (e) {
    lastError = e;
  }

  if (!result) {
    // canceled failed — try completed (call might be already in-progress)
    try {
      result = await client.calls(sid).update({ status: 'completed' });
      lastError = null;
    } catch (e) {
      lastError = e;
    }
  }

  if (result) {
    res.status(200).json({ ok: true, sid, action: result.status === 'canceled' ? 'canceled' : 'completed' });
    return;
  }

  // Both attempts failed. Common reasons:
  //   - Call already ended on its own (treated as success — idempotent)
  //   - Call SID doesn't exist (404)
  //   - Auth issue (shouldn't happen if env vars are validated)
  const status = (lastError && lastError.status) ? lastError.status : 502;
  const code = (lastError && lastError.code) ? lastError.code : 'unknown';
  if (status === 404 || String(code) === '20003' || String(code) === '21220' || String(code) === '21210') {
    res.status(200).json({ ok: true, sid, alreadyEnded: true });
    return;
  }
  console.error('[Spartan] hangup REST call failed:', lastError && lastError.message ? lastError.message : lastError, 'code=' + code);
  res.status(status).json({ error: 'Failed to terminate call: ' + ((lastError && lastError.message) || 'unknown'), code });
}
