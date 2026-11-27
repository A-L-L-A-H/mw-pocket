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
  readonly error?: string;
  readonly responseData?: unknown;
}

export interface ReplayQueueReport {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly remainingPending: number;
  readonly results: readonly ReplayItemResult[];
}

export interface OfflineQueueServiceOptions {
  readonly storage?: OfflineQueueStorageAdapter;
  readonly storageKey?: string;
  readonly maxAttempts?: number;
  readonly baseUrl?: string;
  readonly getAccessToken?: () => Promise<string | null> | string | null;
  readonly fetchImpl?: typeof fetch;
  readonly customDispatcher?: (
    action: OfflineActionRecord
  ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
}

const DEFAULT_STORAGE_KEY = "mw_pocket_offline_queue_v1";
const DEFAULT_MAX_ATTEMPTS = 5;

function generateSecureId(prefix = "act"): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export class OfflineQueueService {
  private readonly storage: OfflineQueueStorageAdapter;
  private readonly storageKey: string;
  private readonly maxAttempts: number;
  private readonly baseUrl?: string;
  private readonly getAccessToken?: () => Promise<string | null> | string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly customDispatcher?: (
    action: OfflineActionRecord
  ) => Promise<{ success: boolean; data?: unknown; error?: string }>;

  constructor(options: OfflineQueueServiceOptions = {}) {
    this.storage = options.storage ?? createInMemoryQueueStorage();
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseUrl = options.baseUrl?.trim().replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.customDispatcher = options.customDispatcher;
  }

  private async loadQueue(): Promise<OfflineActionRecord[]> {
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

  private async saveQueue(queue: readonly OfflineActionRecord[]): Promise<void> {
    await this.storage.setItem(this.storageKey, JSON.stringify(queue));
  }

  async getAllActions(): Promise<readonly OfflineActionRecord[]> {
    return this.loadQueue();
  }

  async getPendingActions(): Promise<readonly OfflineActionRecord[]> {
    const queue = await this.loadQueue();
    return queue.filter((item) => item.status === "pending");
  }

  async enqueueAction<TPayload = Record<string, unknown>>(
    opts: EnqueueActionOptions<TPayload>
  ): Promise<OfflineActionRecord<TPayload>> {
    const queue = await this.loadQueue();

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
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: "pending"
    };

    queue.push(action as unknown as OfflineActionRecord);
    await this.saveQueue(queue);
    return action;
  }

  async removeAction(actionId: string): Promise<boolean> {
    const queue = await this.loadQueue();
    const filtered = queue.filter((a) => a.id !== actionId);
    if (filtered.length !== queue.length) {
      await this.saveQueue(filtered);
      return true;
    }
    return false;
  }

  async clearCompleted(): Promise<number> {
    const queue = await this.loadQueue();
    const kept = queue.filter((a) => a.status !== "completed");
    const count = queue.length - kept.length;
    if (count > 0) {
      await this.saveQueue(kept);
    }
    return count;
  }

  async clearAll(): Promise<void> {
    await this.storage.removeItem(this.storageKey);
  }

  private async dispatchSingle(
    action: OfflineActionRecord
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (this.customDispatcher) {
      return this.customDispatcher(action);
    }

    const url = action.endpoint.startsWith("http://") || action.endpoint.startsWith("https://")
      ? action.endpoint
      : `${this.baseUrl ?? ""}${action.endpoint.startsWith("/") ? "" : "/"}${action.endpoint}`;

    const token = this.getAccessToken ? await Promise.resolve(this.getAccessToken()) : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": action.idempotencyKey
    };
    if (token && token.trim() !== "") {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    try {
      const res = await this.fetchImpl(url, {
        method: action.method,
        headers,
        body: action.payload !== undefined ? JSON.stringify(action.payload) : undefined
      });

      if (!res.ok) {
        let errText = "";
        try {
          errText = await res.text();
        } catch {
          // ignore
        }
        return {
          success: false,
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
        data
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error"
      };
    }
  }

  async replayPending(): Promise<ReplayQueueReport> {
    const queue = await this.loadQueue();
    const results: ReplayItemResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (!item || item.status !== "pending") {
        continue;
      }

      const attemptNumber = item.attempts + 1;
      const dispatchResult = await this.dispatchSingle(item);

      if (dispatchResult.success) {
        succeeded++;
        const updated: OfflineActionRecord = {
          ...item,
          attempts: attemptNumber,
          status: "completed",
          lastAttemptAt: new Date().toISOString(),
          responseData: dispatchResult.data,
          lastError: undefined
        };
        queue[i] = updated;
        results.push({
          actionId: item.id,
          idempotencyKey: item.idempotencyKey,
          type: item.type,
          success: true,
          status: "completed",
          attempts: attemptNumber,
          responseData: dispatchResult.data
        });
      } else {
        failed++;
        const isPermanentlyFailed = attemptNumber >= this.maxAttempts;
        const nextStatus: OfflineActionStatus = isPermanentlyFailed ? "failed" : "pending";
        const updated: OfflineActionRecord = {
          ...item,
          attempts: attemptNumber,
          status: nextStatus,
          lastAttemptAt: new Date().toISOString(),
          lastError: dispatchResult.error
        };
        queue[i] = updated;
        results.push({
          actionId: item.id,
          idempotencyKey: item.idempotencyKey,
          type: item.type,
          success: false,
          status: nextStatus,
          attempts: attemptNumber,
          error: dispatchResult.error
        });
      }
    }

    await this.saveQueue(queue);

    const remainingPending = queue.filter((a) => a.status === "pending").length;

    return {
      processed: results.length,
      succeeded,
      failed,
      remainingPending,
      results
    };
  }
}
