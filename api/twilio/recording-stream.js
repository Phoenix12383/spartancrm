// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twilio/recording-stream?sid=<callSid> — auth proxy for recordings.
//
// The browser can't fetch Twilio recordings directly because they require
// HTTP Basic auth with the Account SID + Auth Token, and we never want to
// ship the Auth Token to the browser. This proxy:
//
//   1. Verifies the rep is signed in (Google access token)
//   2. Looks up the call_logs row by Twilio CallSid
//   3. Permission-gates: admin sees all recordings; non-admins only their own
//   4. Fetches the recording from Twilio with Basic auth applied server-side
//   5. Streams the audio bytes back to the browser
//
// Browser usage: fetch() with Authorization: Bearer + Google token, then
// URL.createObjectURL(blob) to feed an <audio> tag. We don't use a plain
// <audio src="…"> attribute because the browser won't add headers to that
// request type — there's no way to authenticate it.
// ─────────────────────────────────────────────────────────────────────────────

import { verifyGoogleAndLookupUser } from '../_lib/auth.js';
import { getServerSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth — same pattern as /token and /sms
  const auth = await verifyGoogleAndLookupUser(req);
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const user = auth.user;

  // CallSid comes from query string. Reject if missing.
  const callSid = req.query && req.query.sid ? String(req.query.sid).trim() : '';
  if (!callSid || !/^[A-Z0-9]+$/i.test(callSid)) {
    res.status(400).json({ error: 'Missing or invalid sid' });
    return;
  }

  // Look up the call_logs row to get the recording URL + verify ownership
  const supabase = getServerSupabase();
  const { data: row, error: dbErr } = await supabase
    .from('call_logs')
    .select('twilio_sid, recording_url, user_id, entity_type, entity_id, direction')
    .eq('twilio_sid', callSid)
    .maybeSingle();

  if (dbErr) {
    res.status(500).json({ error: 'Database lookup failed' });
    return;
  }
  if (!row) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }
  if (!row.recording_url) {
    res.status(404).json({ error: 'Recording not yet processed' });
    return;
  }

  // Permission gate: admin sees all, others only their own outbound calls and
  // inbound calls that landed on records they have access to. For v1 we use a
  // simple proxy: admin OR (recording's user_id matches the rep). Inbound calls
  // without a user_id (which is most of them — only the answering rep gets
  // bound) are visible to anyone with phone.access until stage 6 adds the
  // recordings.own / .team / .all subdivision.
  const isAdmin = user.role === 'admin';
  const isOwn = row.user_id && row.user_id === user.id;
  const isUnboundInbound = row.direction === 'inbound' && !row.user_id;
  if (!isAdmin && !isOwn && !isUnboundInbound) {
    res.status(403).json({ error: 'You do not have permission to access this recording' });
    return;
  }

  // Fetch the recording from Twilio with Basic auth
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    res.status(500).json({ error: 'Backend misconfigured: Twilio credentials not set' });
    return;
  }
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  let twilioResp;
  try {
    twilioResp = await fetch(row.recording_url, {
      headers: { Authorization: `Basic ${basic}` },
    });
  } catch (e) {
    console.error('[Spartan] Recording proxy fetch failed:', e && e.message ? e.message : e);
    res.status(502).json({ error: 'Failed to fetch recording from Twilio' });
    return;
  }

  if (!twilioResp.ok) {
    console.warn('[Spartan] Twilio recording fetch returned ' + twilioResp.status);
    res.status(twilioResp.status).json({ error: 'Twilio rejected the recording fetch' });
    return;
  }

  // Forward content-type + length, then stream the bytes back. For typical call
  // recordings (a few minutes of MP3 at 32kbps, ~1MB) buffering the whole
  // response is fine — keeps the proxy stateless and the browser's blob path
  // simple. If recordings get long we can switch to a Node Readable later.
  const contentType = twilioResp.headers.get('content-type') || 'audio/mpeg';
  const buf = Buffer.from(await twilioResp.arrayBuffer());
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 'private, max-age=300'); // 5min browser cache
  res.status(200).send(buf);
}
