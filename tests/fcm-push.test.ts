import { describe, expect, test } from "bun:test";
import {
  createRegistration,
  parseApprovalMessage,
  parseIncomingApprovalPush,
  parseNtfyApprovalMessage,
  tryParseApprovalMessage,
} from "../src/services/fcmPush";

const now = new Date("2026-01-01T00:00:00Z");
const validData = {
  type: "rocksoul_approval",
  challengeId: "c1",
  riskTier: "R3",
  actionSummary: "deploy",
  diffDigest: "abc",
  expiresAt: "2026-01-01T00:05:00Z",
};

describe("fcmPush", () => {
  test("parses valid approval message", () => {
    expect(parseApprovalMessage({ data: validData }, now).challengeId).toBe("c1");
  });
  test("rejects wrong type", () => {
    expect(() => parseApprovalMessage({ data: { ...validData, type: "x" } }, now)).toThrow();
  });
  test("rejects expired", () => {
    expect(tryParseApprovalMessage({ data: { ...validData, expiresAt: "2025-12-31T00:00:00Z" } }, now)).toBeNull();
  });
  test("rejects malformed and missing data", () => {
    expect(tryParseApprovalMessage({}, now)).toBeNull();
    expect(tryParseApprovalMessage({ data: { ...validData, riskTier: "R1" } }, now)).toBeNull();
  });
  test("registration validates", () => {
    expect(createRegistration("tok", "android", "rid", now).registeredAt).toBe(now.toISOString());
    expect(() => createRegistration(" ", "ios", "rid")).toThrow();
  });
  test("parses ntfy JSON approval push via unified parser", () => {
    const ntfyPayload = {
      event: "message",
      topic: "mw-rocksoul",
      message: JSON.stringify(validData),
    };
    expect(parseNtfyApprovalMessage(ntfyPayload, now).challengeId).toBe("c1");
    expect(parseIncomingApprovalPush(ntfyPayload, now).riskTier).toBe("R3");
    expect(parseIncomingApprovalPush({ data: validData }, now).challengeId).toBe("c1");
  });
  test("rejects malformed or expired ntfy approval push", () => {
    expect(() => parseNtfyApprovalMessage({ message: "not-json" }, now)).toThrow();
    expect(() =>
      parseIncomingApprovalPush(
        { message: JSON.stringify({ ...validData, expiresAt: "2025-12-31T00:00:00Z" }) },
        now,
      ),
    ).toThrow();
  });
});
