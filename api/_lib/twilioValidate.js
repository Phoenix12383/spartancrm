// ─────────────────────────────────────────────────────────────────────────────
// Twilio webhook signature verification (X-Twilio-Signature).
//
// Every Twilio webhook hits our /api/twilio/* endpoints with an HMAC-SHA1
// signature in the X-Twilio-Signature header, computed over the full URL +
// sorted form parameters using TWILIO_AUTH_TOKEN as the key. Without this
// check, anyone on the internet can POST fake call/SMS data into the CRM.
//
// Apply to every route except /token and /sms — those use Google access-token
// auth instead, since they're called by the browser, not by Twilio.
// ─────────────────────────────────────────────────────────────────────────────

import { twilio } from './twilioClient.js';

export function validateTwilioRequest(req, body) {
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[Twilio] Cannot validate signature — TWILIO_AUTH_TOKEN missing');
    return false;
  }

  // Reconstruct the public URL Twilio would have computed when signing.
  // On Vercel, x-forwarded-proto/host carry the externally-visible values
  // even when the function runs behind their proxy.
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${proto}://${host}${req.url}`;

  return twilio.validateRequest(authToken, signature, url, body || {});
}
