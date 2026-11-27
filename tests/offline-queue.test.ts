import { describe, expect, test } from "bun:test";
import {
  computeBackoffMs,
  createInMemoryQueueStorage,
  OfflineActionRecord,
  OfflineQueueService,
  OfflineQueueStorageAdapter
} from "../src/services/offlineQueue";

function createDelayedStorage(delayMs = 8): OfflineQueueStorageAdapter {
  const inner = createInMemoryQueueStorage();
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  return {
    async getItem(key: string): Promise<string | null> {
      await wait();
      return inner.getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      await wait();
      await inner.setItem(key, value);
    },
    async removeItem(key: string): Promise<void> {
      await wait();
      await inner.removeItem(key);
    }
  };
}

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
      baseBackoffMs: 0,
      customDispatcher: async (action: OfflineActionRecord) => {
        dispatched.push(action.id);
        if (action.type === "PAAS_RESTART_APP") {
          return { success: true, data: { restarted: true } };
        }
        return { success: false, error: "Network timeout simulating failure" };
      }
    });

    await service.enqueueAction({
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

    await service.enqueueAction({
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

  test("serializes concurrent Promise.all enqueueAction calls for distinct and duplicate keys", async () => {
    const storage = createDelayedStorage(8);
    const service = new OfflineQueueService({ storage });

    const [a1, a2, a3] = await Promise.all([
      service.enqueueAction({
        type: "VOUCHER_BATCH_CREATE",
        endpoint: "/api/isp/vouchers/batch",
        idempotencyKey: "k1",
        payload: { idx: 1 }
      }),
      service.enqueueAction({
        type: "VOUCHER_BATCH_CREATE",
        endpoint: "/api/isp/vouchers/batch",
        idempotencyKey: "k2",
        payload: { idx: 2 }
      }),
      service.enqueueAction({
        type: "VOUCHER_BATCH_CREATE",
        endpoint: "/api/isp/vouchers/batch",
        idempotencyKey: "k3",
        payload: { idx: 3 }
      })
    ]);

    expect(new Set([a1.id, a2.id, a3.id]).size).toBe(3);

    const [dup1, dup2] = await Promise.all([
      service.enqueueAction({
        type: "VOUCHER_REDEEM",
        endpoint: "/api/isp/vouchers/redeem",
        idempotencyKey: "dup-key",
        payload: { code: "ABC" }
      }),
      service.enqueueAction({
        type: "VOUCHER_REDEEM",
        endpoint: "/api/isp/vouchers/redeem",
        idempotencyKey: "dup-key",
        payload: { code: "ABC" }
      })
    ]);

    expect(dup1.id).toBe(dup2.id);

    const all = await service.getAllActions();
    expect(all.map((a) => a.idempotencyKey)).toEqual(["k1", "k2", "k3", "dup-key"]);
  });

  test("preserves enqueueAction during in-flight replayPending and prevents concurrent double-replay", async () => {
    const storage = createDelayedStorage(6);
    const dispatchLog: string[] = [];
    let observedInFlightStatus: string | undefined;

    let releaseFirstDispatch!: () => void;
    const firstDispatchStarted = new Promise<void>((resolve) => {
      // resolved inside customDispatcher
      void resolve;
    });
    let markStarted!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gatePromise = new Promise<void>((resolve) => {
      releaseFirstDispatch = resolve;
    });
    void firstDispatchStarted;

    const service = new OfflineQueueService({
      storage,
      customDispatcher: async (action) => {
        dispatchLog.push(action.idempotencyKey);
        if (action.idempotencyKey === "pre-1") {
          markStarted();
          await gatePromise;
        }
        return { success: true, data: { ok: true } };
      }
    });

    await service.enqueueAction({
      type: "ISP_DISCONNECT_SESSION",
      endpoint: "/api/isp/disconnect",
      idempotencyKey: "pre-1",
      payload: { sessionId: "s-1" }
    });

    // Start two concurrent replays while pre-1 blocks in-flight
    const replay1Promise = service.replayPending();
    await startedPromise;
    const replay2Promise = service.replayPending();

    // Inspect storage mid-flight and enqueue another action during replay
    const midFlightAll = await service.getAllActions();
    observedInFlightStatus = midFlightAll.find((a) => a.idempotencyKey === "pre-1")?.status;

    const duringAction = await service.enqueueAction({
      type: "PAAS_RESTART_APP",
      endpoint: "/api/paas/restart",
      idempotencyKey: "during-replay",
      payload: { appId: "app-9" }
    });
    expect(duringAction.status).toBe("pending");

    releaseFirstDispatch();
    const [r1, r2] = await Promise.all([replay1Promise, replay2Promise]);

    expect(observedInFlightStatus).toBe("processing");
    expect(r1.processed).toBe(1);
    expect(r1.succeeded).toBe(1);
    // replay2 ran after replay1 finished and picked up the newly enqueued "during-replay" once
    expect(r2.processed).toBe(1);
    expect(r2.succeeded).toBe(1);
    expect(dispatchLog).toEqual(["pre-1", "during-replay"]);

    const finalAll = await service.getAllActions();
    expect(finalAll.length).toBe(2);
    expect(finalAll.every((a) => a.status === "completed")).toBe(true);
  });

  test("aborts stalled HTTP requests via AbortController timeoutMs and recovers cleanly", async () => {
    const storage = createInMemoryQueueStorage();
    let aborted = false;

    const hangingFetch = ((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const service = new OfflineQueueService({
      storage,
      baseUrl: "https://echo.fleet.internal",
      timeoutMs: 25,
      maxAttempts: 2,
      fetchImpl: hangingFetch
    });

    await service.enqueueAction({
      type: "PAAS_RESTART_APP",
      endpoint: "/api/paas/apps/a1/restart",
      idempotencyKey: "timeout-1",
      payload: {}
    });

    const report = await service.replayPending();
    expect(aborted).toBe(true);
    expect(report.failed).toBe(1);
    expect(report.results[0]?.status).toBe("pending");
    expect(report.results[0]?.error).toContain("timed out after 25ms");
  });

  test("handles 409 Conflict and non-retryable 4xx without wasting retries, and supports retryFailedAction", async () => {
    const storage = createInMemoryQueueStorage();
    let fetchCalls = 0;

    const mockFetch = (async (input: string | URL | Request) => {
      fetchCalls += 1;
      const url = input.toString();
      if (url.endsWith("/conflict")) {
        return new Response("Voucher already redeemed", { status: 409 });
      }
      if (url.endsWith("/bad-request")) {
        return new Response("Invalid payload", { status: 400 });
      }
      return new Response("OK", { status: 200 });
    }) as unknown as typeof fetch;

    const service = new OfflineQueueService({
      storage,
      baseUrl: "https://isp.fleet.internal",
      maxAttempts: 5,
      fetchImpl: mockFetch
    });

    const conflictAct = await service.enqueueAction({
      type: "VOUCHER_REDEEM",
      endpoint: "/conflict",
      idempotencyKey: "k-409",
      payload: { code: "V1" }
    });

    const badReqAct = await service.enqueueAction({
      type: "VOUCHER_BATCH_CREATE",
      endpoint: "/bad-request",
      idempotencyKey: "k-400",
      payload: { count: 0 }
    });

    const report = await service.replayPending();
    expect(fetchCalls).toBe(2);
    expect(report.processed).toBe(2);
    expect(report.failed).toBe(2);
    expect(report.conflicts).toBe(1);
    expect(report.remainingPending).toBe(0);

    const all = await service.getAllActions();
    const savedConflict = all.find((a) => a.id === conflictAct.id);
    const savedBadReq = all.find((a) => a.id === badReqAct.id);

    expect(savedConflict?.status).toBe("failed");
    expect(savedConflict?.attempts).toBe(1);
    expect(savedConflict?.conflict).toBe(true);
    expect(savedConflict?.lastHttpStatus).toBe(409);

    expect(savedBadReq?.status).toBe("failed");
    expect(savedBadReq?.attempts).toBe(1);
    expect(savedBadReq?.conflict).toBe(false);
    expect(savedBadReq?.nonRetryable).toBe(true);
    expect(savedBadReq?.lastHttpStatus).toBe(400);

    // Subsequent replay does not retry terminal 409/400 actions
    const report2 = await service.replayPending();
    expect(report2.processed).toBe(0);
    expect(fetchCalls).toBe(2);

    // Manual retry resets failed action back to pending
    const reset = await service.retryFailedAction(conflictAct.id);
    expect(reset?.status).toBe("pending");
    expect(reset?.attempts).toBe(0);
    expect(reset?.conflict).toBe(false);
  });

  test("rejects relative endpoint when baseUrl is missing without calling fetch", async () => {
    const storage = createInMemoryQueueStorage();
    let fetchCalls = 0;

    const service = new OfflineQueueService({
      storage,
      fetchImpl: (async () => {
        fetchCalls += 1;
        return new Response("OK", { status: 200 });
      }) as unknown as typeof fetch
    });

    await service.enqueueAction({
      type: "VOUCHER_REDEEM",
      endpoint: "/api/isp/vouchers/redeem",
      payload: { code: "V1", username: "u1" }
    });

    const report = await service.replayPending();
    expect(fetchCalls).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.remainingPending).toBe(0);
    expect(report.results[0]?.status).toBe("failed");
    expect(report.results[0]?.error).toContain("baseUrl");
  });

  test("applies exponential backoff for 5xx/429/408 unless force: true is specified", async () => {
    expect(computeBackoffMs(1, 1000, 5000)).toBe(1000);
    expect(computeBackoffMs(2, 1000, 5000)).toBe(2000);
    expect(computeBackoffMs(3, 1000, 5000)).toBe(4000);
    expect(computeBackoffMs(4, 1000, 5000)).toBe(5000);

    let fakeNow = 1_700_000_000_000;
    let statusCode = 503;
    const storage = createInMemoryQueueStorage();

    const service = new OfflineQueueService({
      storage,
      baseUrl: "https://echo.fleet.internal",
      baseBackoffMs: 1000,
      maxBackoffMs: 4000,
      maxAttempts: 4,
      now: () => fakeNow,
      fetchImpl: (async () =>
        new Response("Unavailable", { status: statusCode })) as unknown as typeof fetch
    });

    await service.enqueueAction({
      type: "ISP_DISCONNECT_SESSION",
      endpoint: "/api/isp/disconnect",
      idempotencyKey: "backoff-1",
      payload: {}
    });

    // Attempt 1 -> 503 -> nextRetryAtMs = fakeNow + 1000
    const r1 = await service.replayPending();
    expect(r1.processed).toBe(1);
    expect(r1.results[0]?.nextRetryAtMs).toBe(fakeNow + 1000);

    // 500ms later: skipped due to backoff
    fakeNow += 500;
    const rSkipped = await service.replayPending();
    expect(rSkipped.processed).toBe(0);
    expect(rSkipped.skippedBackoff).toBe(1);
    expect(rSkipped.remainingPending).toBe(1);

    // force: true bypasses backoff window -> Attempt 2 -> 429 -> nextRetryAtMs = fakeNow + 2000
    statusCode = 429;
    const rForced = await service.replayPending({ force: true });
    expect(rForced.processed).toBe(1);
    expect(rForced.results[0]?.attempts).toBe(2);
    expect(rForced.results[0]?.nextRetryAtMs).toBe(fakeNow + 2000);

    // Advance past 2000ms backoff and recover with 200 OK
    fakeNow += 2000;
    statusCode = 200;
    const rOk = await service.replayPending();
    expect(rOk.processed).toBe(1);
    expect(rOk.succeeded).toBe(1);
    expect(rOk.remainingPending).toBe(0);
  });

  test("persists across separate OfflineQueueService instances and supports removeAction/clearAll", async () => {
    const storage = createInMemoryQueueStorage();
    const writer = new OfflineQueueService({ storage });

    const a1 = await writer.enqueueAction({
      type: "VOUCHER_BATCH_CREATE",
      endpoint: "/api/isp/vouchers/batch",
      idempotencyKey: "persist-1",
      payload: { count: 2 }
    });
    const a2 = await writer.enqueueAction({
      type: "VOUCHER_REDEEM",
      endpoint: "/api/isp/vouchers/redeem",
      idempotencyKey: "persist-2",
      payload: { code: "X" }
    });

    const reader = new OfflineQueueService({ storage });
    const loaded = await reader.getAllActions();
    expect(loaded.map((a) => a.id)).toEqual([a1.id, a2.id]);

    expect(await reader.removeAction(a1.id)).toBe(true);
    expect(await reader.removeAction("non-existent")).toBe(false);
    expect((await writer.getAllActions()).map((a) => a.id)).toEqual([a2.id]);

    await reader.clearAll();
    expect(await writer.getAllActions()).toEqual([]);
  });
});
