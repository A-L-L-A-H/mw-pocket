import { describe, expect, it } from "bun:test";
import { MoonWitnessMobileClient } from "../src/api/client";
import { evaluateOpsGuardAlerts, OpsGuardHealthReport, OpsGuardMonitor } from "../src/opsguard/monitor";

describe("C12: OpsGuardMonitor & mw-echo v1 parity", () => {
  it("evaluates critical alerts for disk pressure, R4 approvals, WhatsApp disconnect, and P0 WorldRadar", () => {
    const now = new Date("2026-11-27T07:00:00+07:00");
    const report = evaluateOpsGuardAlerts({
      now,
      drives: [
        { drive: "/", usedPercent: 93.4, freeGb: 4.1, totalGb: 80, status: "critical" },
        { drive: "/data", usedPercent: 45.0, freeGb: 220, totalGb: 400, status: "healthy" }
      ],
      rawChallenges: [
        {
          challengeId: "chg-r4-flagship",
          riskTier: "R4",
          actionSummary: "Phase 1 cutover for mw-rid + mw-echo",
          diffDigest: "sha256:flagship-cutover-001",
          expiresAt: "2026-11-27T08:00:00+07:00"
        }
      ],
      echoHealth: {
        status: "ok",
        uptimeSec: 7200,
        arenaLevel: 12,
        arenaXp: 4800,
        streakDays: 14
      },
      whatsappHealth: {
        status: "ok",
        engine: "whatsmeow",
        devices_total: 1,
        devices_connected: 0,
        chats_total: 10,
        messages_total: 42,
        media_total: 3
      },
      radarEvents: [
        {
          id: "wr-p0-1",
          source: "CISA KEV",
          severity: "P0",
          headline: "Critical zero-day advisory",
          timestamp: "2026-11-27T06:55:00+07:00",
          acknowledged: false
        }
      ]
    });

    expect(report.overallStatus).toBe("critical");
    expect(report.diskCriticalCount).toBe(1);
    expect(report.pendingR4Count).toBe(1);
    expect(report.whatsappConnected).toBe(false);
    expect(report.alerts.map((a) => a.source)).toEqual([
      "disk",
      "rocksoul",
      "whatsapp",
      "worldradar"
    ]);
  });

  it("polls mw-echo v1 routes with Bearer auth and notifies subscribed alert listeners", async () => {
    const seenPaths: string[] = [];
    const mockFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      seenPaths.push(url.pathname);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      expect(auth).toBe("Bearer rid-flagship-token");

      const routes: Record<string, unknown> = {
        "/health": {
          status: "ok",
          uptimeSec: 3600,
          arenaLevel: 10,
          arenaXp: 2500,
          streakDays: 7
        },
        "/api/v1/system/health": {
          code: "SUCCESS",
          message: "ok",
          results: {
            status: "ok",
            engine: "whatsmeow",
            devices_total: 1,
            devices_connected: 1,
            chats_total: 5,
            messages_total: 20,
            media_total: 1
          }
        },
        "/api/disk/audit": [
          { drive: "/", usedPercent: 62.5, freeGb: 30, totalGb: 80, status: "healthy" }
        ],
        "/api/rocksoul/approvals/pending": [],
        "/api/radar/events": []
      };

      const payload = routes[url.pathname];
      if (payload === undefined) {
        return new Response("not found", { status: 404 });
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    const client = new MoonWitnessMobileClient({
      echoUrl: "https://echo.mycocolink.com",
      myloveUrl: "https://mylove.mycocolink.com",
      accessToken: "rid-flagship-token",
      fetchImpl: mockFetch
    });

    const monitor = new OpsGuardMonitor({
      client,
      echoBaseUrl: "https://echo.mycocolink.com",
      accessToken: "rid-flagship-token",
      fetchImpl: mockFetch
    });

    const received: OpsGuardHealthReport[] = [];
    const unsubscribe = monitor.subscribe((report) => {
      received.push(report);
    });

    const report = await monitor.pollOnce(new Date("2026-11-27T07:00:00+07:00"));
    unsubscribe();

    expect(report.overallStatus).toBe("healthy");
    expect(report.whatsappConnected).toBe(true);
    expect(report.alerts).toHaveLength(0);
    expect(received).toHaveLength(1);
    expect(seenPaths.sort()).toEqual([
      "/api/disk/audit",
      "/api/radar/events",
      "/api/rocksoul/approvals/pending",
      "/api/v1/system/health",
      "/health"
    ]);
  });
});
