// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email/send — outbound email from the Capacitor mobile wrapper.
//
// Auth:  Authorization: Bearer <google-id-token>  (verified via tokeninfo).
// Body:  { to, subject, body, cc?, entityId, entityType }
// Sends: Gmail SMTP using a single shared Workspace account + App Password.
//        The rep's name appears in the From display name; the rep's actual
//        Gmail address goes in Reply-To so customer replies route to the
//        right person directly.
//
// Service-account approach blocked by the iam.disableServiceAccountKeyCreation
// org policy. SMTP + App Password works around this without GCP changes.
//
// Logs:  inserts a row into email_sent and writes an 'email' activity on the
//        deal/lead — same shape the desktop gmailSend produces, so timeline
//        and tracking-pixel opens both work consistently.
//
// Env vars required (set in Vercel):
//   GMAIL_USER          — the shared sender Gmail (e.g. sales@…com.au)
//   GMAIL_APP_PASSWORD  — 16-char App Password generated for that account
//   GOOGLE_CLIENT_ID    — the OAuth client used by the wrapper (id-token aud)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — already used by other endpoints
// ─────────────────────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';
import { getServerSupabase } from '../_lib/supabase.js';
import { verifyGoogleIdTokenAndLookupUser } from '../_lib/auth.js';

// Cached transporter — Vercel keeps the function warm for short bursts so
// re-using one connection avoids the 200ms SSL handshake per request.
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars required');
  }
  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,                       // SSL — Gmail also accepts STARTTLS on 587
    auth: { user, pass },
  });
  return _transporter;
}

// Builds the HTML body with the same open-tracking pixel pattern desktop's
// gmailSend uses — opens flow into the email_sent.opens column via
// /api/track and surface in the desktop activity timeline + email page.
function buildHtmlBody({ body, sentId, userId }) {
  const trackingPixel = `<img src="https://spaartan.tech/api/track?id=${encodeURIComponent(sentId)}&uid=${encodeURIComponent(userId || '')}" width="1" height="1" alt="" style="display:none !important;opacity:0" />`;
  return (body || '').replace(/\r?\n/g, '<br>') + trackingPixel;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth — wrapper signs in via @capgo/capacitor-social-login and persists
  // the resulting Google idToken in localStorage. Mobile sends it as
  // Authorization: Bearer <idToken>; we verify against tokeninfo and pull
  // the matching Spartan user.
  const auth = await verifyGoogleIdTokenAndLookupUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const user = auth.user;

  const { to, cc, subject, body, entityId, entityType } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject and body are required' });
  }

  // Shape the sender for clarity. Recipient sees:
  //   From:  "James Wilson — Spartan Double Glazing" <sales@…>
  //   Reply-To: james@spartandoubleglazing.com.au
  // So they identify the rep, can reply directly to the rep, but our shared
  // sender account stays in control of the outbound mail.
  const sharedSender = process.env.GMAIL_USER;
  const fromHeader = `"${user.name} — Spartan Double Glazing" <${sharedSender}>`;

  // Pre-allocate the email_sent id so the tracking pixel URL inside the
  // body matches the row we'll insert below — same trick desktop uses.
  const sentId = 'es' + Date.now();

  let messageId = null;
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: fromHeader,
      to, cc: cc || undefined,
      replyTo: user.email,
      subject,
      html: buildHtmlBody({ body, sentId, userId: user.id }),
    });
    messageId = info.messageId || null;
  } catch (e) {
    console.error('[/api/email/send] SMTP send failed:', e.message);
    return res.status(502).json({ error: 'Send failed: ' + e.message });
  }

  // Persist email_sent row + activity. Best-effort — if these fail the email
  // already went out, so we still return 200 but include warnings. Realtime
  // subscribers (desktop, other wrappers) pick the row up automatically.
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
      gmail_msg_id: messageId,
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
        gmail_msg_id: messageId,
        opens: 0, opened: false, clicked: false,
        done: false, due_date: '',
      });
      if (e2) warnings.push('activity log: ' + e2.message);
    } catch (e) { warnings.push('activity log: ' + e.message); }
  }

  return res.status(200).json({
    ok: true, sentId, messageId,
    warnings: warnings.length ? warnings : undefined,
  });
}
