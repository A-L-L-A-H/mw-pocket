export interface OidcDiscoveryDocument {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly revocation_endpoint?: string;
  readonly userinfo_endpoint?: string;
  readonly code_challenge_methods_supported?: readonly string[];
}

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
}

export interface AuthorizationUrlParams {
  readonly discovery: OidcDiscoveryDocument;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly nonce?: string;
}

export interface TokenExchangeParams {
  readonly discovery: OidcDiscoveryDocument;
  readonly clientId: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
  readonly fetchImpl?: typeof fetch;
}

export interface TokenRefreshParams {
  readonly discovery: OidcDiscoveryDocument;
  readonly clientId: string;
  readonly refreshToken: string;
  readonly fetchImpl?: typeof fetch;
}

export interface TokenRevokeParams {
  readonly discovery: OidcDiscoveryDocument;
  readonly clientId: string;
  readonly token: string;
  readonly tokenTypeHint?: "access_token" | "refresh_token";
  readonly fetchImpl?: typeof fetch;
}

export interface OidcTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly id_token?: string;
  readonly scope?: string;
}

const PKCE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rightRotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Pure(inputBytes: Uint8Array): Uint8Array {
  const bitLength = inputBytes.length * 8;
  const paddedLength = Math.ceil((inputBytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(inputBytes);
  padded[inputBytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let wordIdx = 0; wordIdx < 16; wordIdx += 1) {
      schedule[wordIdx] = view.getUint32(offset + wordIdx * 4, false);
    }
    for (let wordIdx = 16; wordIdx < 64; wordIdx += 1) {
      const s0 =
        rightRotate(schedule[wordIdx - 15], 7) ^
        rightRotate(schedule[wordIdx - 15], 18) ^
        (schedule[wordIdx - 15] >>> 3);
      const s1 =
        rightRotate(schedule[wordIdx - 2], 17) ^
        rightRotate(schedule[wordIdx - 2], 19) ^
        (schedule[wordIdx - 2] >>> 10);
      schedule[wordIdx] = (schedule[wordIdx - 16] + s0 + schedule[wordIdx - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let round = 0; round < 64; round += 1) {
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choose + SHA256_K[round] + schedule[round]) >>> 0;
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0, false);
  digestView.setUint32(4, h1, false);
  digestView.setUint32(8, h2, false);
  digestView.setUint32(12, h3, false);
  digestView.setUint32(16, h4, false);
  digestView.setUint32(20, h5, false);
  digestView.setUint32(24, h6, false);
  digestView.setUint32(28, h7, false);
  return digest;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  let idx = 0;
  while (idx < bytes.length) {
    const byte0 = bytes[idx++];
    const hasByte1 = idx < bytes.length;
    const byte1 = hasByte1 ? bytes[idx++] : 0;
    const hasByte2 = idx < bytes.length;
    const byte2 = hasByte2 ? bytes[idx++] : 0;

    const triple = (byte0 << 16) | (byte1 << 8) | byte2;
    output += alphabet[(triple >>> 18) & 0x3f];
    output += alphabet[(triple >>> 12) & 0x3f];
    if (hasByte1) {
      output += alphabet[(triple >>> 6) & 0x3f];
    }
    if (hasByte2) {
      output += alphabet[triple & 0x3f];
    }
  }
  return output;
}

function base64UrlDecodeToString(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  if (typeof atob === "function") {
    return atob(padded);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

export function generateCodeVerifier(length = 64): string {
  if (length < 43 || length > 128) {
    throw new Error("RFC 7636 code_verifier length must be between 43 and 128 characters.");
  }
  const randomBytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(randomBytes);
  } else {
    for (let idx = 0; idx < length; idx += 1) {
      randomBytes[idx] = Math.floor(Math.random() * 256);
    }
  }
  let verifier = "";
  for (let idx = 0; idx < length; idx += 1) {
    verifier += PKCE_CHARSET[randomBytes[idx] % PKCE_CHARSET.length];
  }
  return verifier;
}

export async function deriveCodeChallengeS256(codeVerifier: string): Promise<string> {
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    throw new Error("Invalid RFC 7636 code_verifier length.");
  }
  const encoded = new TextEncoder().encode(codeVerifier);
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined" &&
    typeof globalThis.crypto.subtle.digest === "function"
  ) {
    const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return base64UrlEncode(new Uint8Array(digestBuffer));
  }
  return base64UrlEncode(sha256Pure(encoded));
}

export async function createPkcePair(length = 64): Promise<PkcePair> {
  const codeVerifier = generateCodeVerifier(length);
  const codeChallenge = await deriveCodeChallengeS256(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256"
  };
}

export function assertValidJwtHeaderAndIssuer(jwtToken: string, expectedIssuer?: string): void {
  const segments = jwtToken.split(".");
  if (segments.length !== 3) {
    throw new Error("ADR-001 violation: malformed JWT structure.");
  }
  const headerJson = JSON.parse(base64UrlDecodeToString(segments[0])) as { alg?: string };
  if (!headerJson.alg || headerJson.alg.toLowerCase() === "none") {
    throw new Error("ADR-001 violation: JWT alg=none is strictly rejected.");
  }
  const payloadJson = JSON.parse(base64UrlDecodeToString(segments[1])) as { iss?: string };
  if (!payloadJson.iss || typeof payloadJson.iss !== "string") {
    throw new Error("ADR-001 violation: JWT missing required issuer (iss) claim.");
  }
  if (expectedIssuer && payloadJson.iss.replace(/\/+$/, "") !== expectedIssuer.replace(/\/+$/, "")) {
    throw new Error(`ADR-001 violation: JWT issuer mismatch (${payloadJson.iss}).`);
  }
}

export async function discoverOidcConfiguration(
  issuerBaseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<OidcDiscoveryDocument> {
  const normalizedBase = issuerBaseUrl.replace(/\/+$/, "");
  const discoveryUrl = `${normalizedBase}/.well-known/openid-configuration`;
  const response = await fetchImpl(discoveryUrl, {
    method: "GET",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status}) at ${discoveryUrl}`);
  }
  const doc = (await response.json()) as Partial<OidcDiscoveryDocument>;
  if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("ADR-001 violation: OIDC discovery missing issuer or required endpoints.");
  }
  if (
    doc.code_challenge_methods_supported &&
    !doc.code_challenge_methods_supported.includes("S256")
  ) {
    throw new Error("ADR-001 violation: OIDC provider does not advertise PKCE S256.");
  }
  return {
    issuer: doc.issuer,
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    revocation_endpoint: doc.revocation_endpoint,
    userinfo_endpoint: doc.userinfo_endpoint,
    code_challenge_methods_supported: doc.code_challenge_methods_supported
  };
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const authUrl = new URL(params.discovery.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", params.clientId);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("scope", params.scope);
  authUrl.searchParams.set("state", params.state);
  authUrl.searchParams.set("code_challenge", params.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (params.nonce) {
    authUrl.searchParams.set("nonce", params.nonce);
  }
  return authUrl.toString();
}

export async function exchangeAuthorizationCode(
  params: TokenExchangeParams
): Promise<OidcTokenResponse> {
  const fetchFn = params.fetchImpl ?? fetch;
  const formBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier
  });
  const response = await fetchFn(params.discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: formBody.toString()
  });
  if (!response.ok) {
    throw new Error(`OIDC token exchange failed (${response.status})`);
  }
  const tokenPayload = (await response.json()) as OidcTokenResponse;
  if (!tokenPayload.access_token) {
    throw new Error("OIDC token exchange returned no access_token.");
  }
  if (tokenPayload.id_token) {
    assertValidJwtHeaderAndIssuer(tokenPayload.id_token, params.discovery.issuer);
  }
  return tokenPayload;
}

export async function refreshOidcToken(params: TokenRefreshParams): Promise<OidcTokenResponse> {
  const fetchFn = params.fetchImpl ?? fetch;
  const formBody = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken
  });
  const response = await fetchFn(params.discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: formBody.toString()
  });
  if (!response.ok) {
    throw new Error(`OIDC token refresh failed (${response.status})`);
  }
  const tokenPayload = (await response.json()) as OidcTokenResponse;
  if (tokenPayload.id_token) {
    assertValidJwtHeaderAndIssuer(tokenPayload.id_token, params.discovery.issuer);
  }
  return tokenPayload;
}

export async function revokeOidcToken(params: TokenRevokeParams): Promise<void> {
  if (!params.discovery.revocation_endpoint) {
    return;
  }
  const fetchFn = params.fetchImpl ?? fetch;
  const formBody = new URLSearchParams({
    client_id: params.clientId,
    token: params.token
  });
  if (params.tokenTypeHint) {
    formBody.set("token_type_hint", params.tokenTypeHint);
  }
  const response = await fetchFn(params.discovery.revocation_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formBody.toString()
  });
  if (!response.ok) {
    throw new Error(`OIDC token revocation failed (${response.status})`);
  }
}
