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

// Wrap a PKCS#1 RSA private key in a PKCS#8 envelope so Web Crypto can import
// it. DocuSign hands out PKCS#1 keys (BEGIN RSA PRIVATE KEY) but Web Crypto's
// importKey only accepts PKCS#8 (BEGIN PRIVATE KEY) for RSA. We wrap by hand
// rather than depending on a library so the function stays small.
function _pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  // AlgorithmIdentifier { OID rsaEncryption (1.2.840.113549.1.1.1), NULL }
  const algoIdent = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);

  function encLen(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len]);
    if (len < 0x100) return new Uint8Array([0x81, len]);
    if (len < 0x10000) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
    return new Uint8Array([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  // OCTET STRING wrapping the PKCS#1 DER bytes
  const octetLen = encLen(pkcs1Der.length);
  const octet = new Uint8Array(1 + octetLen.length + pkcs1Der.length);
  octet[0] = 0x04;
  octet.set(octetLen, 1);
  octet.set(pkcs1Der, 1 + octetLen.length);

  // Outer SEQUENCE { INTEGER 0, AlgorithmIdentifier, OCTET STRING }
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const innerLen = version.length + algoIdent.length + octet.length;
  const seqLen = encLen(innerLen);
  const out = new Uint8Array(1 + seqLen.length + innerLen);
  out[0] = 0x30;
  out.set(seqLen, 1);
  let off = 1 + seqLen.length;
  out.set(version, off); off += version.length;
  out.set(algoIdent, off); off += algoIdent.length;
  out.set(octet, off);
  return out;
}

// Convert a PEM-formatted RSA private key into a CryptoKey usable by Web Crypto.
// Accepts both PKCS#1 (BEGIN RSA PRIVATE KEY) and PKCS#8 (BEGIN PRIVATE KEY).
async function _importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(pem);
  const cleanPem = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  let der = Uint8Array.from(atob(cleanPem), (c) => c.charCodeAt(0));
  if (isPkcs1) der = _pkcs1ToPkcs8(der);
  return await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
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
