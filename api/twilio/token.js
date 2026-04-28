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

const TOKEN_TTL_SECONDS = 3600; // 1 hour — matches Twilio's max for AccessToken

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
