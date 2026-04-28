// ─────────────────────────────────────────────────────────────────────────────
// Server-side Twilio client + raw SDK exports.
//
// `getTwilioClient()` returns an authenticated REST client (used to send SMS,
// fetch recordings, etc.). `twilio` is the raw SDK namespace — needed for
// jwt.AccessToken construction in /token and for validateRequest() in the
// webhook signature middleware.
// ─────────────────────────────────────────────────────────────────────────────

import twilio from 'twilio';

let _client = null;

export function getTwilioClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars must both be set');
  }
  _client = twilio(sid, authToken);
  return _client;
}

export { twilio };
