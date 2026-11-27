import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HardDrive, ShieldAlert, RefreshCw, CheckCircle, XCircle } from "lucide-react-native";
import { DiskAuditEntry } from "../api/client";
import { usePocket } from "../context/PocketContext";
import {
  ApprovalDecision,
  ChallengeSigner,
  parseChallenge,
  RocksoulChallenge,
  signApproval,
  SignedApprovalResponse
} from "../services/rocksoulApproval";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

export interface OpsGuardOverviewModel {
  readonly drives: readonly DiskAuditEntry[];
  readonly criticalDriveCount: number;
  readonly warningDriveCount: number;
  readonly lowestFreeGb: number;
  readonly pendingChallenges: readonly RocksoulChallenge[];
  readonly r4ChallengeCount: number;
  readonly r3ChallengeCount: number;
}

export function buildOpsGuardOverviewModel(
  drives: readonly DiskAuditEntry[],
  rawChallenges: readonly unknown[],
  now: Date = new Date()
): OpsGuardOverviewModel {
  let criticalDriveCount = 0;
  let warningDriveCount = 0;
  let lowestFreeGb = drives.length > 0 ? Number.POSITIVE_INFINITY : 0;

  for (const d of drives) {
    if (d.status === "critical" || d.usedPercent >= 90 || d.freeGb <= 5) {
      criticalDriveCount += 1;
    } else if (d.status === "warning" || d.usedPercent >= 80 || d.freeGb <= 15) {
      warningDriveCount += 1;
    }
    if (d.freeGb < lowestFreeGb) {
      lowestFreeGb = d.freeGb;
    }
  }

  const pendingChallenges: RocksoulChallenge[] = [];
  let r4ChallengeCount = 0;
  let r3ChallengeCount = 0;

  for (const raw of rawChallenges) {
    try {
      const parsed = parseChallenge(raw, now);
      pendingChallenges.push(parsed);
      if (parsed.riskTier === "R4") {
        r4ChallengeCount += 1;
      } else {
        r3ChallengeCount += 1;
      }
    } catch {
      // Expired or malformed challenges are excluded from actionable queue
    }
  }

  return {
    drives,
    criticalDriveCount,
    warningDriveCount,
    lowestFreeGb: Number.isFinite(lowestFreeGb) ? lowestFreeGb : 0,
    pendingChallenges,
    r4ChallengeCount,
    r3ChallengeCount
  };
}

export async function decideOpsGuardChallenge(params: {
  readonly challenge: RocksoulChallenge;
  readonly decision: ApprovalDecision;
  readonly subject: string;
  readonly signer: ChallengeSigner;
  readonly submitter: (
    signed: SignedApprovalResponse
  ) => Promise<{ challengeId: string; status: "approved" | "denied" }>;
  readonly now?: Date;
}): Promise<{
  readonly signed: SignedApprovalResponse;
  readonly receipt: { challengeId: string; status: "approved" | "denied" };
}> {
  const signed = await signApproval(
    params.challenge,
    params.decision,
    params.subject,
    params.signer,
    params.now ?? new Date()
  );
  const receipt = await params.submitter(signed);
  return { signed, receipt };
}

const defaultLocalSigner: ChallengeSigner = async (canonical: string): Promise<string> => {
  const cryptoMod = await import("expo-crypto");
  return cryptoMod.digestStringAsync(cryptoMod.CryptoDigestAlgorithm.SHA256, canonical);
};

export function OpsGuardScreen(): React.JSX.Element {
  const { client, session } = usePocket();
  const [overview, setOverview] = useState<OpsGuardOverviewModel>({
    drives: [],
    criticalDriveCount: 0,
    warningDriveCount: 0,
    lowestFreeGb: 0,
    pendingChallenges: [],
    r4ChallengeCount: 0,
    r3ChallengeCount: 0
  });
  const [statusLabel, setStatusLabel] = useState<string>("Idle");
  const [busyChallengeId, setBusyChallengeId] = useState<string | null>(null);

  const refreshOpsGuard = useCallback(async () => {
    setStatusLabel("Syncing VPS disk & R3/R4 challenges...");
    try {
      const [diskSnap, challengeSnap] = await Promise.all([
        client.getDiskAudit(),
        client.getRocksoulChallenges()
      ]);
      const nextModel = buildOpsGuardOverviewModel(diskSnap.payload, challengeSnap.payload);
      setOverview(nextModel);
      setStatusLabel(
        diskSnap.fromCache || challengeSnap.fromCache
          ? "Loaded cached OpsGuard snapshot"
          : "Live OpsGuard telemetry verified"
      );
    } catch (syncErr) {
      setStatusLabel(syncErr instanceof Error ? `Error: ${syncErr.message}` : "OpsGuard sync failed");
    }
  }, [client]);

  useEffect(() => {
    void refreshOpsGuard();
  }, [refreshOpsGuard]);

  const handleDecision = useCallback(
    async (challenge: RocksoulChallenge, decision: ApprovalDecision) => {
      setBusyChallengeId(challenge.challengeId);
      try {
        const subject = session.subject?.trim() || "mw-rid:operator";
        const { receipt } = await decideOpsGuardChallenge({
          challenge,
          decision,
          subject,
          signer: defaultLocalSigner,
          submitter: (signed) => client.submitRocksoulApproval(signed)
        });
        setOverview((prev) =>
          buildOpsGuardOverviewModel(
            prev.drives,
            prev.pendingChallenges.filter((c) => c.challengeId !== challenge.challengeId)
          )
        );
        setStatusLabel(`Challenge ${receipt.challengeId} ${receipt.status.toUpperCase()}`);
      } catch (decisionErr) {
        setStatusLabel(
          decisionErr instanceof Error ? `Approval error: ${decisionErr.message}` : "Approval failed"
        );
      } finally {
        setBusyChallengeId(null);
      }
    },
    [client, session.subject]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>OPSGUARD — VPS & R3/R4</Text>
          <Text style={styles.subtitle}>{statusLabel}</Text>
        </View>
        <Pressable style={styles.refreshBtn} onPress={() => void refreshOpsGuard()}>
          <RefreshCw size={15} color={RIOT_COLORS.canvas} />
          <Text style={styles.refreshBtnText}>SYNC</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <HardDrive size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.cardTitle}>
            REMOTE VPS DISK ({overview.drives.length}) · CRIT {overview.criticalDriveCount}
          </Text>
        </View>
        {overview.drives.length === 0 ? (
          <Text style={styles.emptyText}>No VPS disk audit rows loaded.</Text>
        ) : (
          overview.drives.map((d) => {
            const tint =
              d.status === "critical"
                ? RIOT_COLORS.danger
                : d.status === "warning"
                  ? RIOT_COLORS.warning
                  : RIOT_COLORS.emerald;
            return (
              <View key={d.drive} style={styles.driveRow}>
                <View>
                  <Text style={styles.driveTitle}>{d.drive}</Text>
                  <Text style={styles.driveMeta}>
                    {d.freeGb.toFixed(1)} GB free / {d.totalGb.toFixed(1)} GB total
                  </Text>
                </View>
                <Text style={[styles.drivePct, { color: tint }]}>{d.usedPercent}% USED</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldAlert size={18} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.cardTitle}>
            ROCKSOUL R3/R4 APPROVALS ({overview.pendingChallenges.length})
          </Text>
        </View>
        {overview.pendingChallenges.length === 0 ? (
          <Text style={styles.emptyText}>Zero pending R3/R4 challenges requiring operator signature.</Text>
        ) : (
          overview.pendingChallenges.map((ch) => (
            <View key={ch.challengeId} style={styles.challengeBox}>
              <View style={styles.challengeHeader}>
                <Text style={styles.tierBadge}>{ch.riskTier}</Text>
                <Text style={styles.challengeId}>{ch.challengeId}</Text>
              </View>
              <Text style={styles.actionSummary}>{ch.actionSummary}</Text>
              <Text style={styles.digestText} numberOfLines={1}>
                Digest: {ch.diffDigest}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.decisionBtn, styles.approveBtn]}
                  disabled={busyChallengeId === ch.challengeId}
                  onPress={() => void handleDecision(ch, "approve")}
                >
                  <CheckCircle size={14} color={RIOT_COLORS.canvas} />
                  <Text style={styles.decisionBtnText}>SIGN APPROVE</Text>
                </Pressable>
                <Pressable
                  style={[styles.decisionBtn, styles.denyBtn]}
                  disabled={busyChallengeId === ch.challengeId}
                  onPress={() => void handleDecision(ch, "deny")}
                >
                  <XCircle size={14} color={RIOT_COLORS.textPrimary} />
                  <Text style={[styles.decisionBtnText, { color: RIOT_COLORS.textPrimary }]}>
                    DENY
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 19, fontWeight: "800" },
  subtitle: { color: RIOT_COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RIOT_COLORS.radarCyan,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.sm,
    borderRadius: RIOT_RADIUS.md
  },
  refreshBtnText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 12 },
  card: {
    backgroundColor: RIOT_COLORS.surface,
    borderColor: RIOT_COLORS.border,
    borderWidth: 1,
    borderRadius: RIOT_RADIUS.lg,
    padding: RIOT_SPACING.lg,
    gap: RIOT_SPACING.sm
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: RIOT_SPACING.sm },
  cardTitle: { color: RIOT_COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  emptyText: { color: RIOT_COLORS.textMuted, fontSize: 12 },
  driveRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: RIOT_COLORS.surfaceElevated,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  driveTitle: { color: RIOT_COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  driveMeta: { color: RIOT_COLORS.textMuted, fontSize: 11, marginTop: 2 },
  drivePct: { fontWeight: "800", fontSize: 13, fontFamily: "monospace" },
  challengeBox: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    gap: 6
  },
  challengeHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierBadge: {
    backgroundColor: RIOT_COLORS.riotCrimson,
    color: RIOT_COLORS.textPrimary,
    fontWeight: "800",
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RIOT_RADIUS.sm
  },
  challengeId: { color: RIOT_COLORS.sovereignGold, fontSize: 12, fontFamily: "monospace" },
  actionSummary: { color: RIOT_COLORS.textPrimary, fontSize: 13, fontWeight: "600" },
  digestText: { color: RIOT_COLORS.textMuted, fontSize: 11, fontFamily: "monospace" },
  actionRow: { flexDirection: "row", gap: RIOT_SPACING.sm, marginTop: 4 },
  decisionBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: RIOT_SPACING.sm,
    borderRadius: RIOT_RADIUS.md
  },
  approveBtn: { backgroundColor: RIOT_COLORS.emerald },
  denyBtn: { backgroundColor: RIOT_COLORS.danger },
  decisionBtnText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 12 }
});
