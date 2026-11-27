import { describe, expect, test } from "bun:test";
import {
  createHttpSpeechTranscriber,
  normalizeTranscript,
  parseVoiceCommand,
  PocketRouteTab,
  VoiceCommandDispatcher,
  VoiceCommandIntent
} from "../src/services/voiceCommand";

describe("voiceCommand service", () => {
  test("normalizeTranscript strips noise while preserving rate limits and IDs", () => {
    expect(normalizeTranscript("  Generate 10 vouchers, 2M/5M, for 2 hours! ")).toBe(
      "generate 10 vouchers 2m/5m for 2 hours"
    );
    expect(normalizeTranscript("Approve challenge ch-42?")).toBe("approve challenge ch-42");
  });

  test("parses EN and ID navigation commands for all 9 tabs", () => {
    const cases: Array<[string, PocketRouteTab]> = [
      ["open hq", "HQ"],
      ["buka markas", "HQ"],
      ["go to ops", "Ops"],
      ["buka operasi bisnis", "Ops"],
      ["open voucher", "Vouchers"],
      ["buka kupon", "Vouchers"],
      ["navigate to sidekick", "Sidekick"],
      ["buka asisten", "Sidekick"],
      ["open radar", "Radar"],
      ["tampilkan pantau", "Radar"],
      ["switch to comms", "Comms"],
      ["buka pesan", "Comms"],
      ["go to vault", "Vault"],
      ["buka brankas", "Vault"],
      ["open mylove", "MyLove"],
      ["buka my love", "MyLove"],
      ["open settings", "Settings"],
      ["buka pengaturan", "Settings"]
    ];

    for (const [phrase, expectedTab] of cases) {
      const parsed = parseVoiceCommand(phrase);
      expect(parsed.intent).toEqual({ kind: "navigate", tab: expectedTab });
      expect(parsed.confidence).toBeGreaterThan(0.8);
    }
  });

  test("parses EN and ID voucher batch transcripts with count, rate limit, and duration", () => {
    const enParsed = parseVoiceCommand("Generate 10 vouchers 2M/5M for 2 hours");
    expect(enParsed.intent).toEqual({
      kind: "generate_vouchers",
      count: 10,
      rateLimit: "2M/5M",
      timeLimitSecs: 7200
    });
    expect(enParsed.language).toBe("en");

    const idParsed = parseVoiceCommand("Buat 5 kupon 512k/1m 30 menit");
    expect(idParsed.intent).toEqual({
      kind: "generate_vouchers",
      count: 5,
      rateLimit: "512k/1M",
      timeLimitSecs: 1800
    });
    expect(idParsed.language).toBe("id");

    const clampedParsed = parseVoiceCommand("create 5000 vouchers 10M/20M 3 days");
    expect(clampedParsed.intent).toEqual({
      kind: "generate_vouchers",
      count: 1000,
      rateLimit: "10M/20M",
      timeLimitSecs: 259200
    });
  });

  test("parses operational, fleet, queue, radar, and sidekick intents", () => {
    expect(parseVoiceCommand("probe fleet").intent).toEqual({ kind: "probe_fleet" });
    expect(parseVoiceCommand("cek armada").intent).toEqual({ kind: "probe_fleet" });
    expect(parseVoiceCommand("sync offline queue").intent).toEqual({ kind: "sync_offline_queue" });
    expect(parseVoiceCommand("kirim antrean").intent).toEqual({ kind: "sync_offline_queue" });
    expect(parseVoiceCommand("disconnect session isp-100 reason stale_lease").intent).toEqual({
      kind: "disconnect_isp_session",
      sessionId: "isp-100",
      reason: "stale_lease"
    });
    expect(parseVoiceCommand("putus sesi isp-200").intent).toEqual({
      kind: "disconnect_isp_session",
      sessionId: "isp-200",
      reason: undefined
    });
    expect(parseVoiceCommand("restart app paas-app-1").intent).toEqual({
      kind: "restart_paas_app",
      appId: "paas-app-1"
    });
    expect(parseVoiceCommand("acknowledge radar evt-9").intent).toEqual({
      kind: "ack_radar_event",
      eventId: "evt-9"
    });
    expect(parseVoiceCommand("ask sidekick summarize fleet status").intent).toEqual({
      kind: "sidekick_prompt",
      prompt: "summarize fleet status"
    });
    expect(parseVoiceCommand("tanya sidekick cek status vps").intent).toEqual({
      kind: "sidekick_prompt",
      prompt: "cek status vps"
    });
  });

  test("enforces mandatory confirmation gate on Rocksoul R3/R4 approval", async () => {
    const parsedApprove = parseVoiceCommand("approve challenge ch-42");
    expect(parsedApprove.intent).toEqual({
      kind: "rocksoul_approval",
      challengeId: "ch-42",
      decision: "approve",
      requiresConfirmation: true
    });

    const parsedDenyId = parseVoiceCommand("tolak tantangan ch-99");
    expect(parsedDenyId.intent).toEqual({
      kind: "rocksoul_approval",
      challengeId: "ch-99",
      decision: "deny",
      requiresConfirmation: true
    });

    let submitted = 0;
    const noConfirmDispatcher = new VoiceCommandDispatcher({
      handlers: {
        submitRocksoulApproval: async () => {
          submitted += 1;
          return { ok: true };
        }
      }
    });
    const blockedRes = await noConfirmDispatcher.dispatchTranscript("approve challenge ch-42");
    expect(blockedRes.executed).toBe(false);
    expect(blockedRes.awaitingConfirmation).toBe(true);
    expect(submitted).toBe(0);

    const deniedConfirmDispatcher = new VoiceCommandDispatcher({
      handlers: {
        confirmDangerousAction: async () => false,
        submitRocksoulApproval: async () => {
          submitted += 1;
          return { ok: true };
        }
      }
    });
    const deniedRes = await deniedConfirmDispatcher.dispatchTranscript("approve challenge ch-42");
    expect(deniedRes.executed).toBe(false);
    expect(submitted).toBe(0);

    let confirmedIntent: VoiceCommandIntent | null = null;
    const confirmedDispatcher = new VoiceCommandDispatcher({
      handlers: {
        confirmDangerousAction: async (intent) => {
          confirmedIntent = intent;
          return true;
        },
        submitRocksoulApproval: async (challengeId, decision) => {
          submitted += 1;
          return { challengeId, decision };
        }
      }
    });
    const okRes = await confirmedDispatcher.dispatchTranscript("setujui challenge ch-42");
    expect(okRes.executed).toBe(true);
    expect(submitted).toBe(1);
    expect(confirmedIntent as VoiceCommandIntent | null).toEqual({
      kind: "rocksoul_approval",
      challengeId: "ch-42",
      decision: "approve",
      requiresConfirmation: true
    });
    expect(okRes.payload).toEqual({ challengeId: "ch-42", decision: "approve" });
  });

  test("returns executed: false for empty or unknown transcripts without throwing", async () => {
    const dispatcher = new VoiceCommandDispatcher({
      handlers: {}
    });

    const emptyRes = await dispatcher.dispatchTranscript("   ");
    expect(emptyRes.executed).toBe(false);
    expect(emptyRes.intent.kind).toBe("unknown");

    const unknownRes = await dispatcher.dispatchTranscript("sing me a lullaby");
    expect(unknownRes.executed).toBe(false);
    expect(unknownRes.intent).toEqual({
      kind: "unknown",
      rawTranscript: "sing me a lullaby"
    });
  });

  test("createHttpSpeechTranscriber sends Bearer token and dispatchAudio executes returned intent", async () => {
    let capturedAuth: string | null = null;
    let capturedUrl = "";
    let capturedBody = "";

    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedAuth = new Headers(init?.headers).get("Authorization");
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ transcript: "buka radar" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const transcriber = createHttpSpeechTranscriber({
      endpointUrl: "https://echo.fleet.internal/api/voice/transcribe",
      getAccessToken: () => "mw-rid:tok_voice_123",
      fetchImpl: mockFetch
    });

    const navigatedTabs: PocketRouteTab[] = [];
    const dispatcher = new VoiceCommandDispatcher({
      transcriber,
      handlers: {
        navigate: (tab) => {
          navigatedTabs.push(tab);
        }
      }
    });

    const result = await dispatcher.dispatchAudio({
      uri: "file:///tmp/cmd.m4a",
      mimeType: "audio/m4a"
    });

    expect(capturedUrl).toBe("https://echo.fleet.internal/api/voice/transcribe");
    expect(capturedAuth as string | null).toBe("Bearer mw-rid:tok_voice_123");
    expect(JSON.parse(capturedBody)).toEqual({
      uri: "file:///tmp/cmd.m4a",
      mimeType: "audio/m4a"
    });
    expect(result.executed).toBe(true);
    expect(result.intent).toEqual({ kind: "navigate", tab: "Radar" });
    expect(navigatedTabs).toEqual(["Radar"]);
  });

  test("clamps large/negative voucher counts, ignores invalid slash rate limits in duration, and rejects bare target keywords", async () => {
    expect(parseVoiceCommand("generate 999999 vouchers").intent).toEqual({
      kind: "generate_vouchers",
      count: 1000,
      rateLimit: "2M/5M",
      timeLimitSecs: 3600
    });

    expect(parseVoiceCommand("generate -5 vouchers").intent).toEqual({
      kind: "generate_vouchers",
      count: 1,
      rateLimit: "2M/5M",
      timeLimitSecs: 3600
    });

    expect(parseVoiceCommand("generate 10 vouchers 2M/5X").intent).toEqual({
      kind: "generate_vouchers",
      count: 10,
      rateLimit: "2M/5M",
      timeLimitSecs: 3600
    });

    for (const barePhrase of [
      "disconnect session",
      "disconnect isp session",
      "disconnect session reason stale",
      "restart app",
      "restart paas app",
      "ack event",
      "acknowledge radar"
    ]) {
      expect(parseVoiceCommand(barePhrase).intent.kind).toBe("unknown");
    }

    expect(parseVoiceCommand("disconnect session-1").intent).toEqual({
      kind: "disconnect_isp_session",
      sessionId: "session-1",
      reason: undefined
    });
    expect(parseVoiceCommand("restart app-1").intent).toEqual({
      kind: "restart_paas_app",
      appId: "app-1"
    });

    // Token rejection before fetch should reject without creating a dangling timeout timer
    let fetchCalled = false;
    const origSetTimeout = globalThis.setTimeout;
    let timersCreated = 0;
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      timersCreated += 1;
      return origSetTimeout(...args);
    }) as typeof setTimeout;

    try {
      const failingTokenTranscriber = createHttpSpeechTranscriber({
        endpointUrl: "https://echo.fleet.internal/api/voice/transcribe",
        getAccessToken: async () => {
          throw new Error("token unavailable");
        },
        fetchImpl: (async () => {
          fetchCalled = true;
          return new Response("{}");
        }) as unknown as typeof fetch
      });

      await expect(
        failingTokenTranscriber.transcribe({ uri: "file:///tmp/cmd.m4a" })
      ).rejects.toThrow("token unavailable");
      expect(fetchCalled).toBe(false);
      expect(timersCreated).toBe(0);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});
