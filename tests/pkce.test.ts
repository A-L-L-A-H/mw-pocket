import { describe, expect, test } from "bun:test";
import {
  assertValidJwtHeaderAndIssuer,
  base64UrlEncode,
  buildAuthorizationUrl,
  deriveCodeChallengeS256,
  discoverOidcConfiguration,
  exchangeAuthorizationCode,
  sha256Pure
} from "../src/auth/pkce";

function makeJwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const encodePart = (obj: Record<string, unknown>) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  return `${encodePart(header)}.${encodePart(payload)}.signature_stub`;
}

describe("ADR-001 PKCE S256 & OIDC", () => {
  test("matches RFC 7636 Appendix B S256 test vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    const challenge = await deriveCodeChallengeS256(verifier);
    expect(challenge).toBe(expectedChallenge);

    const pureFallbackChallenge = base64UrlEncode(
      sha256Pure(new TextEncoder().encode(verifier))
    );
    expect(pureFallbackChallenge).toBe(expectedChallenge);
  });

  test("rejects JWT with alg: none or missing issuer", () => {
    const noneJwt = makeJwt({ alg: "none", typ: "JWT" }, { iss: "https://rid.example.com" });
    expect(() => assertValidJwtHeaderAndIssuer(noneJwt, "https://rid.example.com")).toThrow(
      /alg=none/i
    );

    const missingIssJwt = makeJwt({ alg: "RS256", typ: "JWT" }, { sub: "user-1" });
    expect(() => assertValidJwtHeaderAndIssuer(missingIssJwt)).toThrow(/issuer/i);

    const validJwt = makeJwt({ alg: "RS256", typ: "JWT" }, { iss: "https://rid.example.com" });
    expect(() =>
      assertValidJwtHeaderAndIssuer(validJwt, "https://rid.example.com")
    ).not.toThrow();
  });

  test("discovers OIDC config, builds S256 auth URL, and exchanges code", async () => {
    const mockFetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/.well-known/openid-configuration")) {
        return new Response(
          JSON.stringify({
            issuer: "https://rid.moonwitness.local",
            authorization_endpoint: "https://rid.moonwitness.local/oauth/authorize",
            token_endpoint: "https://rid.moonwitness.local/oauth/token",
            code_challenge_methods_supported: ["S256"]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/oauth/token")) {
        const idToken = makeJwt(
          { alg: "RS256", typ: "JWT" },
          { iss: "https://rid.moonwitness.local", sub: "sovereign-1" }
        );
        return new Response(
          JSON.stringify({
            access_token: "acc_token_123",
            token_type: "Bearer",
            expires_in: 3600,
            id_token: idToken
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const discovery = await discoverOidcConfiguration("https://rid.moonwitness.local", mockFetch);
    expect(discovery.issuer).toBe("https://rid.moonwitness.local");

    const authUrl = buildAuthorizationUrl({
      discovery,
      clientId: "mw-pocket",
      redirectUri: "mw-pocket://auth",
      scope: "openid profile",
      state: "st-1",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    });
    expect(authUrl).toContain("code_challenge_method=S256");

    const tokens = await exchangeAuthorizationCode({
      discovery,
      clientId: "mw-pocket",
      code: "auth_code_xyz",
      redirectUri: "mw-pocket://auth",
      codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      fetchImpl: mockFetch
    });
    expect(tokens.access_token).toBe("acc_token_123");
  });
});
