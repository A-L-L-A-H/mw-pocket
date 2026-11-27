import type { ApprovalDecision } from "./rocksoulApproval";

export type PocketRouteTab =
  | "HQ"
  | "Ops"
  | "Vouchers"
  | "Sidekick"
  | "Radar"
  | "Comms"
  | "Vault"
  | "MyLove"
  | "Settings";

export type VoiceCommandIntent =
  | { readonly kind: "navigate"; readonly tab: PocketRouteTab }
  | { readonly kind: "probe_fleet" }
  | { readonly kind: "sync_offline_queue" }
  | {
      readonly kind: "generate_vouchers";
      readonly count: number;
      readonly rateLimit: string;
      readonly timeLimitSecs: number;
    }
  | {
      readonly kind: "disconnect_isp_session";
      readonly sessionId: string;
      readonly reason?: string;
    }
  | { readonly kind: "restart_paas_app"; readonly appId: string }
  | {
      readonly kind: "rocksoul_approval";
      readonly challengeId: string;
      readonly decision: ApprovalDecision;
      readonly requiresConfirmation: true;
    }
  | { readonly kind: "sidekick_prompt"; readonly prompt: string }
  | { readonly kind: "ack_radar_event"; readonly eventId: string }
  | { readonly kind: "unknown"; readonly rawTranscript: string };

export interface ParsedVoiceCommand {
  readonly intent: VoiceCommandIntent;
  readonly normalizedText: string;
  readonly confidence: number;
  readonly language: "en" | "id" | "mixed";
}

export interface VoiceCommandHandlers {
  readonly navigate?: (tab: PocketRouteTab) => Promise<void> | void;
  readonly probeFleet?: () => Promise<unknown>;
  readonly syncOfflineQueue?: () => Promise<unknown>;
  readonly generateVouchers?: (params: {
    count: number;
    rateLimit: string;
    timeLimitSecs: number;
  }) => Promise<unknown>;
  readonly disconnectIspSession?: (sessionId: string, reason?: string) => Promise<unknown>;
  readonly restartPaasApp?: (appId: string) => Promise<unknown>;
  readonly submitRocksoulApproval?: (
    challengeId: string,
    decision: ApprovalDecision
  ) => Promise<unknown>;
  readonly sendSidekickPrompt?: (prompt: string) => Promise<unknown>;
  readonly ackRadarEvent?: (eventId: string) => Promise<unknown>;
  readonly confirmDangerousAction?: (intent: VoiceCommandIntent) => Promise<boolean>;
}

export interface VoiceDispatchResult {
  readonly executed: boolean;
  readonly awaitingConfirmation?: boolean;
  readonly intent: VoiceCommandIntent;
  readonly message: string;
  readonly payload?: unknown;
}

export interface SpeechTranscriber {
  transcribe(audio: { uri: string; mimeType?: string }): Promise<string>;
}

const INDONESIAN_MARKERS = new Set([
  "buka",
  "ke",
  "tampilkan",
  "lihat",
  "pindah",
  "cek",
  "periksa",
  "armada",
  "kirim",
  "sinkron",
  "sinkronkan",
  "antrean",
  "antrian",
  "buat",
  "buatkan",
  "cetak",
  "terbitkan",
  "kupon",
  "jam",
  "menit",
  "hari",
  "detik",
  "putus",
  "putuskan",
  "sesi",
  "alasan",
  "karena",
  "mulai",
  "ulang",
  "aplikasi",
  "layanan",
  "setujui",
  "terima",
  "izinkan",
  "tolak",
  "batalkan",
  "tantangan",
  "persetujuan",
  "tandai",
  "kejadian",
  "tanya",
  "tanyakan",
  "minta",
  "markas",
  "beranda",
  "operasi",
  "bisnis",
  "pengaturan",
  "setelan",
  "konfigurasi",
  "komunikasi",
  "pesan",
  "brankas",
  "tugas",
  "asisten"
]);

const ENGLISH_MARKERS = new Set([
  "open",
  "go",
  "to",
  "show",
  "switch",
  "navigate",
  "probe",
  "check",
  "scan",
  "fleet",
  "sync",
  "flush",
  "queue",
  "offline",
  "generate",
  "create",
  "make",
  "issue",
  "voucher",
  "vouchers",
  "for",
  "hours",
  "hour",
  "minutes",
  "minute",
  "days",
  "day",
  "seconds",
  "second",
  "disconnect",
  "kick",
  "drop",
  "session",
  "reason",
  "restart",
  "reboot",
  "app",
  "approve",
  "accept",
  "confirm",
  "allow",
  "deny",
  "reject",
  "decline",
  "challenge",
  "ack",
  "acknowledge",
  "event",
  "ask",
  "tell",
  "settings",
  "vault"
]);

const TAB_ALIASES: ReadonlyArray<{ tab: PocketRouteTab; patterns: readonly RegExp[] }> = [
  {
    tab: "Vouchers",
    patterns: [/\bvouchers?\b/, /\bkupon\b/, /\bhotspot\b/]
  },
  {
    tab: "Ops",
    patterns: [/\bbusiness\s+ops\b/, /\bops\b/, /\boperasi\b/, /\bbisnis\b/]
  },
  {
    tab: "HQ",
    patterns: [/\bhq\s+fleet\b/, /\bhq\b/, /\bmarkas\b/, /\bberanda\b/, /\bhome\b/, /\bfleet\b/]
  },
  {
    tab: "Sidekick",
    patterns: [/\bsidekick\b/, /\basisten\b/]
  },
  {
    tab: "Radar",
    patterns: [/\bworld\s+radar\b/, /\bradar\b/, /\bpantau\b/]
  },
  {
    tab: "Comms",
    patterns: [/\bcomms\b/, /\bkomunikasi\b/, /\bpesan\b/, /\bwhatsapp\b/]
  },
  {
    tab: "Vault",
    patterns: [/\bbounty\s+vault\b/, /\bvault\b/, /\bbounty\b/, /\bbrankas\b/, /\btugas\b/]
  },
  {
    tab: "MyLove",
    patterns: [/\bmylove\b/, /\bmy\s+love\b/, /\baqel\b/, /\bspiritual\b/]
  },
  {
    tab: "Settings",
    patterns: [/\bsettings?\b/, /\bpengaturan\b/, /\bsetelan\b/, /\bkonfigurasi\b/]
  }
];

export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,!?;:"'()\[\]{}]+/g, " ")
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguage(normalizedText: string): "en" | "id" | "mixed" {
  const tokens = normalizedText.split(" ").filter(Boolean);
  let hasEn = false;
  let hasId = false;
  for (const token of tokens) {
    if (INDONESIAN_MARKERS.has(token)) {
      hasId = true;
    }
    if (ENGLISH_MARKERS.has(token)) {
      hasEn = true;
    }
  }
  if (hasEn && hasId) {
    return "mixed";
  }
  if (hasId) {
    return "id";
  }
  return "en";
}

function normalizeRateLimit(rawRate: string): string {
  const match = /^(\d+)([kmg])\/(\d+)([kmg])$/i.exec(rawRate.trim());
  if (!match) {
    return "2M/5M";
  }
  const normalizeUnit = (unit: string): string => {
    const lower = unit.toLowerCase();
    if (lower === "k") return unit === "K" ? "K" : "k";
    if (lower === "m") return "M";
    return "G";
  };
  return `${match[1]}${normalizeUnit(match[2] ?? "M")}/${match[3]}${normalizeUnit(match[4] ?? "M")}`;
}

function extractDurationSecs(normalizedText: string): number {
  const withoutRateLimits = normalizedText.replace(/\b\d+[kmg]\/\d+[kmg]\b/gi, " ");
  const dayMatch = /\b(\d+)\s*(?:days?|hari|d)\b/.exec(withoutRateLimits);
  if (dayMatch?.[1]) {
    const val = Number.parseInt(dayMatch[1], 10);
    if (val > 0) return val * 86400;
  }
  const hourMatch = /\b(\d+)\s*(?:hours?|hrs?|jam|h)\b/.exec(withoutRateLimits);
  if (hourMatch?.[1]) {
    const val = Number.parseInt(hourMatch[1], 10);
    if (val > 0) return val * 3600;
  }
  const minuteMatch = /\b(\d+)\s*(?:minutes?|mins?|menit|m)\b/.exec(withoutRateLimits);
  if (minuteMatch?.[1]) {
    const val = Number.parseInt(minuteMatch[1], 10);
    if (val > 0) return val * 60;
  }
  const secondMatch = /\b(\d+)\s*(?:seconds?|secs?|detik|s)\b/.exec(withoutRateLimits);
  if (secondMatch?.[1]) {
    const val = Number.parseInt(secondMatch[1], 10);
    if (val > 0) return val;
  }
  return 3600;
}

function matchTab(targetText: string): PocketRouteTab | null {
  for (const entry of TAB_ALIASES) {
    for (const pattern of entry.patterns) {
      if (pattern.test(targetText)) {
        return entry.tab;
      }
    }
  }
  return null;
}

export function parseVoiceCommand(rawTranscript: string): ParsedVoiceCommand {
  const normalizedText = normalizeTranscript(rawTranscript);
  if (normalizedText === "") {
    return {
      intent: { kind: "unknown", rawTranscript },
      normalizedText: "",
      confidence: 0,
      language: "en"
    };
  }

  const language = detectLanguage(normalizedText);

  // 1. Rocksoul R3/R4 Approval (always requiresConfirmation: true)
  const approvalMatch =
    /^(approve|accept|confirm|allow|setujui|terima|izinkan|konfirmasi|deny|reject|decline|tolak|batalkan)\s+(?:rocksoul\s+)?(?:(?:r3|r4)\s+)?(?:challenge|approval|request|tantangan|persetujuan)\s+(?:id\s+)?([a-z0-9._-]+)$/.exec(
      normalizedText
    );
  if (approvalMatch?.[1] && approvalMatch[2]) {
    const verb = approvalMatch[1];
    const decision: ApprovalDecision =
      verb === "deny" || verb === "reject" || verb === "decline" || verb === "tolak" || verb === "batalkan"
        ? "deny"
        : "approve";
    return {
      intent: {
        kind: "rocksoul_approval",
        challengeId: approvalMatch[2],
        decision,
        requiresConfirmation: true
      },
      normalizedText,
      confidence: 0.96,
      language
    };
  }

  // 2. ISP Session Disconnect
  const disconnectMatch =
    /^(?:disconnect|kick|drop|terminate|coa\s+disconnect|putus|putuskan|tendang|hentikan)\s+(?:isp\s+)?(?:session|sesi|user|pengguna)?\s*([a-z0-9._:@-]+)(?:\s+(?:reason|because|alasan|karena)\s+(.+))?$/.exec(
      normalizedText
    );
  if (disconnectMatch?.[1]) {
    return {
      intent: {
        kind: "disconnect_isp_session",
        sessionId: disconnectMatch[1],
        reason: disconnectMatch[2]?.trim() || undefined
      },
      normalizedText,
      confidence: 0.94,
      language
    };
  }

  // 3. PaaS App Restart
  const restartMatch =
    /^(?:restart|reboot|mulai\s+ulang|hidupkan\s+ulang)\s+(?:paas\s+)?(?:app|aplikasi|layanan|service)?\s*([a-z0-9._-]+)$/.exec(
      normalizedText
    );
  if (restartMatch?.[1]) {
    return {
      intent: {
        kind: "restart_paas_app",
        appId: restartMatch[1]
      },
      normalizedText,
      confidence: 0.94,
      language
    };
  }

  // 4. Radar Event Acknowledge
  const radarAckMatch =
    /^(?:ack|acknowledge|konfirmasi|tandai)\s+(?:radar\s+)?(?:event|alert|kejadian|sinyal)?\s*([a-z0-9._-]+)$/.exec(
      normalizedText
    );
  if (radarAckMatch?.[1]) {
    return {
      intent: {
        kind: "ack_radar_event",
        eventId: radarAckMatch[1]
      },
      normalizedText,
      confidence: 0.92,
      language
    };
  }

  // 5. Hotspot Voucher Batch Generation
  const hasVoucherNoun = /\b(?:vouchers?|kupon)\b/.test(normalizedText);
  const hasGenerateVerb = /\b(?:generate|create|make|issue|buat|buatkan|cetak|terbitkan)\b/.test(
    normalizedText
  );
  if (hasVoucherNoun && hasGenerateVerb) {
    const countMatch =
      /\b(\d{1,4})\s+(?:hotspot\s+)?(?:vouchers?|kupon)\b/.exec(normalizedText) ??
      /\b(?:count|jumlah)\s+(\d{1,4})\b/.exec(normalizedText);
    const parsedCount = countMatch?.[1] ? Number.parseInt(countMatch[1], 10) : 1;
    const count = Math.max(1, Math.min(1000, Number.isFinite(parsedCount) ? parsedCount : 1));

    const rateMatch = /\b(\d+[kmg]\/\d+[kmg])\b/i.exec(normalizedText);
    const rateLimit = rateMatch?.[1] ? normalizeRateLimit(rateMatch[1]) : "2M/5M";
    const timeLimitSecs = extractDurationSecs(normalizedText);

    return {
      intent: {
        kind: "generate_vouchers",
        count,
        rateLimit,
        timeLimitSecs
      },
      normalizedText,
      confidence: 0.93,
      language
    };
  }

  // 6. Fleet Probe (must precede general tab navigation because "fleet" aliases to HQ)
  if (
    /^(?:probe|check|ping|scan|status|cek|periksa|pindai)\s+(?:the\s+)?(?:fleet|armada|nodes|services)\b/.test(
      normalizedText
    ) ||
    /^(?:fleet|armada)\s+(?:probe|status|health|check|cek)\b/.test(normalizedText)
  ) {
    return {
      intent: { kind: "probe_fleet" },
      normalizedText,
      confidence: 0.93,
      language
    };
  }

  // 7. Offline Queue Sync
  if (
    /^(?:sync|flush|drain|push|replay|kirim|sinkron|sinkronkan)\s+(?:the\s+)?(?:offline\s+)?(?:queue|antrean|antrian)\b/.test(
      normalizedText
    ) ||
    /^(?:flush|sync|sinkron|kirim)\s+offline\b/.test(normalizedText) ||
    /^offline\s+(?:sync|flush|queue)\b/.test(normalizedText)
  ) {
    return {
      intent: { kind: "sync_offline_queue" },
      normalizedText,
      confidence: 0.92,
      language
    };
  }

  // 8. Sidekick Prompt
  const sidekickMatch =
    /^(?:ask|tell|prompt|tanya|tanyakan|minta)\s+(?:to\s+)?sidekick\s+(.+)$/.exec(normalizedText) ??
    /^sidekick\s+(?!tab\b)(.+)$/.exec(normalizedText);
  if (sidekickMatch?.[1] && sidekickMatch[1].trim() !== "") {
    return {
      intent: {
        kind: "sidekick_prompt",
        prompt: sidekickMatch[1].trim()
      },
      normalizedText,
      confidence: 0.9,
      language
    };
  }

  // 9. Navigation to any of the 9 Pocket tabs
  const navMatch =
    /^(?:open|go\s+to|goto|show|switch\s+to|navigate\s+to|tab|buka|ke|tampilkan|lihat|pindah\s+ke)\s+(.+)$/.exec(
      normalizedText
    );
  if (navMatch?.[1]) {
    const tab = matchTab(navMatch[1]);
    if (tab) {
      return {
        intent: { kind: "navigate", tab },
        normalizedText,
        confidence: 0.95,
        language
      };
    }
  } else {
    const bareTab = matchTab(normalizedText);
    if (bareTab) {
      return {
        intent: { kind: "navigate", tab: bareTab },
        normalizedText,
        confidence: 0.85,
        language
      };
    }
  }

  return {
    intent: { kind: "unknown", rawTranscript },
    normalizedText,
    confidence: 0,
    language
  };
}

export function createHttpSpeechTranscriber(options: {
  readonly endpointUrl: string;
  readonly getAccessToken?: () => Promise<string | null> | string | null;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): SpeechTranscriber {
  const endpointUrl = options.endpointUrl.trim();
  if (!endpointUrl) {
    throw new Error("SpeechTranscriber endpointUrl must be a non-empty string.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  return {
    async transcribe(audio: { uri: string; mimeType?: string }): Promise<string> {
      if (!audio.uri || audio.uri.trim() === "") {
        throw new Error("Audio URI is required for transcription.");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const token = options.getAccessToken ? await Promise.resolve(options.getAccessToken()) : null;

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json"
      };
      if (token && token.trim() !== "") {
        headers.Authorization = `Bearer ${token.trim()}`;
      }

      try {
        const response = await fetchImpl(endpointUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            uri: audio.uri,
            mimeType: audio.mimeType ?? "audio/m4a"
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Speech transcription HTTP ${response.status}`);
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const transcript =
          typeof payload.transcript === "string"
            ? payload.transcript
            : typeof payload.text === "string"
            ? payload.text
            : "";

        return transcript.trim();
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

export class VoiceCommandDispatcher {
  private readonly handlers: VoiceCommandHandlers;
  private readonly transcriber?: SpeechTranscriber;

  constructor(options: {
    readonly handlers: VoiceCommandHandlers;
    readonly transcriber?: SpeechTranscriber;
  }) {
    this.handlers = options.handlers;
    this.transcriber = options.transcriber;
  }

  async dispatchTranscript(rawTranscript: string): Promise<VoiceDispatchResult> {
    const parsed = parseVoiceCommand(rawTranscript);
    const { intent } = parsed;

    switch (intent.kind) {
      case "unknown":
        return {
          executed: false,
          intent,
          message: "Unrecognized voice command."
        };

      case "navigate": {
        if (!this.handlers.navigate) {
          return {
            executed: false,
            intent,
            message: `Navigation handler missing for tab ${intent.tab}.`
          };
        }
        await this.handlers.navigate(intent.tab);
        return {
          executed: true,
          intent,
          message: `Navigated to ${intent.tab}.`
        };
      }

      case "probe_fleet": {
        if (!this.handlers.probeFleet) {
          return {
            executed: false,
            intent,
            message: "Fleet probe handler not configured."
          };
        }
        const payload = await this.handlers.probeFleet();
        return {
          executed: true,
          intent,
          message: "Fleet probe executed.",
          payload
        };
      }

      case "sync_offline_queue": {
        if (!this.handlers.syncOfflineQueue) {
          return {
            executed: false,
            intent,
            message: "Offline queue sync handler not configured."
          };
        }
        const payload = await this.handlers.syncOfflineQueue();
        return {
          executed: true,
          intent,
          message: "Offline queue synchronized.",
          payload
        };
      }

      case "generate_vouchers": {
        if (!this.handlers.generateVouchers) {
          return {
            executed: false,
            intent,
            message: "Voucher generation handler not configured."
          };
        }
        const payload = await this.handlers.generateVouchers({
          count: intent.count,
          rateLimit: intent.rateLimit,
          timeLimitSecs: intent.timeLimitSecs
        });
        return {
          executed: true,
          intent,
          message: `Generated ${intent.count} voucher(s) at ${intent.rateLimit}.`,
          payload
        };
      }

      case "disconnect_isp_session": {
        if (!this.handlers.disconnectIspSession) {
          return {
            executed: false,
            intent,
            message: "ISP disconnect handler not configured."
          };
        }
        if (this.handlers.confirmDangerousAction) {
          const confirmed = await this.handlers.confirmDangerousAction(intent);
          if (!confirmed) {
            return {
              executed: false,
              awaitingConfirmation: false,
              intent,
              message: `ISP disconnect cancelled for ${intent.sessionId}.`
            };
          }
        }
        const payload = await this.handlers.disconnectIspSession(intent.sessionId, intent.reason);
        return {
          executed: true,
          intent,
          message: `Disconnected ISP session ${intent.sessionId}.`,
          payload
        };
      }

      case "restart_paas_app": {
        if (!this.handlers.restartPaasApp) {
          return {
            executed: false,
            intent,
            message: "PaaS restart handler not configured."
          };
        }
        if (this.handlers.confirmDangerousAction) {
          const confirmed = await this.handlers.confirmDangerousAction(intent);
          if (!confirmed) {
            return {
              executed: false,
              awaitingConfirmation: false,
              intent,
              message: `PaaS restart cancelled for ${intent.appId}.`
            };
          }
        }
        const payload = await this.handlers.restartPaasApp(intent.appId);
        return {
          executed: true,
          intent,
          message: `Restarted PaaS app ${intent.appId}.`,
          payload
        };
      }

      case "rocksoul_approval": {
        if (!this.handlers.confirmDangerousAction) {
          return {
            executed: false,
            awaitingConfirmation: true,
            intent,
            message: `Confirmation gate required before submitting Rocksoul ${intent.decision} for ${intent.challengeId}.`
          };
        }
        const confirmed = await this.handlers.confirmDangerousAction(intent);
        if (!confirmed) {
          return {
            executed: false,
            awaitingConfirmation: false,
            intent,
            message: `Rocksoul approval cancelled for ${intent.challengeId}.`
          };
        }
        if (!this.handlers.submitRocksoulApproval) {
          return {
            executed: false,
            intent,
            message: "Rocksoul approval handler not configured."
          };
        }
        const payload = await this.handlers.submitRocksoulApproval(
          intent.challengeId,
          intent.decision
        );
        return {
          executed: true,
          intent,
          message: `Submitted Rocksoul ${intent.decision} for ${intent.challengeId}.`,
          payload
        };
      }

      case "ack_radar_event": {
        if (!this.handlers.ackRadarEvent) {
          return {
            executed: false,
            intent,
            message: "Radar acknowledgement handler not configured."
          };
        }
        const payload = await this.handlers.ackRadarEvent(intent.eventId);
        return {
          executed: true,
          intent,
          message: `Acknowledged radar event ${intent.eventId}.`,
          payload
        };
      }

      case "sidekick_prompt": {
        if (!this.handlers.sendSidekickPrompt) {
          return {
            executed: false,
            intent,
            message: "Sidekick handler not configured."
          };
        }
        const payload = await this.handlers.sendSidekickPrompt(intent.prompt);
        return {
          executed: true,
          intent,
          message: "Sent prompt to Sidekick.",
          payload
        };
      }
    }
  }

  async dispatchAudio(audio: { uri: string; mimeType?: string }): Promise<VoiceDispatchResult> {
    if (!this.transcriber) {
      throw new Error("VoiceCommandDispatcher requires a SpeechTranscriber to dispatch audio.");
    }
    const transcript = await this.transcriber.transcribe(audio);
    return this.dispatchTranscript(transcript);
  }
}
