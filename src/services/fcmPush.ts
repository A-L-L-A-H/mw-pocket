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
