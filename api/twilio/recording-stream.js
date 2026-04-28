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

// Backend-side mirror of the browser's hasPermission. The user record
// returned from auth lookup doesn't include custom_perms (we'd add it to the
// select if recordings.team adoption gets wider — for v1 we infer perms from
// the role and assume defaults aren't customised on a per-user basis for the
// recordings.* subkeys).
function hasPerm(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const defaults = ROLE_DEFAULT_PERMS[user.role] || [];
  return defaults.indexOf(key) >= 0;
}

const ROLE_DEFAULT_PERMS = {
  // Mirrors DEFAULT_ROLE_PERMS in modules/05-state-auth-rbac.js for the
  // phone.recordings.* keys. Browser-side has the canonical list; this is
  // the minimal projection the proxy needs.
  admin:           ['phone.recordings.all'],
  sales_manager:   ['phone.recordings.team', 'phone.recordings.own'],
  sales_rep:       ['phone.recordings.own'],
  accounts:        ['phone.recordings.own'],
  service_staff:   ['phone.recordings.own'],
  production_manager: [],
  production_staff: [],
  installer: [],
  viewer: [],
};

// Two reps are in the "same team" when they're in the same role family.
// sales_manager + sales_rep count together so a sales manager can hear their
// reps' calls. service_staff and accounts are singletons.
function sameRoleFamily(roleA, roleB) {
  if (roleA === roleB) return true;
  const salesRoles = ['sales_rep', 'sales_manager'];
  if (salesRoles.includes(roleA) && salesRoles.includes(roleB)) return true;
  return false;
}

async function fetchUserRole(supabase, userId) {
  const { data, error } = await supabase
    .from('users').select('role').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data.role;
}

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

  // Permission gate (stage 6 RBAC subdivisions):
  //   phone.recordings.all   → any recording (admin)
  //   phone.recordings.team  → calls placed/answered by anyone in the same
  //                            role family (sales_manager hears all sales_*)
  //   phone.recordings.own   → only the rep's own user_id matches
  //   (no perm)              → only unbound-inbound (no rep ever picked up)
  //                            calls are visible — these are nobody's calls,
  //                            anyone with phone.access can listen.
  let allowed = false;
  if (user.role === 'admin' || hasPerm(user, 'phone.recordings.all')) {
    allowed = true;
  } else if (row.user_id && row.user_id === user.id) {
    // Own recording — covered by phone.recordings.own (or .team / .all)
    allowed = hasPerm(user, 'phone.recordings.own') || hasPerm(user, 'phone.recordings.team') || hasPerm(user, 'phone.recordings.all');
  } else if (row.user_id && hasPerm(user, 'phone.recordings.team')) {
    // Team recording — verify the call's user is in the same role family.
    // We resolve the role family from a small lookup; sales_rep+sales_manager
    // count as the same family.
    const otherRole = await fetchUserRole(supabase, row.user_id);
    if (otherRole && sameRoleFamily(user.role, otherRole)) allowed = true;
  } else if (row.direction === 'inbound' && !row.user_id) {
    // Unbound inbound — no rep ever owned this call. Anyone with phone.access
    // can listen, as a fallback path for missed-call recovery.
    allowed = true;
  }
  if (!allowed) {
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
