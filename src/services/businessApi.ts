import { assertCanon0011 } from "../guards/canon";
import {
  ApprovalDecision,
  canonicalPayload,
  ChallengeSigner,
  parseChallenge,
  RocksoulChallenge,
  SignedApprovalResponse,
  signApproval
} from "./rocksoulApproval";

export interface IspSession {
  readonly sessionId: string;
  readonly username: string;
  readonly framedIpAddress: string;
  readonly callingStationId: string;
  readonly nasIpAddress: string;
  readonly sessionTimeSec: number;
  readonly inputOctets: number;
  readonly outputOctets: number;
  readonly status: "active" | "idle" | "stale";
}

export interface DisconnectSessionResult {
  readonly success: boolean;
  readonly sessionId: string;
  readonly reason?: string;
  readonly timestamp: string;
}

export interface PaasApp {
  readonly appId: string;
  readonly name: string;
  readonly status: "running" | "stopped" | "crashed" | "restarting";
  readonly replicas: number;
  readonly cpuPercent: number;
  readonly memoryMb: number;
  readonly uptimeSec: number;
  readonly visualType?: "typographic" | "geometric" | "celestial";
}

export interface RestartPaasAppResult {
  readonly success: boolean;
  readonly appId: string;
  readonly restartedAt: string;
  readonly message?: string;
}

export interface PendingApprovalsResult {
  readonly challenges: readonly RocksoulChallenge[];
}

export interface BusinessApiClientOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => Promise<string | null> | string | null;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

function assertValidString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Field '${fieldName}' must be a non-empty string.`);
  }
  return value.trim();
}

export class BusinessApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null> | string | null;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BusinessApiClientOptions) {
    this.baseUrl = assertValidString(options.baseUrl, "baseUrl").replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<TResult>(
    path: string,
    method: "GET" | "POST",
    body?: unknown
  ): Promise<TResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const token = await Promise.resolve(this.getAccessToken());

    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (token && token.trim() !== "") {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // ignore
        }
        throw new Error(
          `BusinessApiClient HTTP ${response.status} on ${method} ${path}: ${errorBody || response.statusText}`
        );
      }

      const json = (await response.json()) as unknown;
      return json as TResult;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchIspSessions(): Promise<IspSession[]> {
    const data = await this.request<unknown>("/api/business/isp/sessions", "GET");
    if (!Array.isArray(data)) {
      throw new Error("Invalid response format: expected an array of ISP sessions.");
    }
    return data.map((item, index) => {
      if (typeof item !== "object" || item === null) {
        throw new Error(`Invalid session at index ${index}: expected object.`);
      }
      const record = item as Record<string, unknown>;
      return {
        sessionId: assertValidString(record.sessionId, `sessionId[${index}]`),
        username: assertValidString(record.username, `username[${index}]`),
        framedIpAddress: assertValidString(record.framedIpAddress, `framedIpAddress[${index}]`),
        callingStationId: typeof record.callingStationId === "string" ? record.callingStationId : "",
        nasIpAddress: typeof record.nasIpAddress === "string" ? record.nasIpAddress : "",
        sessionTimeSec: typeof record.sessionTimeSec === "number" ? record.sessionTimeSec : 0,
        inputOctets: typeof record.inputOctets === "number" ? record.inputOctets : 0,
        outputOctets: typeof record.outputOctets === "number" ? record.outputOctets : 0,
        status:
          record.status === "idle" || record.status === "stale" ? record.status : "active"
      };
    });
  }

  async disconnectIspSession(sessionId: string, reason?: string): Promise<DisconnectSessionResult> {
    const validSessionId = assertValidString(sessionId, "sessionId");
    const result = await this.request<unknown>(
      `/api/business/isp/sessions/${encodeURIComponent(validSessionId)}/disconnect`,
      "POST",
      { reason: reason?.trim() || "operator_coa_disconnect" }
    );
    if (typeof result !== "object" || result === null) {
      throw new Error("Invalid disconnect response format.");
    }
    const record = result as Record<string, unknown>;
    return {
      success: Boolean(record.success),
      sessionId: assertValidString(record.sessionId ?? validSessionId, "sessionId"),
      reason: typeof record.reason === "string" ? record.reason : undefined,
      timestamp: typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString()
    };
  }

  async fetchPaasApps(): Promise<PaasApp[]> {
    const data = await this.request<unknown>("/api/business/paas/apps", "GET");
    if (!Array.isArray(data)) {
      throw new Error("Invalid response format: expected an array of PaaS apps.");
    }
    return data.map((item, index) => {
      if (typeof item !== "object" || item === null) {
        throw new Error(`Invalid app at index ${index}: expected object.`);
      }
      const record = item as Record<string, unknown>;
      const name = assertValidString(record.name, `name[${index}]`);
      const visualType =
        record.visualType === "typographic" ||
        record.visualType === "geometric" ||
        record.visualType === "celestial"
          ? record.visualType
          : "typographic";

      assertCanon0011({
        title: name,
        visualType
      });

      return {
        appId: assertValidString(record.appId, `appId[${index}]`),
        name,
        status:
          record.status === "stopped" ||
          record.status === "crashed" ||
          record.status === "restarting"
            ? record.status
            : "running",
        replicas: typeof record.replicas === "number" ? record.replicas : 1,
        cpuPercent: typeof record.cpuPercent === "number" ? record.cpuPercent : 0,
        memoryMb: typeof record.memoryMb === "number" ? record.memoryMb : 0,
        uptimeSec: typeof record.uptimeSec === "number" ? record.uptimeSec : 0,
        visualType
      };
    });
  }

  async restartPaasApp(appId: string): Promise<RestartPaasAppResult> {
    const validAppId = assertValidString(appId, "appId");
    const result = await this.request<unknown>(
      `/api/business/paas/apps/${encodeURIComponent(validAppId)}/restart`,
      "POST"
    );
    if (typeof result !== "object" || result === null) {
      throw new Error("Invalid restart response format.");
    }
    const record = result as Record<string, unknown>;
    return {
      success: Boolean(record.success),
      appId: assertValidString(record.appId ?? validAppId, "appId"),
      restartedAt:
        typeof record.restartedAt === "string" ? record.restartedAt : new Date().toISOString(),
      message: typeof record.message === "string" ? record.message : undefined
    };
  }

  async fetchPendingApprovals(now: Date = new Date()): Promise<PendingApprovalsResult> {
    const data = await this.request<unknown>("/api/business/approvals/pending", "GET");
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid pending approvals response format.");
    }
    const record = data as Record<string, unknown>;
    const rawChallenges = Array.isArray(record.challenges) ? record.challenges : [];

    const challenges: RocksoulChallenge[] = [];
    for (const raw of rawChallenges) {
      try {
        const parsed = parseChallenge(raw, now);
        assertCanon0011({
          title: parsed.actionSummary,
          visualType: "typographic"
        });
        challenges.push(parsed);
      } catch {
        // Skip invalid or expired challenges
      }
    }

    return { challenges };
  }

  async submitRocksoulApproval(params: {
    challenge: RocksoulChallenge;
    decision: ApprovalDecision;
    subject: string;
    signer: ChallengeSigner;
    now?: Date;
  }): Promise<SignedApprovalResponse> {
    const activeDate = params.now ?? new Date();
    const signed = await signApproval(
      params.challenge,
      params.decision,
      params.subject,
      params.signer,
      activeDate
    );

    await this.request<unknown>(
      `/api/business/approvals/${encodeURIComponent(signed.challengeId)}/submit`,
      "POST",
      signed
    );

    return signed;
  }
}
