export type OfflineActionType =
  | "ISP_DISCONNECT_SESSION"
  | "PAAS_RESTART_APP"
  | "ROCKSOUL_APPROVAL"
  | "VOUCHER_BATCH_CREATE"
  | "VOUCHER_REDEEM";

export type OfflineActionStatus = "pending" | "processing" | "completed" | "failed";

export interface OfflineActionRecord<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly type: OfflineActionType;
  readonly endpoint: string;
  readonly method: "POST" | "PUT" | "DELETE" | "PATCH";
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly attempts: number;
  readonly status: OfflineActionStatus;
  readonly lastAttemptAt?: string;
  readonly nextRetryAt?: string;
  readonly nextRetryAtMs?: number;
  readonly lastHttpStatus?: number;
  readonly conflict?: boolean;
  readonly nonRetryable?: boolean;
  readonly lastError?: string;
  readonly responseData?: unknown;
}

export interface OfflineQueueStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createInMemoryQueueStorage(): OfflineQueueStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    }
  };
}

export function createAsyncStorageQueueStorage(): OfflineQueueStorageAdapter {
  return {
    async getItem(key: string): Promise<string | null> {
      const storage = (await import("@react-native-async-storage/async-storage")).default;
      return storage.getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      const storage = (await import("@react-native-async-storage/async-storage")).default;
      await storage.setItem(key, value);
    },
    async removeItem(key: string): Promise<void> {
      const storage = (await import("@react-native-async-storage/async-storage")).default;
      await storage.removeItem(key);
    }
  };
}

export interface EnqueueActionOptions<TPayload = Record<string, unknown>> {
  readonly id?: string;
  readonly idempotencyKey?: string;
  readonly type: OfflineActionType;
  readonly endpoint: string;
  readonly method?: "POST" | "PUT" | "DELETE" | "PATCH";
  readonly payload: TPayload;
}

export interface ReplayItemResult {
  readonly actionId: string;
  readonly idempotencyKey: string;
  readonly type: OfflineActionType;
  readonly success: boolean;
  readonly status: OfflineActionStatus;
  readonly attempts: number;
  readonly httpStatus?: number;
  readonly conflict?: boolean;
  readonly nextRetryAtMs?: number;
  readonly error?: string;
  readonly responseData?: unknown;
}

export interface ReplayQueueReport {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly conflicts: number;
  readonly skippedBackoff: number;
  readonly remainingPending: number;
  readonly results: readonly ReplayItemResult[];
}

export interface ReplayPendingOptions {
  readonly force?: boolean;
}

export interface CustomDispatchResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
  readonly httpStatus?: number;
  readonly conflict?: boolean;
  readonly retryable?: boolean;
}

export interface OfflineQueueServiceOptions {
  readonly storage?: OfflineQueueStorageAdapter;
  readonly storageKey?: string;
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly now?: () => number;
  readonly baseUrl?: string;
  readonly getAccessToken?: () => Promise<string | null> | string | null;
  readonly fetchImpl?: typeof fetch;
  readonly customDispatcher?: (action: OfflineActionRecord) => Promise<CustomDispatchResult>;
}

const DEFAULT_STORAGE_KEY = "mw_pocket_offline_queue_v1";
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

export function computeBackoffMs(
  attempts: number,
  baseMs = DEFAULT_BASE_BACKOFF_MS,
  maxMs = DEFAULT_MAX_BACKOFF_MS
): number {
  if (baseMs <= 0 || maxMs <= 0) {
    return 0;
  }
  const exponent = Math.max(0, attempts - 1);
  return Math.min(maxMs, baseMs * Math.pow(2, exponent));
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function generateSecureId(prefix = "act"): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export class OfflineQueueService {
  private readonly storage: OfflineQueueStorageAdapter;
  private readonly storageKey: string;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly now: () => number;
  private readonly baseUrl?: string;
  private readonly getAccessToken?: () => Promise<string | null> | string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly customDispatcher?: (
    action: OfflineActionRecord
  ) => Promise<CustomDispatchResult>;

  private storageLockTail: Promise<void> = Promise.resolve();
  private replayLockTail: Promise<void> = Promise.resolve();

  constructor(options: OfflineQueueServiceOptions = {}) {
    this.storage = options.storage ?? createInMemoryQueueStorage();
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.now = options.now ?? (() => Date.now());
    this.baseUrl = options.baseUrl?.trim().replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.customDispatcher = options.customDispatcher;
  }

  private async withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.storageLockTail;
    let release!: () => void;
    this.storageLockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async withReplayLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.replayLockTail;
    let release!: () => void;
    this.replayLockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async loadQueueUnsafe(): Promise<OfflineActionRecord[]> {
    try {
      const raw = await this.storage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private async saveQueueUnsafe(queue: readonly OfflineActionRecord[]): Promise<void> {
    await this.storage.setItem(this.storageKey, JSON.stringify(queue));
  }

  async getAllActions(): Promise<readonly OfflineActionRecord[]> {
    return this.withStorageLock(() => this.loadQueueUnsafe());
  }

  async getPendingActions(): Promise<readonly OfflineActionRecord[]> {
    return this.withStorageLock(async () => {
      const queue = await this.loadQueueUnsafe();
      return queue.filter((item) => item.status === "pending");
    });
  }

  async enqueueAction<TPayload = Record<string, unknown>>(
    opts: EnqueueActionOptions<TPayload>
  ): Promise<OfflineActionRecord<TPayload>> {
    return this.withStorageLock(async () => {
      const queue = await this.loadQueueUnsafe();

      const idempotencyKey =
        opts.idempotencyKey?.trim() || `idem_${generateSecureId("key")}`;

      const existing = queue.find((item) => item.idempotencyKey === idempotencyKey);
      if (existing) {
        return existing as unknown as OfflineActionRecord<TPayload>;
      }

      const action: OfflineActionRecord<TPayload> = {
        id: opts.id?.trim() || generateSecureId("act"),
        idempotencyKey,
        type: opts.type,
        endpoint: opts.endpoint.trim(),
        method: opts.method ?? "POST",
        payload: opts.payload,
        createdAt: new Date(this.now()).toISOString(),
        attempts: 0,
        status: "pending"
      };

      queue.push(action as unknown as OfflineActionRecord);
      await this.saveQueueUnsafe(queue);
      return action;
    });
  }

  async removeAction(actionId: string): Promise<boolean> {
    return this.withStorageLock(async () => {
      const queue = await this.loadQueueUnsafe();
      const filtered = queue.filter((a) => a.id !== actionId);
      if (filtered.length !== queue.length) {
        await this.saveQueueUnsafe(filtered);
        return true;
      }
      return false;
    });
  }

  async clearCompleted(): Promise<number> {
    return this.withStorageLock(async () => {
      const queue = await this.loadQueueUnsafe();
      const kept = queue.filter((a) => a.status !== "completed");
      const count = queue.length - kept.length;
      if (count > 0) {
        await this.saveQueueUnsafe(kept);
      }
      return count;
    });
  }

  async clearAll(): Promise<void> {
    await this.withStorageLock(async () => {
      await this.storage.removeItem(this.storageKey);
    });
  }

  async retryFailedAction(actionId: string): Promise<OfflineActionRecord | null> {
    return this.withStorageLock(async () => {
      const queue = await this.loadQueueUnsafe();
      const idx = queue.findIndex((item) => item.id === actionId);
      if (idx === -1) {
        return null;
      }
      const existing = queue[idx];
      if (!existing || existing.status !== "failed") {
        return existing ?? null;
      }
      const reset: OfflineActionRecord = {
        ...existing,
        status: "pending",
        attempts: 0,
        nextRetryAt: undefined,
        nextRetryAtMs: undefined,
        conflict: false,
        nonRetryable: false,
        lastError: undefined
      };
      queue[idx] = reset;
      await this.saveQueueUnsafe(queue);
      return reset;
    });
  }

  private async dispatchSingle(action: OfflineActionRecord): Promise<CustomDispatchResult> {
    if (this.customDispatcher) {
      try {
        const res = await this.customDispatcher(action);
        if (res.success) {
          return res;
        }
        const conflict = Boolean(res.conflict || res.httpStatus === 409);
        const retryable =
          res.retryable !== undefined
            ? res.retryable
            : conflict
            ? false
            : res.httpStatus !== undefined
            ? isRetryableHttpStatus(res.httpStatus)
            : true;
        return {
          ...res,
          conflict,
          retryable
        };
      } catch (err) {
        return {
          success: false,
          retryable: true,
          error: err instanceof Error ? err.message : "Custom dispatcher error"
        };
      }
    }

    const isAbsolute =
      action.endpoint.startsWith("http://") || action.endpoint.startsWith("https://");
    if (!isAbsolute && (!this.baseUrl || this.baseUrl.length === 0)) {
      return {
        success: false,
        retryable: false,
        error: "OfflineQueueService requires a non-empty baseUrl for relative endpoints."
      };
    }

    const url = isAbsolute
      ? action.endpoint
      : `${this.baseUrl}${action.endpoint.startsWith("/") ? "" : "/"}${action.endpoint}`;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = this.getAccessToken
        ? await Promise.resolve(this.getAccessToken())
        : null;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Idempotency-Key": action.idempotencyKey
      };
      if (token && token.trim() !== "") {
        headers.Authorization = `Bearer ${token.trim()}`;
      }

      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await this.fetchImpl(url, {
        method: action.method,
        headers,
        body: action.payload !== undefined ? JSON.stringify(action.payload) : undefined,
        signal: controller.signal
      });

      if (!res.ok) {
        let errText = "";
        try {
          errText = await res.text();
        } catch {
          // ignore read error
        }
        const conflict = res.status === 409;
        const retryable = !conflict && isRetryableHttpStatus(res.status);
        return {
          success: false,
          httpStatus: res.status,
          conflict,
          retryable,
          error: `HTTP ${res.status}: ${errText || res.statusText}`
        };
      }

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // null json ok
      }

      return {
        success: true,
        httpStatus: res.status,
        data
      };
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
      return {
        success: false,
        retryable: true,
        error: isAbort
          ? `Request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
          ? err.message
          : "Network error"
      };
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  async replayPending(options: ReplayPendingOptions = {}): Promise<ReplayQueueReport> {
    return this.withReplayLock(async () => {
      const force = options.force === true;
      const results: ReplayItemResult[] = [];
      let succeeded = 0;
      let failed = 0;
      let conflicts = 0;
      let skippedBackoff = 0;

      // Claim eligible pending items under the storage lock before performing network I/O
      const claimedItems = await this.withStorageLock(async () => {
        const queue = await this.loadQueueUnsafe();
        const nowMs = this.now();
        const claimed: OfflineActionRecord[] = [];
        let changed = false;

        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          if (!item || item.status !== "pending") {
            continue;
          }
          if (!force && item.nextRetryAtMs !== undefined && item.nextRetryAtMs > nowMs) {
            skippedBackoff++;
            continue;
          }
          const processingRecord: OfflineActionRecord = {
            ...item,
            status: "processing"
          };
          queue[i] = processingRecord;
          claimed.push(processingRecord);
          changed = true;
        }

        if (changed) {
          await this.saveQueueUnsafe(queue);
        }
        return claimed;
      });

      for (const item of claimedItems) {
        const attemptNumber = item.attempts + 1;
        const dispatchResult = await this.dispatchSingle(item);
        const finishedMs = this.now();
        const finishedIso = new Date(finishedMs).toISOString();

        if (dispatchResult.success) {
          succeeded++;
          const updated: OfflineActionRecord = {
            ...item,
            attempts: attemptNumber,
            status: "completed",
            lastAttemptAt: finishedIso,
            nextRetryAt: undefined,
            nextRetryAtMs: undefined,
            lastHttpStatus: dispatchResult.httpStatus,
            conflict: false,
            nonRetryable: false,
            responseData: dispatchResult.data,
            lastError: undefined
          };

          await this.withStorageLock(async () => {
            const currentQueue = await this.loadQueueUnsafe();
            const idx = currentQueue.findIndex((q) => q.id === item.id);
            if (idx !== -1) {
              currentQueue[idx] = updated;
              await this.saveQueueUnsafe(currentQueue);
            }
          });

          results.push({
            actionId: item.id,
            idempotencyKey: item.idempotencyKey,
            type: item.type,
            success: true,
            status: "completed",
            attempts: attemptNumber,
            httpStatus: dispatchResult.httpStatus,
            responseData: dispatchResult.data
          });
        } else {
          failed++;
          const isConflict = dispatchResult.conflict === true || dispatchResult.httpStatus === 409;
          if (isConflict) {
            conflicts++;
          }
          const isNonRetryable = dispatchResult.retryable === false;
          const isTerminal = isConflict || isNonRetryable || attemptNumber >= this.maxAttempts;
          const nextStatus: OfflineActionStatus = isTerminal ? "failed" : "pending";

          let nextRetryAtMs: number | undefined;
          let nextRetryAt: string | undefined;
          if (!isTerminal) {
            const backoffMs = computeBackoffMs(
              attemptNumber,
              this.baseBackoffMs,
              this.maxBackoffMs
            );
            if (backoffMs > 0) {
              nextRetryAtMs = finishedMs + backoffMs;
              nextRetryAt = new Date(nextRetryAtMs).toISOString();
            }
          }

          const updated: OfflineActionRecord = {
            ...item,
            attempts: attemptNumber,
            status: nextStatus,
            lastAttemptAt: finishedIso,
            nextRetryAt,
            nextRetryAtMs,
            lastHttpStatus: dispatchResult.httpStatus,
            conflict: isConflict,
            nonRetryable: isNonRetryable,
            lastError: dispatchResult.error
          };

          await this.withStorageLock(async () => {
            const currentQueue = await this.loadQueueUnsafe();
            const idx = currentQueue.findIndex((q) => q.id === item.id);
            if (idx !== -1) {
              currentQueue[idx] = updated;
              await this.saveQueueUnsafe(currentQueue);
            }
          });

          results.push({
            actionId: item.id,
            idempotencyKey: item.idempotencyKey,
            type: item.type,
            success: false,
            status: nextStatus,
            attempts: attemptNumber,
            httpStatus: dispatchResult.httpStatus,
            conflict: isConflict,
            nextRetryAtMs,
            error: dispatchResult.error
          });
        }
      }

      const remainingPending = await this.withStorageLock(async () => {
        const finalQueue = await this.loadQueueUnsafe();
        return finalQueue.filter((a) => a.status === "pending").length;
      });

      return {
        processed: results.length,
        succeeded,
        failed,
        conflicts,
        skippedBackoff,
        remainingPending,
        results
      };
    });
  }
}
