// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/recording — recording-status callback (STUB for stage 2).
//
// Twilio calls this once a recording has been processed and stored. Stage 3
// will surface the recordingUrl in the call_logs row and add UI for playback.
//
// For stage 2 we just write the recordingUrl to call_logs (so the data is
// captured) but don't add UI — the stub keeps Twilio's retries from spamming
// our function logs after every call.
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
  const callSid = body.CallSid;
  const recordingUrl = body.RecordingUrl;
  const recordingDuration = parseInt(body.RecordingDuration || '0', 10) || 0;

  if (callSid && recordingUrl) {
    const supabase = getServerSupabase();
    // Twilio gives us the recording resource URL (no extension). Append .mp3
    // so a browser <audio> element can play it directly. Auth is HTTP basic
    // with Account SID + Auth Token; stage 3 adds the proxy that handles auth.
    await supabase.from('call_logs').update({
      recording_url: recordingUrl + '.mp3',
      recording_duration: recordingDuration,
    }).eq('twilio_sid', callSid).then(r => {
      if (r.error) console.warn('[Spartan] call_logs recording update failed (sid=' + callSid + '):', r.error.message);
    });
  }

  res.status(204).end();
}
