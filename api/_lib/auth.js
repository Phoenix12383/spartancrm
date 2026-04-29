// ─────────────────────────────────────────────────────────────────────────────
// Google access-token verification + Spartan user lookup.
//
// Used by the Twilio backend endpoints that browsers call directly (e.g. the
// /token issuer). The browser sends its existing Google OAuth access token
// (from the same Sign-In flow used by the Gmail integration) in the
// Authorization: Bearer ... header. We verify it with Google's tokeninfo
// endpoint, then resolve the email back to a Spartan user row.
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSupabase } from './supabase.js';

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

// Verify a Google access token and resolve the matching Spartan user.
// On success: { user, email, status: 200 }
// On failure: { error: '...', status: 401 | 403 }
export async function verifyGoogleAndLookupUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or malformed Authorization header', status: 401 };
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return { error: 'Empty bearer token', status: 401 };
  }

  // Step 1: verify the token with Google
  let tokenInfo;
  try {
    const resp = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
    if (!resp.ok) {
      return { error: 'Invalid Google access token', status: 401 };
    }
    tokenInfo = await resp.json();
  } catch (e) {
    return { error: 'Google token verification failed: ' + e.message, status: 401 };
  }

  // Audience pinning — optional, but tightens security when GOOGLE_CLIENT_ID
  // is set in env. Without this an attacker with any valid Google access token
  // (issued for any app) can hit our endpoints if they happen to know an
  // email registered as a Spartan user.
  if (process.env.GOOGLE_CLIENT_ID && tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
    return { error: 'Token issued for a different application', status: 401 };
  }

  if (!tokenInfo.email) {
    return { error: 'Google token has no associated email', status: 401 };
  }

  // tokeninfo returns exp in seconds. Belt-and-braces — Google would have
  // already rejected an expired token, but we double-check.
  if (tokenInfo.exp && Number(tokenInfo.exp) * 1000 < Date.now()) {
    return { error: 'Google token expired', status: 401 };
  }

  // Step 2: resolve email -> Spartan user
  const supabase = getServerSupabase();
  const { data: user, error: dbErr } = await supabase
    .from('users')
    .select('id, name, email, role, branch, active, last_token_issued_at')
    .ilike('email', tokenInfo.email)
    .maybeSingle();

  if (dbErr) {
    return { error: 'User lookup failed: ' + dbErr.message, status: 500 };
  }
  if (!user) {
    return { error: 'Email not registered in Spartan CRM', status: 403 };
  }
  if (user.active === false) {
    return { error: 'User account is deactivated', status: 403 };
  }

  return { user, email: tokenInfo.email, status: 200 };
}

// Verify a Google ID token (signed JWT) and resolve the matching Spartan user.
// Used by mobile-wrapper endpoints — the wrapper's @capgo/capacitor-social-login
// flow returns an idToken (not a Gmail-scoped access token) at sign-in. The
// idToken is sufficient cryptographic proof of identity for backend auth.
//
// Same return shape as verifyGoogleAndLookupUser:
//   On success: { user, email, status: 200 }
//   On failure: { error: '...', status: 401 | 403 }
export async function verifyGoogleIdTokenAndLookupUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or malformed Authorization header', status: 401 };
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return { error: 'Empty bearer token', status: 401 };
  }

  // Google's tokeninfo accepts an id_token query param and validates the
  // signature + expiry on its side. Saves us from JWKS fetching + RS256
  // verification in-process. Slight extra latency (~80ms) is acceptable for
  // an outbound-email endpoint that already takes 500ms+ for the Gmail call.
  let info;
  try {
    const resp = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
    if (!resp.ok) return { error: 'Invalid Google ID token', status: 401 };
    info = await resp.json();
  } catch (e) {
    return { error: 'Google ID token verification failed: ' + e.message, status: 401 };
  }

  // Audience must match the Google Client ID the wrapper signs in with —
  // prevents replaying an ID token issued for a different app.
  const expectedAud = process.env.GOOGLE_CLIENT_ID
    || '54203725419-2ad869ea9p81lcmf6osm5htos0maoepl.apps.googleusercontent.com';
  if (info.aud !== expectedAud) {
    return { error: 'ID token issued for a different application', status: 401 };
  }
  if (!info.email_verified || info.email_verified === 'false') {
    return { error: 'Google email not verified', status: 401 };
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    return { error: 'Google ID token expired', status: 401 };
  }
  if (!info.email) {
    return { error: 'ID token has no associated email', status: 401 };
  }

  const supabase = getServerSupabase();
  const { data: user, error: dbErr } = await supabase
    .from('users')
    .select('id, name, email, role, branch, active')
    .ilike('email', info.email)
    .maybeSingle();
  if (dbErr) return { error: 'User lookup failed: ' + dbErr.message, status: 500 };
  if (!user) return { error: 'Email not registered in Spartan CRM', status: 403 };
  if (user.active === false) return { error: 'User account is deactivated', status: 403 };

  return { user, email: info.email, status: 200 };
}
