export type RiskTier = "R3" | "R4";
export type ApprovalDecision = "approve" | "deny";

export interface RocksoulChallenge {
  challengeId: string;
  riskTier: RiskTier;
  actionSummary: string;
  diffDigest: string;
  expiresAt: string;
}

export interface SignedApprovalResponse {
  challengeId: string;
  decision: ApprovalDecision;
  subject: string;
  signedAt: string;
  signature: string;
}

export type ChallengeSigner = (canonicalPayload: string) => Promise<string>;

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`rocksoul challenge missing field: ${field}`);
  }
  return value;
}

export function parseChallenge(raw: unknown, now: Date = new Date()): RocksoulChallenge {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("rocksoul challenge must be an object");
  }
  const record = raw as Record<string, unknown>;
  const riskTier = requireString(record, "riskTier");
  if (riskTier !== "R3" && riskTier !== "R4") {
    throw new Error(`unsupported risk tier: ${riskTier}`);
  }
  const challenge: RocksoulChallenge = {
    challengeId: requireString(record, "challengeId"),
    riskTier,
    actionSummary: requireString(record, "actionSummary"),
    diffDigest: requireString(record, "diffDigest"),
    expiresAt: requireString(record, "expiresAt"),
  };
  const expiryMs = Date.parse(challenge.expiresAt);
  if (Number.isNaN(expiryMs)) throw new Error("expiresAt is not a valid timestamp");
  if (expiryMs <= now.getTime()) throw new Error("rocksoul challenge expired");
  return challenge;
}

export function canonicalPayload(
  challenge: RocksoulChallenge,
  decision: ApprovalDecision,
  subject: string,
  signedAt: string,
): string {
  return [challenge.challengeId, challenge.riskTier, challenge.diffDigest, decision, subject, signedAt].join("\n");
}

export async function signApproval(
  challenge: RocksoulChallenge,
  decision: ApprovalDecision,
  subject: string,
  sign: ChallengeSigner,
  now: Date = new Date(),
): Promise<SignedApprovalResponse> {
  if (subject.trim() === "") throw new Error("mw-rid subject required");
  if (Date.parse(challenge.expiresAt) <= now.getTime()) throw new Error("rocksoul challenge expired");
  const signedAt = now.toISOString();
  const signature = await sign(canonicalPayload(challenge, decision, subject, signedAt));
  return { challengeId: challenge.challengeId, decision, subject, signedAt, signature };
}
