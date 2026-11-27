import { describe, expect, test } from "bun:test";
import {
  createInMemoryQueueStorage,
  OfflineActionRecord,
  OfflineQueueService
} from "../src/services/offlineQueue";

describe("OfflineQueueService", () => {
  test("enqueues actions with unique and custom idempotency keys", async () => {
    const storage = createInMemoryQueueStorage();
    const service = new OfflineQueueService({ storage });

    const a1 = await service.enqueueAction({
      type: "ISP_DISCONNECT_SESSION",
      endpoint: "/api/business/isp/sessions/sess-1/disconnect",
      payload: { reason: "stale" }
    });
    expect(a1.id).toBeDefined();
    expect(a1.idempotencyKey.startsWith("idem_")).toBe(true);
    expect(a1.status).toBe("pending");
    expect(a1.attempts).toBe(0);

    const a2 = await service.enqueueAction({
      type: "PAAS_RESTART_APP",
      endpoint: "/api/business/paas/apps/app-1/restart",
      idempotencyKey: "custom_key_123",
      payload: { appId: "app-1" }
    });
    expect(a2.idempotencyKey).toBe("custom_key_123");

    // Idempotency check: re-enqueueing with the same key returns the existing record
    const a2Duplicate = await service.enqueueAction({
      type: "PAAS_RESTART_APP",
      endpoint: "/api/business/paas/apps/app-1/restart",
      idempotencyKey: "custom_key_123",
      payload: { appId: "app-1" }
    });
    expect(a2Duplicate.id).toBe(a2.id);

    const all = await service.getAllActions();
    expect(all.length).toBe(2);
  });

  test("replays actions with custom dispatcher and records success/failure", async () => {
    const storage = createInMemoryQueueStorage();
    const dispatched: string[] = [];

    const service = new OfflineQueueService({
      storage,
      maxAttempts: 2,
      customDispatcher: async (action: OfflineActionRecord) => {
        dispatched.push(action.id);
        if (action.type === "PAAS_RESTART_APP") {
          return { success: true, data: { restarted: true } };
        }
        return { success: false, error: "Network timeout simulating failure" };
      }
    });

    const act1 = await service.enqueueAction({
      type: "PAAS_RESTART_APP",
      endpoint: "/api/test/restart",
      payload: {}
    });

    const act2 = await service.enqueueAction({
      type: "ROCKSOUL_APPROVAL",
      endpoint: "/api/test/approval",
      payload: {}
    });

    // First replay attempt
    const report1 = await service.replayPending();
    expect(report1.processed).toBe(2);
    expect(report1.succeeded).toBe(1);
    expect(report1.failed).toBe(1);
    expect(report1.remainingPending).toBe(1);

    const pendingAfterFirst = await service.getPendingActions();
    expect(pendingAfterFirst.length).toBe(1);
    expect(pendingAfterFirst[0]?.id).toBe(act2.id);
    expect(pendingAfterFirst[0]?.attempts).toBe(1);

    // Second replay attempt for act2 (should hit maxAttempts = 2 and mark as failed)
    const report2 = await service.replayPending();
    expect(report2.processed).toBe(1);
    expect(report2.succeeded).toBe(0);
    expect(report2.failed).toBe(1);
    expect(report2.remainingPending).toBe(0);

    const allFinal = await service.getAllActions();
    const act2Final = allFinal.find((a) => a.id === act2.id);
    expect(act2Final?.status).toBe("failed");
    expect(act2Final?.attempts).toBe(2);
    expect(act2Final?.lastError).toContain("Network timeout");

    // Clearing completed actions
    const cleared = await service.clearCompleted();
    expect(cleared).toBe(1);
    const remaining = await service.getAllActions();
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.id).toBe(act2.id);
  });

  test("dispatches HTTP requests with Bearer token and X-Idempotency-Key headers", async () => {
    const storage = createInMemoryQueueStorage();
    const captured: Array<{ url: string; headers: Headers; body?: string }> = [];

    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      captured.push({
        url: input.toString(),
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : undefined
      });
      return new Response(JSON.stringify({ ok: true, code: "VOUCH99" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const service = new OfflineQueueService({
      storage,
      baseUrl: "https://echo.fleet.internal",
      getAccessToken: () => "tok_offline_test",
      fetchImpl: mockFetch
    });

    const action = await service.enqueueAction({
      type: "VOUCHER_BATCH_CREATE",
      endpoint: "/api/isp/vouchers/batch",
      idempotencyKey: "idem_voucher_batch_42",
      payload: { count: 10, rate_limit: "2M/5M" }
    });

    const report = await service.replayPending();
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.results[0]?.responseData).toEqual({ ok: true, code: "VOUCH99" });

    expect(captured.length).toBe(1);
    expect(captured[0]?.url).toBe("https://echo.fleet.internal/api/isp/vouchers/batch");
    expect(captured[0]?.headers.get("Authorization")).toBe("Bearer tok_offline_test");
    expect(captured[0]?.headers.get("X-Idempotency-Key")).toBe("idem_voucher_batch_42");
    expect(JSON.parse(captured[0]?.body ?? "{}").count).toBe(10);
  });
});
