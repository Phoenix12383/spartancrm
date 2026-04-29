// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email/send — outbound email from the Capacitor mobile wrapper.
//
// Auth:  Authorization: Bearer <google-id-token>  (verified via tokeninfo).
// Body:  { to, subject, body, cc?, entityId, entityType }
// Sends: Gmail API on behalf of the rep, using a Workspace service account
//        with domain-wide delegation. Each rep's email genuinely appears
//        From: <rep@spartandoubleglazing.com.au> in the recipient's inbox.
//
// Logs:  inserts a row into email_sent and writes an 'email' activity on the
//        deal/lead — same shape the desktop gmailSend produces, so timeline
//        and tracking-pixel opens both work consistently.
//
// Env vars required (set in Vercel after the admin generates the key):
//   GOOGLE_SERVICE_ACCOUNT_BASE64 — the downloaded JSON key, base64-encoded
//   GOOGLE_CLIENT_ID              — the OAuth client used by the wrapper
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — already used by other endpoints
//
// Until GOOGLE_SERVICE_ACCOUNT_BASE64 is set, the endpoint returns 500 with
// a clear "env var not set" message — the mobile compose modal surfaces that
// in a toast. The rest of the app keeps working.
// ─────────────────────────────────────────────────────────────────────────────

import { createSign } from 'crypto';
import { getServerSupabase } from '../_lib/supabase.js';
import { verifyGoogleIdTokenAndLookupUser } from '../_lib/auth.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL   = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Decode the base64-encoded service account JSON from env. Cached after the
// first call so we don't re-decode on every request.
let _saCache = null;
function getServiceAccount() {
  if (_saCache) return _saCache;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_BASE64 env var not set');
  const json = Buffer.from(b64, 'base64').toString('utf-8');
  _saCache = JSON.parse(json);
  return _saCache;
}

// Sign a JWT with the service account's private key, then exchange it at
// Google's token endpoint for a Gmail-scoped access token impersonating
// `subjectEmail`. Each call mints a fresh 1-hour token — no caching needed
// at this scale; an email send is an interactive action.
async function getImpersonatedAccessToken(subjectEmail) {
  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
    sub: subjectEmail,                  // domain-wide-delegation impersonation
  };
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };

  const b64url = (buf) => Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = b64url(JSON.stringify(header));
  const claimB64  = b64url(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;

  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(sa.private_key);
  const sigB64 = signature.toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signingInput}.${sigB64}`;

  const tokRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokRes.ok) {
    const text = await tokRes.text();
    throw new Error(`Token exchange failed (${tokRes.status}): ${text}`);
  }
  const tok = await tokRes.json();
  if (!tok.access_token) throw new Error('Token exchange returned no access_token');
  return tok.access_token;
}

// Build an RFC 822 message ready for base64url encoding into Gmail's raw-
// message API. Mirrors the desktop gmailSend single-part path: HTML body
// with newlines→<br> and an open-tracking pixel appended.
function buildRfc822({ to, cc, fromEmail, fromName, subject, body, sentId, userId }) {
  const trackingPixel = `<img src="https://spaartan.tech/api/track?id=${encodeURIComponent(sentId)}&uid=${encodeURIComponent(userId || '')}" width="1" height="1" alt="" style="display:none !important;opacity:0" />`;
  const htmlBody = (body || '').replace(/\r?\n/g, '<br>') + trackingPixel;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `From: ${fromHeader}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].filter(Boolean);
  return lines.join('\r\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth — wrapper signs in via @capgo/capacitor-social-login and persists
  // the resulting Google idToken in localStorage. Mobile sends it as
  // Authorization: Bearer <idToken>; we verify against tokeninfo and pull
  // the matching Spartan user. The endpoint then impersonates that same
  // email via the service account + domain-wide delegation.
  const auth = await verifyGoogleIdTokenAndLookupUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const user = auth.user;
  const fromEmail = user.email;

  const { to, cc, subject, body, entityId, entityType } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject and body are required' });
  }

  // Mint an impersonated access token. Errors here are configuration
  // problems (env var missing, domain-wide-delegation not authorised in
  // Workspace, wrong scopes) — bubble them up so the mobile toast surfaces
  // the actual cause.
  let accessToken;
  try {
    accessToken = await getImpersonatedAccessToken(fromEmail);
  } catch (e) {
    console.error('[/api/email/send] token exchange failed:', e.message);
    return res.status(500).json({ error: 'Email service auth failed: ' + e.message });
  }

  // Pre-allocate the email_sent id so the tracking-pixel URL inside the
  // body matches the row we'll insert below — same trick as desktop.
  const sentId = 'es' + Date.now();
  const raw822 = buildRfc822({
    to, cc, fromEmail, fromName: user.name,
    subject, body, sentId, userId: user.id,
  });
  const rawB64 = Buffer.from(raw822, 'utf-8').toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  let gmailMsgId = null;
  try {
    const sendRes = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawB64 }),
    });
    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error('[/api/email/send] gmail.send failed:', sendRes.status, errText);
      return res.status(502).json({ error: 'Gmail send failed', detail: errText });
    }
    const sent = await sendRes.json();
    gmailMsgId = sent.id || null;
  } catch (e) {
    console.error('[/api/email/send] gmail.send threw:', e.message);
    return res.status(502).json({ error: 'Gmail send failed: ' + e.message });
  }

  // Persist email_sent row + activity. Best-effort — the email is already
  // sent; if these fail we still return 200 but include warnings. Realtime
  // subscribers (desktop, other wrappers) pick the row up on success.
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const supabase = getServerSupabase();
  const warnings = [];

  try {
    const { error: e1 } = await supabase.from('email_sent').insert({
      id: sentId,
      to_addr: to, to_name: '',
      subject, body: (body || '').slice(0, 200),
      date: dateStr, time: timeStr,
      by_user: user.name,
      gmail_msg_id: gmailMsgId,
      deal_id: entityType === 'deal' ? entityId : null,
      lead_id: entityType === 'lead' ? entityId : null,
      contact_id: entityType === 'contact' ? entityId : null,
      entity_type: entityType || '', entity_id: entityId || '',
      opened: false, opens: 0, clicked: false,
    });
    if (e1) warnings.push('email_sent log: ' + e1.message);
  } catch (e) { warnings.push('email_sent log: ' + e.message); }

  if (entityId && entityType) {
    try {
      const { error: e2 } = await supabase.from('activities').insert({
        id: 'a' + Date.now(),
        entity_type: entityType, entity_id: entityId,
        type: 'email', subject, text: body,
        by_user: user.name, date: dateStr, time: timeStr,
        to_addr: to, cc: cc || '',
        gmail_msg_id: gmailMsgId,
        opens: 0, opened: false, clicked: false,
        done: false, due_date: '',
      });
      if (e2) warnings.push('activity log: ' + e2.message);
    } catch (e) { warnings.push('activity log: ' + e.message); }
  }

  return res.status(200).json({
    ok: true, sentId, gmailMsgId,
    warnings: warnings.length ? warnings : undefined,
  });
}
