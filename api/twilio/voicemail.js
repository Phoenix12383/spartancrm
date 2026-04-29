// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/voicemail — voicemail recording receiver.
//
// Twilio calls this when the customer's <Record> finishes (caller hung up,
// hit max length, or paused for the silence timeout). We mark the call_logs
// row as a voicemail so the timeline / phone-page UI (stage 5) can surface
// it differently from regular call recordings.
//
// The actual audio file URL is delivered separately via the
// recordingStatusCallback (/api/twilio/recording) — Twilio fires both
// callbacks when a recording completes, hitting voicemail first to confirm
// the recording exists, then recording for the processed asset.
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

  if (callSid) {
    const supabase = getServerSupabase();
    const updates = { status: 'voicemail' };
    if (recordingUrl) {
      updates.recording_url = recordingUrl + '.mp3';
      updates.recording_duration = recordingDuration;
    }
    await supabase.from('call_logs').update(updates).eq('twilio_sid', callSid).then(r => {
      if (r.error) console.warn('[Spartan] voicemail update failed (sid=' + callSid + '):', r.error.message);
    });
  }

  // Quick TwiML to confirm receipt — Twilio's <Record> action expects a
  // TwiML response; we just hang up cleanly.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml);
}
