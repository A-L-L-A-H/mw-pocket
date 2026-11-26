import { parseChallenge, type RocksoulChallenge } from "./rocksoulApproval";

export type RocksoulApprovalChallenge = RocksoulChallenge;
export type FcmPlatform = "android" | "ios";

export interface FcmDeviceRegistration {
  deviceToken: string;
  platform: FcmPlatform;
  subject: string;
  registeredAt: string;
}

export interface FcmDataMessage {
  data?: Record<string, string>;
}

export interface FcmTokenStore {
  save(registration: FcmDeviceRegistration): Promise<void>;
  load(): Promise<FcmDeviceRegistration | null>;
}

export function createRegistration(
  deviceToken: string,
  platform: FcmPlatform,
  subject: string,
  now: Date = new Date(),
): FcmDeviceRegistration {
  if (deviceToken.trim() === "") throw new Error("fcm device token required");
  if (subject.trim() === "") throw new Error("mw-rid subject required");
  return { deviceToken, platform, subject, registeredAt: now.toISOString() };
}

export function parseApprovalMessage(
  message: FcmDataMessage,
  now: Date = new Date(),
): RocksoulApprovalChallenge {
  const payload = message.data;
  if (typeof payload !== "object" || payload === null) throw new Error("fcm data payload missing");
  if (payload.type !== "rocksoul_approval") throw new Error("unsupported fcm message type");
  return parseChallenge(
    {
      challengeId: payload.challengeId,
      riskTier: payload.riskTier,
      actionSummary: payload.actionSummary,
      diffDigest: payload.diffDigest,
      expiresAt: payload.expiresAt,
    },
    now,
  );
}

export function tryParseApprovalMessage(
  message: FcmDataMessage,
  now: Date = new Date(),
): RocksoulApprovalChallenge | null {
  try {
    return parseApprovalMessage(message, now);
  } catch {
    return null;
  }
}

export interface NtfyJsonMessage {
  event?: string;
  topic?: string;
  title?: string;
  message?: string;
  time?: number;
}

export function parseNtfyApprovalMessage(
  msg: NtfyJsonMessage,
  now: Date = new Date(),
): RocksoulApprovalChallenge {
  if (typeof msg.message !== "string" || msg.message.trim() === "") {
    throw new Error("ntfy message body missing");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(msg.message);
  } catch {
    throw new Error("ntfy approval message must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("ntfy approval payload must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.type !== "rocksoul_approval") {
    throw new Error("unsupported ntfy message type");
  }
  return parseChallenge(record, now);
}

export function parseIncomingApprovalPush(
  raw: unknown,
  now: Date = new Date(),
): RocksoulApprovalChallenge {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("push payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.data === "object" && record.data !== null && !Array.isArray(record.data)) {
    return parseApprovalMessage(record as FcmDataMessage, now);
  }
  if (typeof record.message === "string") {
    return parseNtfyApprovalMessage(record as NtfyJsonMessage, now);
  }
  return parseChallenge(record, now);
}
