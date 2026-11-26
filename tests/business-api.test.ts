import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { BusinessApiClient } from "../src/services/businessApi";
import { ChallengeSigner } from "../src/services/rocksoulApproval";

const signer: ChallengeSigner = async (payload) =>
  createHmac("sha256", "secret_key").update(payload).digest("hex");

describe("BusinessApiClient", () => {
  test("fetchIspSessions injects Bearer token and parses session list", async () => {
    let capturedAuth: string | null = null;
    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      capturedAuth = headers.get("Authorization");
      expect(input.toString()).toBe("https://vps.fleet.internal/api/business/isp/sessions");
      return new Response(
        JSON.stringify([
          {
            sessionId: "isp-sess-100",
            username: "client_alpha@mw.net",
            framedIpAddress: "100.64.0.12",
            callingStationId: "00:11:22:33:44:55",
            nasIpAddress: "10.0.0.1",
            sessionTimeSec: 3600,
            inputOctets: 1048576,
            outputOctets: 4194304,
            status: "active"
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = new BusinessApiClient({
      baseUrl: "https://vps.fleet.internal",
      getAccessToken: () => "mw-rid:tok_super_secret",
      fetchImpl: mockFetch
    });

    const sessions = await client.fetchIspSessions();
    expect(capturedAuth as string | null).toBe("Bearer mw-rid:tok_super_secret");
    expect(sessions.length).toBe(1);
    expect(sessions[0]?.sessionId).toBe("isp-sess-100");
    expect(sessions[0]?.username).toBe("client_alpha@mw.net");
    expect(sessions[0]?.status).toBe("active");
  });

  test("disconnectIspSession sends POST with reason and returns disconnect result", async () => {
    let capturedBody: string | null = null;
    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(input.toString()).toBe(
        "https://vps.fleet.internal/api/business/isp/sessions/sess-999/disconnect"
      );
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({
          success: true,
          sessionId: "sess-999",
          reason: "stale_session_kick",
          timestamp: "2026-11-26T23:50:00Z"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = new BusinessApiClient({
      baseUrl: "https://vps.fleet.internal",
      getAccessToken: () => "mw-rid:tok_test",
      fetchImpl: mockFetch
    });

    const result = await client.disconnectIspSession("sess-999", "stale_session_kick");
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe("sess-999");
    expect(JSON.parse(capturedBody ?? "{}").reason).toBe("stale_session_kick");
  });

  test("fetchPaasApps enforces CAN-0011 guard and parses apps", async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify([
          {
            appId: "paas-app-1",
            name: "Sovereign Node Proxy",
            status: "running",
            replicas: 2,
            cpuPercent: 12.5,
            memoryMb: 256,
            uptimeSec: 7200,
            visualType: "geometric"
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = new BusinessApiClient({
      baseUrl: "https://vps.fleet.internal",
      getAccessToken: () => null,
      fetchImpl: mockFetch
    });

    const apps = await client.fetchPaasApps();
    expect(apps.length).toBe(1);
    expect(apps[0]?.name).toBe("Sovereign Node Proxy");
    expect(apps[0]?.visualType).toBe("geometric");
  });

  test("restartPaasApp issues POST to restart endpoint", async () => {
    const mockFetch = (async (input: string | URL | Request) => {
      expect(input.toString()).toBe(
        "https://vps.fleet.internal/api/business/paas/apps/paas-app-1/restart"
      );
      return new Response(
        JSON.stringify({
          success: true,
          appId: "paas-app-1",
          restartedAt: "2026-11-26T23:51:00Z"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = new BusinessApiClient({
      baseUrl: "https://vps.fleet.internal",
      getAccessToken: () => null,
      fetchImpl: mockFetch
    });

    const result = await client.restartPaasApp("paas-app-1");
    expect(result.success).toBe(true);
    expect(result.appId).toBe("paas-app-1");
  });

  test("fetchPendingApprovals filters expired or invalid challenges", async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          challenges: [
            {
              challengeId: "c-active",
              riskTier: "R4",
              actionSummary: "Drain and reboot VPS host 3",
              diffDigest: "sha256:1111",
              expiresAt: "2026-11-27T00:10:00Z"
            },
            {
              challengeId: "c-expired",
              riskTier: "R3",
              actionSummary: "Flush NAT table",
              diffDigest: "sha256:2222",
              expiresAt: "2026-11-26T23:00:00Z"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = new BusinessApiClient({
      baseUrl: "https://vps.fleet.internal",
      getAccessToken: () => "mw-rid:tok_test",
      fetchImpl: mockFetch
    });

    const now = new Date("2026-11-26T23:55:00Z");
    const result = await client.fetchPendingApprovals(now);
    expect(result.challenges.length).toBe(1);
    expect(result.challenges[0]?.challengeId).toBe("c-active");
  });

  test("submitRocksoulApproval signs payload and submits to API", async () => {
    let capturedBody: string | null = null;
    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(input.toString()).toBe(
        "https://vps.fleet.internal/api/business/approvals/c-active/submit"
      );
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const client = new BusinessApiClient({
      baseUrl: "https://vps.fleet.internal",
      getAccessToken: () => "mw-rid:tok_test",
      fetchImpl: mockFetch
    });

    const now = new Date("2026-11-26T23:55:00Z");
    const signed = await client.submitRocksoulApproval({
      challenge: {
        challengeId: "c-active",
        riskTier: "R4",
        actionSummary: "Drain and reboot VPS host 3",
        diffDigest: "sha256:1111",
        expiresAt: "2026-11-27T00:10:00Z"
      },
      decision: "approve",
      subject: "mw-rid:sovereign_operator",
      signer,
      now
    });

    expect(signed.challengeId).toBe("c-active");
    expect(signed.decision).toBe("approve");
    expect(signed.subject).toBe("mw-rid:sovereign_operator");
    expect(signed.signature.length).toBeGreaterThan(0);

    const bodyJson = JSON.parse(capturedBody ?? "{}");
    expect(bodyJson.signature).toBe(signed.signature);
  });
});
