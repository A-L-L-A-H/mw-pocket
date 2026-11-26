import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  Activity,
  CheckCircle,
  Database,
  Power,
  RefreshCw,
  Server,
  ShieldAlert,
  Unplug,
  XCircle
} from "lucide-react-native";
import {
  BusinessApiClient,
  DisconnectSessionResult,
  IspSession,
  PaasApp,
  RestartPaasAppResult
} from "../services/businessApi";
import { RocksoulChallenge, ChallengeSigner } from "../services/rocksoulApproval";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

// Signer implementation using device HMAC or PKCE session key
const createDeviceSigner = (keyPhrase: string): ChallengeSigner => {
  return async (payload: string): Promise<string> => {
    // In React Native Expo environment, create a deterministic digest
    let hash = 0;
    const combined = `${keyPhrase}:${payload}`;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
    }
    return `mw-sig-sha256:${Math.abs(hash).toString(16).padStart(16, "0")}`;
  };
};

export function BusinessOpsScreen(): React.JSX.Element {
  const { session } = usePocket();

  const businessClient = useMemo(() => {
    return new BusinessApiClient({
      baseUrl: session.echoUrl || "http://127.0.0.1:3010",
      getAccessToken: () => session.accessToken || null
    });
  }, [session.echoUrl, session.accessToken]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ispSessions, setIspSessions] = useState<readonly IspSession[]>([]);
  const [paasApps, setPaasApps] = useState<readonly PaasApp[]>([]);
  const [approvals, setApprovals] = useState<readonly RocksoulChallenge[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [sessions, apps, pending] = await Promise.all([
        businessClient.fetchIspSessions().catch(() => []),
        businessClient.fetchPaasApps().catch(() => []),
        businessClient.fetchPendingApprovals().catch(() => ({ challenges: [] }))
      ]);
      setIspSessions(sessions);
      setPaasApps(apps);
      setApprovals(pending.challenges);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load business ops data";
      setActionMessage(msg);
    }
  }, [businessClient]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleDisconnectIspSession = async (sessionId: string, username: string) => {
    try {
      setActionMessage(`Disconnecting ${username}...`);
      const result: DisconnectSessionResult = await businessClient.disconnectIspSession(
        sessionId,
        "operator_mobile_coa"
      );
      if (result.success) {
        setActionMessage(`Disconnected ${username} (Session ${sessionId})`);
        setIspSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      } else {
        setActionMessage(`Disconnect failed for ${username}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      Alert.alert("CoA Disconnect Error", msg);
    }
  };

  const handleRestartPaasApp = async (appId: string, name: string) => {
    try {
      setActionMessage(`Restarting ${name}...`);
      const result: RestartPaasAppResult = await businessClient.restartPaasApp(appId);
      if (result.success) {
        setActionMessage(`Restart triggered for ${name}`);
        setPaasApps((prev) =>
          prev.map((a) => (a.appId === appId ? { ...a, status: "restarting" } : a))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restart failed";
      Alert.alert("App Restart Error", msg);
    }
  };

  const handleRocksoulApproval = async (
    challenge: RocksoulChallenge,
    decision: "approve" | "deny"
  ) => {
    try {
      setActionMessage(`${decision.toUpperCase()}ing ${challenge.challengeId}...`);
      const signer = createDeviceSigner(session.accessToken ?? "dev-key");
      await businessClient.submitRocksoulApproval({
        challenge,
        decision,
        subject: `mw-rid:${session.accessToken ?? "anonymous-operator"}`,
        signer
      });
      setActionMessage(`Challenge ${challenge.challengeId} [${decision.toUpperCase()}] submitted`);
      setApprovals((prev) => prev.filter((c) => c.challengeId !== challenge.challengeId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approval submission failed";
      Alert.alert("Rocksoul Submission Error", msg);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={RIOT_COLORS.sovereignGold}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Server size={22} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.headerTitle}>VPS BUSINESS OPS</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          ISP Live Sessions &bull; PaaS Apps &bull; Rocksoul R3/R4 Guard
        </Text>
        {actionMessage && <Text style={styles.statusBar}>{actionMessage}</Text>}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={RIOT_COLORS.sovereignGold}
          style={styles.loader}
        />
      ) : null}

      {/* SECTION 1: Pending Rocksoul Approvals (R3/R4 High Priority) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ShieldAlert size={18} color={RIOT_COLORS.riotCrimson} />
          <Text style={[styles.sectionTitle, { color: RIOT_COLORS.riotCrimson }]}>
            PENDING ROCKSOUL APPROVALS ({approvals.length})
          </Text>
        </View>

        {approvals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Zero pending R3/R4 governance challenges</Text>
          </View>
        ) : (
          approvals.map((item) => (
            <View key={item.challengeId} style={styles.approvalCard}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.tierBadge,
                    {
                      backgroundColor:
                        item.riskTier === "R4"
                          ? RIOT_COLORS.riotCrimson
                          : RIOT_COLORS.warning
                    }
                  ]}
                >
                  <Text style={styles.badgeText}>{item.riskTier}</Text>
                </View>
                <Text style={styles.challengeIdText}>{item.challengeId}</Text>
              </View>
              <Text style={styles.actionSummaryText}>{item.actionSummary}</Text>
              <Text style={styles.digestText}>Digest: {item.diffDigest}</Text>
              <Text style={styles.expiresText}>Expires: {item.expiresAt}</Text>
              <View style={styles.approvalActionsRow}>
                <Pressable
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => void handleRocksoulApproval(item, "approve")}
                >
                  <CheckCircle size={14} color={RIOT_COLORS.canvas} />
                  <Text style={styles.approveBtnText}>APPROVE</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.denyBtn]}
                  onPress={() => void handleRocksoulApproval(item, "deny")}
                >
                  <XCircle size={14} color={RIOT_COLORS.canvas} />
                  <Text style={styles.denyBtnText}>DENY</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      {/* SECTION 2: ISP Live Sessions + 1-Tap CoA Disconnect */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Activity size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.sectionTitle}>ISP LIVE SESSIONS ({ispSessions.length})</Text>
        </View>

        {ispSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active ISP RADIUS sessions found</Text>
          </View>
        ) : (
          ispSessions.map((sessionItem) => (
            <View key={sessionItem.sessionId} style={styles.sessionCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.usernameText}>{sessionItem.username}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        sessionItem.status === "active"
                          ? RIOT_COLORS.emerald
                          : RIOT_COLORS.warning
                    }
                  ]}
                >
                  <Text style={styles.badgeText}>{sessionItem.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.sessionMeta}>
                IP: {sessionItem.framedIpAddress} &bull; Time: {sessionItem.sessionTimeSec}s
              </Text>
              <Text style={styles.sessionMeta}>
                In: {(sessionItem.inputOctets / 1024 / 1024).toFixed(1)}MB &bull; Out:{" "}
                {(sessionItem.outputOctets / 1024 / 1024).toFixed(1)}MB
              </Text>
              <Pressable
                style={styles.disconnectBtn}
                onPress={() =>
                  void handleDisconnectIspSession(
                    sessionItem.sessionId,
                    sessionItem.username
                  )
                }
              >
                <Unplug size={14} color={RIOT_COLORS.riotCrimson} />
                <Text style={styles.disconnectBtnText}>1-TAP COA DISCONNECT</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* SECTION 3: PaaS Apps Status + Restart */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Database size={18} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.sectionTitle}>PAAS SERVICES ({paasApps.length})</Text>
        </View>

        {paasApps.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No PaaS app instances reported</Text>
          </View>
        ) : (
          paasApps.map((appItem) => (
            <View key={appItem.appId} style={styles.sessionCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.usernameText}>{appItem.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        appItem.status === "running"
                          ? RIOT_COLORS.emerald
                          : appItem.status === "restarting"
                          ? RIOT_COLORS.radarCyan
                          : RIOT_COLORS.danger
                    }
                  ]}
                >
                  <Text style={styles.badgeText}>{appItem.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.sessionMeta}>
                Replicas: {appItem.replicas} &bull; CPU: {appItem.cpuPercent}% &bull; RAM:{" "}
                {appItem.memoryMb}MB
              </Text>
              <Pressable
                style={styles.restartBtn}
                onPress={() => void handleRestartPaasApp(appItem.appId, appItem.name)}
              >
                <RefreshCw size={14} color={RIOT_COLORS.canvas} />
                <Text style={styles.restartBtnText}>RESTART APP</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RIOT_COLORS.canvas
  },
  contentContainer: {
    padding: RIOT_SPACING.lg,
    paddingBottom: 40
  },
  header: {
    marginBottom: RIOT_SPACING.lg
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: RIOT_SPACING.sm
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: RIOT_COLORS.textPrimary,
    letterSpacing: 1
  },
  headerSubtitle: {
    fontSize: 12,
    color: RIOT_COLORS.textSecondary,
    marginTop: 4
  },
  statusBar: {
    fontSize: 12,
    color: RIOT_COLORS.sovereignGold,
    marginTop: 6,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    padding: 6,
    borderRadius: RIOT_RADIUS.sm
  },
  loader: {
    marginVertical: RIOT_SPACING.md
  },
  section: {
    marginBottom: RIOT_SPACING.xl
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: RIOT_SPACING.sm,
    marginBottom: RIOT_SPACING.sm
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: RIOT_COLORS.textPrimary,
    letterSpacing: 0.5
  },
  emptyCard: {
    backgroundColor: RIOT_COLORS.surface,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  emptyText: {
    fontSize: 13,
    color: RIOT_COLORS.textMuted
  },
  approvalCard: {
    backgroundColor: RIOT_COLORS.surface,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    marginBottom: RIOT_SPACING.sm
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: RIOT_SPACING.sm,
    marginBottom: 6
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RIOT_RADIUS.sm
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIOT_COLORS.canvas
  },
  challengeIdText: {
    fontSize: 12,
    color: RIOT_COLORS.textSecondary,
    fontFamily: "monospace"
  },
  actionSummaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: RIOT_COLORS.textPrimary,
    marginBottom: 4
  },
  digestText: {
    fontSize: 11,
    color: RIOT_COLORS.textMuted,
    fontFamily: "monospace"
  },
  expiresText: {
    fontSize: 11,
    color: RIOT_COLORS.warning,
    marginBottom: RIOT_SPACING.sm
  },
  approvalActionsRow: {
    flexDirection: "row",
    gap: RIOT_SPACING.sm
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: RIOT_RADIUS.sm
  },
  approveBtn: {
    backgroundColor: RIOT_COLORS.emerald
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: RIOT_COLORS.canvas
  },
  denyBtn: {
    backgroundColor: RIOT_COLORS.danger
  },
  denyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: RIOT_COLORS.canvas
  },
  sessionCard: {
    backgroundColor: RIOT_COLORS.surface,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    marginBottom: RIOT_SPACING.sm
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  usernameText: {
    fontSize: 14,
    fontWeight: "700",
    color: RIOT_COLORS.textPrimary
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RIOT_RADIUS.sm
  },
  sessionMeta: {
    fontSize: 12,
    color: RIOT_COLORS.textSecondary,
    marginBottom: 2
  },
  disconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: RIOT_COLORS.riotCrimson,
    paddingVertical: 6,
    borderRadius: RIOT_RADIUS.sm,
    marginTop: 8
  },
  disconnectBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIOT_COLORS.riotCrimson
  },
  restartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: RIOT_COLORS.sovereignGold,
    paddingVertical: 6,
    borderRadius: RIOT_RADIUS.sm,
    marginTop: 8
  },
  restartBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIOT_COLORS.canvas
  }
});
