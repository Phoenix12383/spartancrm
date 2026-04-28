// ─────────────────────────────────────────────────────────────────────────────
// DocuSign JWT auth helper
// ─────────────────────────────────────────────────────────────────────────────
// Implements DocuSign's JSON Web Token (JWT) Grant flow:
//   1. Build a signed JWT with the integration key + user GUID + RSA private key
//   2. Exchange the JWT at /oauth/token for a short-lived access token
//   3. Use the access token in Authorization: Bearer <token> headers on API calls
//
// Sandbox endpoints:
//   AUTH:  https://account-d.docusign.com
//   API:   https://demo.docusign.net/restapi
//
// Production endpoints:
//   AUTH:  https://account.docusign.com
//   API:   https://www.docusign.net/restapi  (may differ per account region)
//
// Required env vars (set via `supabase secrets set ...`):
//   DOCUSIGN_INTEGRATION_KEY  — GUID
//   DOCUSIGN_USER_ID          — API user GUID (whose RSA key signs the JWT)
//   DOCUSIGN_AUTH_BASE_URL    — auth host (defaults to sandbox)
//   DOCUSIGN_PRIVATE_KEY      — full RSA private key including BEGIN/END lines
// ─────────────────────────────────────────────────────────────────────────────

interface AccessTokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

// Module-level cache so repeated invocations within the same Edge Function
// instance reuse the access token until ~60s before expiry.
let _tokenCache: AccessTokenCache | null = null;

function _b64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// Convert a PEM-formatted RSA private key into a CryptoKey usable by Web Crypto.
async function _importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const cleanPem = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const binaryDer = Uint8Array.from(atob(cleanPem), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// Build a signed JWT for DocuSign's token endpoint.
async function _buildAssertion(): Promise<string> {
  const integrationKey = Deno.env.get('DOCUSIGN_INTEGRATION_KEY');
  const userId = Deno.env.get('DOCUSIGN_USER_ID');
  const authHost = (Deno.env.get('DOCUSIGN_AUTH_BASE_URL') || 'https://account-d.docusign.com')
    .replace(/^https?:\/\//, '');
  const privateKeyPem = Deno.env.get('DOCUSIGN_PRIVATE_KEY');
  if (!integrationKey) throw new Error('DOCUSIGN_INTEGRATION_KEY not set');
  if (!userId) throw new Error('DOCUSIGN_USER_ID not set');
  if (!privateKeyPem) throw new Error('DOCUSIGN_PRIVATE_KEY not set');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: integrationKey,
    sub: userId,
    iat: now,
    exp: now + 3600,
    aud: authHost,
    scope: 'signature impersonation',
  };

  const encHeader = _b64UrlEncode(_strToBytes(JSON.stringify(header)));
  const encPayload = _b64UrlEncode(_strToBytes(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;

  const key = await _importRsaPrivateKey(privateKeyPem);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, _strToBytes(signingInput));
  const encSig = _b64UrlEncode(new Uint8Array(sigBuf));

  return `${signingInput}.${encSig}`;
}

// Exchange the JWT for an access token. Caches in memory until expiry.
export async function getDocuSignAccessToken(): Promise<string> {
  if (_tokenCache && _tokenCache.expiresAt - 60_000 > Date.now()) {
    return _tokenCache.token;
  }
  const assertion = await _buildAssertion();
  const authHost = Deno.env.get('DOCUSIGN_AUTH_BASE_URL') || 'https://account-d.docusign.com';
  const resp = await fetch(`${authHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`,
  });
  const json = await resp.json();
  if (!resp.ok) {
    // Common error: consent_required → user hasn't granted impersonation consent
    throw new Error(`DocuSign token exchange failed: ${resp.status} ${JSON.stringify(json)}`);
  }
  if (!json.access_token) throw new Error('No access_token in DocuSign response: ' + JSON.stringify(json));
  _tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + ((json.expires_in || 3600) * 1000),
  };
  return _tokenCache.token;
}

export function getDocuSignApiBase(): string {
  return Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net/restapi';
}

export function getDocuSignAccountId(): string {
  const id = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
  if (!id) throw new Error('DOCUSIGN_ACCOUNT_ID not set');
  return id;
}
