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
