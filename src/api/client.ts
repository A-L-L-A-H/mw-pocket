import { filterCanonSafePayloads } from "../guards/canon";
import {
  RocksoulChallenge,
  SignedApprovalResponse
} from "../services/rocksoulApproval";

export interface SnapshotCacheAdapter {
  getSnapshot(key: string): Promise<string | null>;
  setSnapshot(key: string, serialized: string): Promise<void>;
  clearSnapshots(): Promise<void>;
}

export function createInMemorySnapshotCache(): SnapshotCacheAdapter {
  const store = new Map<string, string>();
  return {
    async getSnapshot(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async setSnapshot(key: string, serialized: string): Promise<void> {
      store.set(key, serialized);
    },
    async clearSnapshots(): Promise<void> {
      store.clear();
    }
  };
}

export function createAsyncStorageSnapshotCache(): SnapshotCacheAdapter {
  const prefix = "mw_pocket_cache_v1:";
  return {
    async getSnapshot(key: string): Promise<string | null> {
      const storage = (await import("@react-native-async-storage/async-storage")).default;
      return storage.getItem(`${prefix}${key}`);
    },
    async setSnapshot(key: string, serialized: string): Promise<void> {
      const storage = (await import("@react-native-async-storage/async-storage")).default;
      await storage.setItem(`${prefix}${key}`, serialized);
    },
    async clearSnapshots(): Promise<void> {
      const storage = (await import("@react-native-async-storage/async-storage")).default;
      const allKeys = await storage.getAllKeys();
      const cacheKeys = allKeys.filter((entry) => entry.startsWith(prefix));
      if (cacheKeys.length > 0) {
        await storage.multiRemove(cacheKeys);
      }
    }
  };
}

export interface EchoHealthSnapshot {
  readonly status: "ok" | "degraded" | "offline";
  readonly uptimeSec: number;
  readonly arenaLevel: number;
  readonly arenaXp: number;
  readonly streakDays: number;
}

export interface FleetServiceEntry {
  readonly id: string;
  readonly name: string;
  readonly port: number;
  readonly status: "online" | "degraded" | "offline";
  readonly latencyMs: number;
}

export interface ArsyAuditVerification {
  readonly sealed: boolean;
  readonly merkleRoot: string;
  readonly verifiedEntries: number;
  readonly checkedAt: string;
}

export interface BountyTaskEntry {
  readonly id: string;
  readonly title: string;
  readonly status: "todo" | "in_progress" | "review" | "done";
  readonly xpReward: number;
  readonly priority: "P0" | "P1" | "P2";
}

export interface RadarEventEntry {
  readonly id: string;
  readonly source: "IDX/BEI" | "USGS" | "CISA KEV" | "arXiv" | string;
  readonly severity: "P0" | "P1" | "P2";
  readonly headline: string;
  readonly timestamp: string;
  readonly acknowledged: boolean;
}

export interface DiskAuditEntry {
  readonly drive: string;
  readonly usedPercent: number;
  readonly freeGb: number;
  readonly totalGb: number;
  readonly status: "healthy" | "warning" | "critical";
}

export interface StorageBackupResult {
  readonly triggered: boolean;
  readonly jobId: string;
  readonly target: string;
  readonly timestamp: string;
}

export interface SidekickChatReply {
  readonly reply: string;
  readonly model: string;
  readonly latencyMs: number;
}

export interface CoderRunEntry {
  readonly runId: string;
  readonly mission: string;
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly logTail: string;
  readonly updatedAt: string;
}

export interface WhatsappStatusSnapshot {
  readonly connected: boolean;
  readonly deviceLabel: string;
  readonly telegramReady: boolean;
  readonly discordReady: boolean;
}

export interface AqelRootAnalysis {
  readonly input: string;
  readonly root: string;
  readonly meaning: string;
  readonly occurrences: number;
}

export interface MTimeSnapshot {
  readonly mTimeLabel: string;
  readonly hijriDate: string;
  readonly lunarPhase: string;
  readonly gregorianIso: string;
}

export interface DailyPromiseCard {
  readonly id: string;
  readonly title: string;
  readonly verseRef: string;
  readonly arabicText: string;
  readonly translation: string;
  readonly visualType: "typographic" | "geometric" | "celestial" | "crescent" | "orbit";
}

export interface PocketClientConfig {
  readonly echoUrl: string;
  readonly myloveUrl: string;
  readonly accessToken?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly cache?: SnapshotCacheAdapter;
}

export interface CachedResult<TValue> {
  readonly payload: TValue;
  readonly fromCache: boolean;
}

export class MoonWitnessMobileClient {
  private readonly echoBaseUrl: string;
  private readonly myloveBaseUrl: string;
  private readonly accessToken?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: SnapshotCacheAdapter;

  constructor(config: PocketClientConfig) {
    this.echoBaseUrl = config.echoUrl.replace(/\/+$/, "");
    this.myloveBaseUrl = config.myloveUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.cache = config.cache ?? createInMemorySnapshotCache();
  }

  private buildHeaders(hasJsonBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (hasJsonBody) {
      headers["Content-Type"] = "application/json";
    }
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  private async requestJson<TValue>(
    baseUrl: string,
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH";
      body?: unknown;
      cacheKey?: string;
    } = {}
  ): Promise<CachedResult<TValue>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const method = options.method ?? "GET";
    const fullUrl = `${baseUrl}${path}`;

    try {
      const response = await this.fetchImpl(fullUrl, {
        method,
        headers: this.buildHeaders(options.body !== undefined),
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} on ${method} ${path}`);
      }
      const parsed = (await response.json()) as TValue;
      if (method === "GET" && options.cacheKey) {
        await this.cache.setSnapshot(options.cacheKey, JSON.stringify(parsed));
      }
      return { payload: parsed, fromCache: false };
    } catch (networkError) {
      if (method === "GET" && options.cacheKey) {
        const cachedRaw = await this.cache.getSnapshot(options.cacheKey);
        if (cachedRaw) {
          return {
            payload: JSON.parse(cachedRaw) as TValue,
            fromCache: true
          };
        }
      }
      throw networkError;
    } finally {
      clearTimeout(timer);
    }
  }

  async getEchoHealth(): Promise<CachedResult<EchoHealthSnapshot>> {
    return this.requestJson<EchoHealthSnapshot>(this.echoBaseUrl, "/health", {
      cacheKey: "echo_health"
    });
  }

  async getFleetServices(): Promise<CachedResult<FleetServiceEntry[]>> {
    return this.requestJson<FleetServiceEntry[]>(this.echoBaseUrl, "/api/fleet/services", {
      cacheKey: "fleet_services"
    });
  }

  async verifyArsyAudit(): Promise<CachedResult<ArsyAuditVerification>> {
    return this.requestJson<ArsyAuditVerification>(
      this.echoBaseUrl,
      "/api/fleet/arsy/audit/verify",
      { cacheKey: "arsy_audit" }
    );
  }

  async getBountyTasks(): Promise<CachedResult<BountyTaskEntry[]>> {
    return this.requestJson<BountyTaskEntry[]>(this.echoBaseUrl, "/api/tasks", {
      cacheKey: "bounty_tasks"
    });
  }

  async advanceBountyTask(
    taskId: string,
    nextStatus: BountyTaskEntry["status"]
  ): Promise<BountyTaskEntry> {
    const result = await this.requestJson<BountyTaskEntry>(this.echoBaseUrl, "/api/tasks", {
      method: "PATCH",
      body: { id: taskId, status: nextStatus }
    });
    return result.payload;
  }

  async getRadarEvents(): Promise<CachedResult<RadarEventEntry[]>> {
    return this.requestJson<RadarEventEntry[]>(this.echoBaseUrl, "/api/radar/events", {
      cacheKey: "radar_events"
    });
  }

  async acknowledgeRadarEvent(eventId: string): Promise<{ acknowledged: boolean }> {
    const result = await this.requestJson<{ acknowledged: boolean }>(
      this.echoBaseUrl,
      "/api/radar/events",
      {
        method: "POST",
        body: { id: eventId, action: "acknowledge" }
      }
    );
    return result.payload;
  }

  async getDiskAudit(): Promise<CachedResult<DiskAuditEntry[]>> {
    return this.requestJson<DiskAuditEntry[]>(this.echoBaseUrl, "/api/disk/audit", {
      cacheKey: "disk_audit"
    });
  }

  async getRocksoulChallenges(): Promise<CachedResult<RocksoulChallenge[]>> {
    return this.requestJson<RocksoulChallenge[]>(
      this.echoBaseUrl,
      "/api/rocksoul/approvals/pending",
      { cacheKey: "rocksoul_pending_approvals" }
    );
  }

  async submitRocksoulApproval(
    signed: SignedApprovalResponse
  ): Promise<{ challengeId: string; status: "approved" | "denied" }> {
    const result = await this.requestJson<{ challengeId: string; status: "approved" | "denied" }>(
      this.echoBaseUrl,
      `/api/rocksoul/approvals/${encodeURIComponent(signed.challengeId)}`,
      {
        method: "POST",
        body: signed
      }
    );
    return result.payload;
  }

  async triggerNineDriveBackup(): Promise<StorageBackupResult> {
    const result = await this.requestJson<StorageBackupResult>(
      this.echoBaseUrl,
      "/api/storage/backup",
      {
        method: "POST",
        body: { target: "9drive" }
      }
    );
    return result.payload;
  }

  async sendSidekickChat(prompt: string): Promise<SidekickChatReply> {
    const result = await this.requestJson<SidekickChatReply>(this.echoBaseUrl, "/api/ai/chat", {
      method: "POST",
      body: { message: prompt }
    });
    return result.payload;
  }

  async getCoderRuns(): Promise<CachedResult<CoderRunEntry[]>> {
    return this.requestJson<CoderRunEntry[]>(this.echoBaseUrl, "/api/coder/runs", {
      cacheKey: "coder_runs"
    });
  }

  async launchCoderMission(mission: string): Promise<CoderRunEntry> {
    const result = await this.requestJson<CoderRunEntry>(this.echoBaseUrl, "/api/coder/runs", {
      method: "POST",
      body: { mission }
    });
    return result.payload;
  }

  async getWhatsappStatus(): Promise<CachedResult<WhatsappStatusSnapshot>> {
    return this.requestJson<WhatsappStatusSnapshot>(this.echoBaseUrl, "/api/whatsapp/status", {
      cacheKey: "whatsapp_status"
    });
  }

  async sendCommsMessage(params: {
    channel: "whatsapp" | "telegram" | "discord";
    recipient: string;
    message: string;
  }): Promise<{ delivered: boolean; channel: string }> {
    const result = await this.requestJson<{ delivered: boolean; channel: string }>(
      this.echoBaseUrl,
      "/api/comms/send",
      {
        method: "POST",
        body: params
      }
    );
    return result.payload;
  }

  async getPocketPairConfig(): Promise<CachedResult<{ pairUri: string }>> {
    return this.requestJson<{ pairUri: string }>(this.echoBaseUrl, "/api/pocket/pair-config", {
      cacheKey: "pocket_pair_config"
    });
  }

  async analyzeAqelRoot(term: string): Promise<AqelRootAnalysis> {
    const result = await this.requestJson<AqelRootAnalysis>(
      this.myloveBaseUrl,
      "/api/aqel/analyze",
      {
        method: "POST",
        body: { term }
      }
    );
    return result.payload;
  }

  async getAntikytheraTime(): Promise<CachedResult<MTimeSnapshot>> {
    return this.requestJson<MTimeSnapshot>(this.myloveBaseUrl, "/api/time/convert", {
      cacheKey: "antikythera_time"
    });
  }

  async getDailyPromiseCards(): Promise<CachedResult<DailyPromiseCard[]>> {
    const result = await this.requestJson<DailyPromiseCard[]>(
      this.myloveBaseUrl,
      "/api/cards/daily",
      { cacheKey: "daily_promise_cards" }
    );
    return {
      payload: filterCanonSafePayloads(result.payload),
      fromCache: result.fromCache
    };
  }
}
