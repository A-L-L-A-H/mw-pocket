import {
  DiskAuditEntry,
  EchoHealthSnapshot,
  MoonWitnessMobileClient,
  RadarEventEntry
} from "../api/client";
import { parseChallenge, RocksoulChallenge } from "../services/rocksoulApproval";

export type OpsGuardAlertSeverity = "info" | "warning" | "critical";
export type OpsGuardAlertSource = "disk" | "rocksoul" | "whatsapp" | "echo" | "worldradar";

export interface OpsGuardAlert {
  readonly id: string;
  readonly source: OpsGuardAlertSource;
  readonly severity: OpsGuardAlertSeverity;
  readonly title: string;
  readonly detail: string;
  readonly timestamp: string;
}

export interface EchoV1SystemHealth {
  readonly status: string;
  readonly engine?: string;
  readonly devices_total: number;
  readonly devices_connected: number;
  readonly chats_total: number;
  readonly messages_total: number;
  readonly media_total: number;
}

export interface OpsGuardHealthReport {
  readonly evaluatedAt: string;
  readonly overallStatus: "healthy" | "degraded" | "critical";
  readonly alerts: readonly OpsGuardAlert[];
  readonly echoStatus: EchoHealthSnapshot["status"];
  readonly whatsappConnected: boolean;
  readonly diskCriticalCount: number;
  readonly pendingR4Count: number;
}

export type OpsGuardAlertListener = (report: OpsGuardHealthReport) => void;

export interface EvaluateOpsGuardInput {
  readonly drives: readonly DiskAuditEntry[];
  readonly rawChallenges: readonly unknown[];
  readonly echoHealth?: EchoHealthSnapshot;
  readonly whatsappHealth?: EchoV1SystemHealth;
  readonly radarEvents?: readonly RadarEventEntry[];
  readonly now?: Date;
}

export function evaluateOpsGuardAlerts(input: EvaluateOpsGuardInput): OpsGuardHealthReport {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const alerts: OpsGuardAlert[] = [];

  let diskCriticalCount = 0;
  for (const drive of input.drives) {
    if (drive.status === "critical" || drive.usedPercent >= 90 || drive.freeGb <= 5) {
      diskCriticalCount += 1;
      alerts.push({
        id: `disk:${drive.drive}`,
        source: "disk",
        severity: "critical",
        title: `Critical disk pressure on ${drive.drive}`,
        detail: `${drive.usedPercent.toFixed(1)}% used (${drive.freeGb.toFixed(1)} GB free)`,
        timestamp
      });
    } else if (drive.status === "warning" || drive.usedPercent >= 80 || drive.freeGb <= 15) {
      alerts.push({
        id: `disk:${drive.drive}`,
        source: "disk",
        severity: "warning",
        title: `Disk usage warning on ${drive.drive}`,
        detail: `${drive.usedPercent.toFixed(1)}% used (${drive.freeGb.toFixed(1)} GB free)`,
        timestamp
      });
    }
  }

  let pendingR4Count = 0;
  const validChallenges: RocksoulChallenge[] = [];
  for (const raw of input.rawChallenges) {
    try {
      const parsed = parseChallenge(raw, now);
      validChallenges.push(parsed);
      if (parsed.riskTier === "R4") {
        pendingR4Count += 1;
      }
    } catch {
      // Ignore expired or malformed challenges
    }
  }

  for (const ch of validChallenges) {
    alerts.push({
      id: `rocksoul:${ch.challengeId}`,
      source: "rocksoul",
      severity: ch.riskTier === "R4" ? "critical" : "warning",
      title: `${ch.riskTier} approval required: ${ch.actionSummary}`,
      detail: `digest ${ch.diffDigest} (expires ${ch.expiresAt})`,
      timestamp
    });
  }

  const echoStatus: EchoHealthSnapshot["status"] = input.echoHealth?.status ?? "ok";
  if (echoStatus !== "ok") {
    alerts.push({
      id: "echo:health",
      source: "echo",
      severity: echoStatus === "offline" ? "critical" : "warning",
      title: `mw-echo status is ${echoStatus}`,
      detail: `Uptime ${input.echoHealth?.uptimeSec ?? 0}s`,
      timestamp
    });
  }

  const whatsappConnected =
    input.whatsappHealth !== undefined
      ? input.whatsappHealth.devices_connected > 0
      : true;
  if (input.whatsappHealth && input.whatsappHealth.devices_connected === 0) {
    alerts.push({
      id: "whatsapp:disconnected",
      source: "whatsapp",
      severity: "warning",
      title: "WhatsApp bridge has 0 connected devices",
      detail: `Registered devices: ${input.whatsappHealth.devices_total}`,
      timestamp
    });
  }

  for (const ev of input.radarEvents ?? []) {
    if (!ev.acknowledged && ev.severity === "P0") {
      alerts.push({
        id: `worldradar:${ev.id}`,
        source: "worldradar",
        severity: "critical",
        title: `WorldRadar P0 (${ev.source})`,
        detail: ev.headline,
        timestamp: ev.timestamp || timestamp
      });
    }
  }

  let overallStatus: OpsGuardHealthReport["overallStatus"] = "healthy";
  if (alerts.some((a) => a.severity === "critical")) {
    overallStatus = "critical";
  } else if (alerts.some((a) => a.severity === "warning")) {
    overallStatus = "degraded";
  }

  return {
    evaluatedAt: timestamp,
    overallStatus,
    alerts,
    echoStatus,
    whatsappConnected,
    diskCriticalCount,
    pendingR4Count
  };
}

export interface OpsGuardMonitorConfig {
  readonly client: MoonWitnessMobileClient;
  readonly echoBaseUrl: string;
  readonly accessToken?: string;
  readonly fetchImpl?: typeof fetch;
}

export class OpsGuardMonitor {
  private readonly client: MoonWitnessMobileClient;
  private readonly echoBaseUrl: string;
  private readonly accessToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly listeners = new Set<OpsGuardAlertListener>();

  constructor(config: OpsGuardMonitorConfig) {
    this.client = config.client;
    this.echoBaseUrl = config.echoBaseUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  subscribe(listener: OpsGuardAlertListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async fetchWhatsappV1Health(): Promise<EchoV1SystemHealth> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const response = await this.fetchImpl(`${this.echoBaseUrl}/api/v1/system/health`, {
      method: "GET",
      headers
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on GET /api/v1/system/health`);
    }
    const body = (await response.json()) as {
      results?: EchoV1SystemHealth;
    } & Partial<EchoV1SystemHealth>;
    if (body.results) {
      return body.results;
    }
    return {
      status: body.status ?? "unknown",
      engine: body.engine,
      devices_total: body.devices_total ?? 0,
      devices_connected: body.devices_connected ?? 0,
      chats_total: body.chats_total ?? 0,
      messages_total: body.messages_total ?? 0,
      media_total: body.media_total ?? 0
    };
  }

  async pollOnce(now: Date = new Date()): Promise<OpsGuardHealthReport> {
    const [echoHealthSnap, diskSnap, challengesSnap, radarSnap, waHealth] = await Promise.all([
      this.client.getEchoHealth(),
      this.client.getDiskAudit(),
      this.client.getRocksoulChallenges(),
      this.client.getRadarEvents(),
      this.fetchWhatsappV1Health()
    ]);

    const report = evaluateOpsGuardAlerts({
      drives: diskSnap.payload,
      rawChallenges: challengesSnap.payload,
      echoHealth: echoHealthSnap.payload,
      whatsappHealth: waHealth,
      radarEvents: radarSnap.payload,
      now
    });

    for (const listener of this.listeners) {
      listener(report);
    }

    return report;
  }
}
