// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twilio/token — issue a Twilio Voice SDK access token.
//
// Flow:
//   1. Browser sends its Google OAuth access token in `Authorization: Bearer …`
//   2. We verify it with Google's tokeninfo endpoint
//   3. We resolve the email back to a Spartan user row in public.users
//   4. We sign a 1-hour Twilio JWT with VoiceGrant pointing at our TwiML App
//   5. Return { token, identity, expiresAt }
//
// The browser stores the JWT in memory only (never localStorage — it's a real
// bearer credential that lets anyone holding it place calls billed to our
// Twilio account for the duration of the TTL).
// ─────────────────────────────────────────────────────────────────────────────

import { twilio } from '../_lib/twilioClient.js';
import { verifyGoogleAndLookupUser } from '../_lib/auth.js';
import { getServerSupabase } from '../_lib/supabase.js';

const TOKEN_TTL_SECONDS = 3600; // 1 hour — matches Twilio's max for AccessToken
const TOKEN_MIN_INTERVAL_MS = 5000; // Reject tokens issued less than 5s apart

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Step 1+2+3: verify Google token and resolve Spartan user
  const auth = await verifyGoogleAndLookupUser(req);
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const user = auth.user;

  // Rate-limit: reject if a token was issued for this user less than
  // TOKEN_MIN_INTERVAL_MS ago. Stops a leaked Google token from being used to
  // burn through the Twilio balance via repeated /token issuance. Anchored on
  // users.last_token_issued_at — a single column update per request.
  const supabase = getServerSupabase();
  const nowMs = Date.now();
  if (user.last_token_issued_at) {
    const lastMs = new Date(user.last_token_issued_at).getTime();
    if (!isNaN(lastMs) && (nowMs - lastMs) < TOKEN_MIN_INTERVAL_MS) {
      const retryAfterSec = Math.ceil((TOKEN_MIN_INTERVAL_MS - (nowMs - lastMs)) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: 'Too many token requests — wait a moment and try again' });
      return;
    }
  }
  // Record this issuance. Fire-and-forget — we don't need to wait for it to
  // succeed before issuing the JWT (worst case the rate-limit doesn't apply
  // for this one request, which is fine for a per-rep ceiling).
  supabase.from('users').update({ last_token_issued_at: new Date(nowMs).toISOString() }).eq('id', user.id).then(r => {
    if (r.error) console.warn('[Spartan] last_token_issued_at update failed:', r.error.message);
  });

  // Step 4: build the Twilio AccessToken with a VoiceGrant
  const requiredEnv = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID'];
  for (const name of requiredEnv) {
    if (!process.env[name]) {
      res.status(500).json({ error: `Backend misconfigured: ${name} not set` });
      return;
    }
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const identity = `spartan_${user.id}`;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY_SID,
    process.env.TWILIO_API_KEY_SECRET,
    { identity, ttl: TOKEN_TTL_SECONDS }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  });
  token.addGrant(voiceGrant);

  res.status(200).json({
    token: token.toJwt(),
    identity,
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
}
