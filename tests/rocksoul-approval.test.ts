import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { parseChallenge, signApproval, canonicalPayload, type ChallengeSigner } from "../src/services/rocksoulApproval";

const now = new Date("2026-01-01T00:00:00Z");
const valid = {
  challengeId: "c1",
  riskTier: "R4",
  actionSummary: "deploy",
  diffDigest: "sha256:abc",
  expiresAt: "2026-01-01T00:05:00Z",
};
const signer: ChallengeSigner = async (payload) => createHmac("sha256", "k").update(payload).digest("hex");

describe("rocksoul approval", () => {
  test("parses valid challenge", () => {
    expect(parseChallenge(valid, now).riskTier).toBe("R4");
  });
  test("rejects expired", () => {
    expect(() => parseChallenge({ ...valid, expiresAt: "2025-12-31T00:00:00Z" }, now)).toThrow("expired");
  });
  test("rejects missing field and bad tier", () => {
    expect(() => parseChallenge({ ...valid, diffDigest: "" }, now)).toThrow("diffDigest");
    expect(() => parseChallenge({ ...valid, riskTier: "R2" }, now)).toThrow("risk tier");
    expect(() => parseChallenge(null, now)).toThrow("object");
  });
  test("signs approve and deny with subject and timestamp", async () => {
    const challenge = parseChallenge(valid, now);
    const approved = await signApproval(challenge, "approve", "mw-rid:user-1", signer, now);
    const denied = await signApproval(challenge, "deny", "mw-rid:user-1", signer, now);
    expect(approved.signedAt).toBe(now.toISOString());
    expect(approved.signature).toBe(await signer(canonicalPayload(challenge, "approve", "mw-rid:user-1", approved.signedAt)));
    expect(approved.signature).not.toBe(denied.signature);
  });
  test("rejects empty subject and expired signing", async () => {
    const challenge = parseChallenge(valid, now);
    await expect(signApproval(challenge, "approve", " ", signer, now)).rejects.toThrow("subject");
    await expect(signApproval(challenge, "approve", "s", signer, new Date("2026-02-01T00:00:00Z"))).rejects.toThrow("expired");
  });
});
