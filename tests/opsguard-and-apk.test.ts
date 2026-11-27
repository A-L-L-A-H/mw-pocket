import { describe, expect, mock, test } from "bun:test";
import * as actualReact from "react";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInMemorySnapshotCache,
  DiskAuditEntry,
  MoonWitnessMobileClient
} from "../src/api/client";
import { ChallengeSigner, RocksoulChallenge } from "../src/services/rocksoulApproval";

mock.module("react", () => {
  const createElement = (
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children
    }
  });
  const hooks = {
    ...actualReact,
    createElement,
    Fragment: actualReact.Fragment ?? Symbol("Fragment"),
    useState: <T,>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] => {
      const value = typeof initial === "function" ? (initial as () => T)() : initial;
      return [value, () => {}];
    },
    useEffect: (_effect: () => void | (() => void), _deps?: readonly unknown[]) => {},
    useCallback: <T extends (...args: never[]) => unknown>(fn: T, _deps: readonly unknown[]): T =>
      fn,
    useMemo: <T,>(factory: () => T, _deps: readonly unknown[]): T => factory()
  };
  return { ...hooks, default: hooks };
});

mock.module("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: () => {} },
  Pressable: "Pressable",
  RefreshControl: "RefreshControl",
  ScrollView: "ScrollView",
  Share: { share: async () => ({ action: "sharedAction" }) },
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T): T => styles
  },
  Text: "Text",
  TextInput: "TextInput",
  View: "View"
}));

mock.module("lucide-react-native", () => ({
  HardDrive: "HardDrive",
  ShieldAlert: "ShieldAlert",
  RefreshCw: "RefreshCw",
  CheckCircle: "CheckCircle",
  XCircle: "XCircle",
  Plus: "Plus",
  Share2: "Share2",
  Ticket: "Ticket"
}));

mock.module("../src/context/PocketContext", () => ({
  usePocket: () => ({
    session: {
      echoUrl: "https://apps.mycocolink.com",
      ridUrl: "https://rid.mycocolink.com",
      myloveUrl: "https://a-l-l-a-h.com",
      subject: "mw-rid:bjo163"
    },
    client: new MoonWitnessMobileClient({
      echoUrl: "https://apps.mycocolink.com",
      myloveUrl: "https://a-l-l-a-h.com"
    }),
    isLoaded: true
  })
}));

const opsGuardMod = await import("../src/screens/OpsGuardScreen");

describe("V57: OpsGuard screen for remote VPS disk & R3/R4 Rocksoul approvals", () => {
  const now = new Date("2026-11-27T10:00:00Z");

  const sampleDrives: DiskAuditEntry[] = [
    { drive: "/dev/vda1 (/)", usedPercent: 93, freeGb: 4.2, totalGb: 60, status: "critical" },
    { drive: "/dev/vdb1 (/data)", usedPercent: 82, freeGb: 18, totalGb: 100, status: "warning" },
    { drive: "/dev/vdc1 (/backup)", usedPercent: 35, freeGb: 130, totalGb: 200, status: "healthy" }
  ];

  const sampleChallenges = [
    {
      challengeId: "ch-r4-rotate",
      riskTier: "R4",
      actionSummary: "mwctl rotate-keys on apps.mycocolink.com:22022",
      diffDigest: "sha256:9f86d081884c7d659a2feaa0c55ad015",
      expiresAt: "2026-11-27T10:15:00Z"
    },
    {
      challengeId: "ch-r3-deploy",
      riskTier: "R3",
      actionSummary: "Deploy mw-stack business profile",
      diffDigest: "sha256:1b4f0e9851971998e732078544c96b36",
      expiresAt: "2026-11-27T10:10:00Z"
    },
    {
      challengeId: "ch-expired",
      riskTier: "R3",
      actionSummary: "Expired challenge",
      diffDigest: "sha256:expired",
      expiresAt: "2026-11-27T09:00:00Z"
    }
  ];

  test("builds OpsGuard overview filtering expired challenges and summarizing disk severity", () => {
    const model = opsGuardMod.buildOpsGuardOverviewModel(sampleDrives, sampleChallenges, now);
    expect(model.criticalDriveCount).toBe(1);
    expect(model.warningDriveCount).toBe(1);
    expect(model.lowestFreeGb).toBe(4.2);
    expect(model.pendingChallenges).toHaveLength(2);
    expect(model.r4ChallengeCount).toBe(1);
    expect(model.r3ChallengeCount).toBe(1);
  });

  test("OpsGuardScreen renders component tree with VPS disk and R3/R4 approval sections", () => {
    const element = opsGuardMod.OpsGuardScreen() as unknown as {
      type: unknown;
      props: { children: unknown };
    };
    expect(element).toBeDefined();
    expect(element.type).toBe("ScrollView");
    const serialized = JSON.stringify(element);
    expect(serialized).toContain("OPSGUARD");
    expect(serialized).toContain("REMOTE VPS DISK");
    expect(serialized).toContain("ROCKSOUL R3/R4 APPROVALS");
  });

  test("signs and submits R3/R4 challenge approval via MoonWitnessMobileClient", async () => {
    const submittedBodies: unknown[] = [];
    const client = new MoonWitnessMobileClient({
      echoUrl: "https://apps.mycocolink.com",
      myloveUrl: "https://a-l-l-a-h.com",
      accessToken: "rid_token_1",
      cache: createInMemorySnapshotCache(),
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/rocksoul/approvals/pending")) {
          return new Response(JSON.stringify(sampleChallenges.slice(0, 2)), { status: 200 });
        }
        if (url.includes("/api/rocksoul/approvals/ch-r4-rotate")) {
          submittedBodies.push(JSON.parse(String(init?.body)));
          return new Response(
            JSON.stringify({ challengeId: "ch-r4-rotate", status: "approved" }),
            { status: 200 }
          );
        }
        return new Response("{}", { status: 404 });
      }) as typeof fetch
    });

    const pending = await client.getRocksoulChallenges();
    expect(pending.payload).toHaveLength(2);

    const signer: ChallengeSigner = async (canonical) =>
      createHmac("sha256", "pocket-key").update(canonical).digest("hex");

    const challenge = pending.payload[0] as RocksoulChallenge;
    const { signed, receipt } = await opsGuardMod.decideOpsGuardChallenge({
      challenge,
      decision: "approve",
      subject: "mw-rid:bjo163",
      signer,
      submitter: (payload) => client.submitRocksoulApproval(payload),
      now
    });

    expect(receipt.status).toBe("approved");
    expect(signed.challengeId).toBe("ch-r4-rotate");
    expect(submittedBodies).toHaveLength(1);
  });
});

describe("V56: EAS-free local signed release APK builder & sideload manifest script", () => {
  test("passes bash -n syntax validation and generates sideload-manifest.json in dry-run", () => {
    const shScript = join(import.meta.dir, "..", "scripts", "build-signed-apk.sh");
    const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
    const bashBin = process.platform === "win32" && existsSync(gitBash) ? gitBash : "bash";
    const bashCheck = Bun.spawnSync([bashBin, "-n", shScript]);
    expect(bashCheck.exitCode).toBe(0);

    if (process.platform === "win32") {
      const tempDist = mkdtempSync(join(tmpdir(), "mw-pocket-apk-test-"));
      try {
        const psScript = join(import.meta.dir, "..", "scripts", "build-apk-local.ps1");
        const proc = Bun.spawnSync([
          "powershell",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          psScript,
          "-SkipPrebuild",
          "-DryRun",
          "-Version",
          "1.2.0",
          "-BuildType",
          "release",
          "-DistDir",
          tempDist
        ]);
        expect(proc.exitCode).toBe(0);
        const manifestRaw = readFileSync(join(tempDist, "sideload-manifest.json"), "utf8");
        const manifest = JSON.parse(manifestRaw) as {
          schema: string;
          easFree: boolean;
          version: string;
          sha256: string;
          apkFile: string;
        };
        expect(manifest.schema).toBe("mw.pocket.sideload_manifest/v1");
        expect(manifest.easFree).toBe(true);
        expect(manifest.version).toBe("1.2.0");
        expect(manifest.apkFile).toBe("mw-pocket-v1.2.0-release.apk");
        expect(manifest.sha256).toHaveLength(64);
      } finally {
        rmSync(tempDist, { recursive: true, force: true });
      }
    }
  });
});
