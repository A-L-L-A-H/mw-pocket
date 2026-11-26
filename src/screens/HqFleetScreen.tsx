import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Activity, ShieldCheck, Zap } from "lucide-react-native";
import {
  ArsyAuditVerification,
  EchoHealthSnapshot,
  FleetServiceEntry
} from "../api/client";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

export function HqFleetScreen(): React.JSX.Element {
  const { client } = usePocket();
  const [health, setHealth] = useState<EchoHealthSnapshot | null>(null);
  const [services, setServices] = useState<FleetServiceEntry[]>([]);
  const [arsyAudit, setArsyAudit] = useState<ArsyAuditVerification | null>(null);
  const [probeStatus, setProbeStatus] = useState<string>("Idle");
  const [isCached, setIsCached] = useState(false);

  const runFleetProbe = useCallback(async () => {
    setProbeStatus("Probing fleet...");
    try {
      const [healthSnap, fleetSnap, arsySnap] = await Promise.all([
        client.getEchoHealth(),
        client.getFleetServices(),
        client.verifyArsyAudit()
      ]);
      setHealth(healthSnap.payload);
      setServices(fleetSnap.payload);
      setArsyAudit(arsySnap.payload);
      setIsCached(healthSnap.fromCache || fleetSnap.fromCache || arsySnap.fromCache);
      setProbeStatus(
        healthSnap.fromCache ? "Offline Snapshot Loaded" : "Live Fleet Verified"
      );
    } catch (probeError) {
      const message = probeError instanceof Error ? probeError.message : "Probe failed";
      setProbeStatus(`Error: ${message}`);
    }
  }, [client]);

  useEffect(() => {
    void runFleetProbe();
  }, [runFleetProbe]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>HQ & FLEET</Text>
          <Text style={styles.subtitle}>
            {probeStatus} {isCached ? "(CACHED)" : ""}
          </Text>
        </View>
        <Pressable style={styles.probeButton} onPress={() => void runFleetProbe()}>
          <Zap size={16} color={RIOT_COLORS.canvas} />
          <Text style={styles.probeButtonText}>1-TAP PROBE</Text>
        </Pressable>
      </View>

      <View style={styles.hudCard}>
        <Text style={styles.sectionLabel}>ARENA SOVEREIGN HUD</Text>
        <View style={styles.hudRow}>
          <View style={styles.hudMetric}>
            <Text style={styles.metricValue}>LVL {health?.arenaLevel ?? 0}</Text>
            <Text style={styles.metricCaption}>LEVEL</Text>
          </View>
          <View style={styles.hudMetric}>
            <Text style={[styles.metricValue, { color: RIOT_COLORS.sovereignGold }]}>
              {health?.arenaXp ?? 0}
            </Text>
            <Text style={styles.metricCaption}>XP</Text>
          </View>
          <View style={styles.hudMetric}>
            <Text style={[styles.metricValue, { color: RIOT_COLORS.riotCrimson }]}>
              {health?.streakDays ?? 0}d
            </Text>
            <Text style={styles.metricCaption}>STREAK</Text>
          </View>
          <View style={styles.hudMetric}>
            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    health?.status === "ok" ? RIOT_COLORS.emerald : RIOT_COLORS.warning
                }
              ]}
            >
              {(health?.status ?? "offline").toUpperCase()}
            </Text>
            <Text style={styles.metricCaption}>ECHO</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.cardTitle}>ARSY MERKLE SEAL</Text>
        </View>
        <Text style={styles.monoText}>
          Status: {arsyAudit?.sealed ? "SEALED" : "UNVERIFIED"} | Entries:{" "}
          {arsyAudit?.verifiedEntries ?? 0}
        </Text>
        <Text style={styles.monoMuted} numberOfLines={1}>
          Root: {arsyAudit?.merkleRoot ?? "awaiting probe"}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Activity size={18} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.cardTitle}>FLEET MATRIX ({services.length})</Text>
        </View>
        {services.length === 0 ? (
          <Text style={styles.emptyText}>
            No fleet telemetry yet. Configure Echo URL in Settings or tap 1-TAP PROBE.
          </Text>
        ) : (
          <View style={styles.matrixGrid}>
            {services.map((service) => {
              const badgeColor =
                service.status === "online"
                  ? RIOT_COLORS.emerald
                  : service.status === "degraded"
                    ? RIOT_COLORS.warning
                    : RIOT_COLORS.danger;
              return (
                <View key={service.id} style={styles.serviceTile}>
                  <View style={[styles.statusDot, { backgroundColor: badgeColor }]} />
                  <Text style={styles.serviceName} numberOfLines={1}>
                    {service.name}
                  </Text>
                  <Text style={styles.serviceMeta}>
                    :{service.port} · {service.latencyMs}ms
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  subtitle: { color: RIOT_COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  probeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RIOT_COLORS.sovereignGold,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.sm,
    borderRadius: RIOT_RADIUS.md
  },
  probeButtonText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 12 },
  hudCard: {
    backgroundColor: RIOT_COLORS.surface,
    borderColor: RIOT_COLORS.border,
    borderWidth: 1,
    borderRadius: RIOT_RADIUS.lg,
    padding: RIOT_SPACING.lg
  },
  sectionLabel: {
    color: RIOT_COLORS.radarCyan,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: RIOT_SPACING.sm
  },
  hudRow: { flexDirection: "row", justifyContent: "space-between" },
  hudMetric: { alignItems: "center" },
  metricValue: { color: RIOT_COLORS.textPrimary, fontSize: 18, fontWeight: "800" },
  metricCaption: { color: RIOT_COLORS.textMuted, fontSize: 10, marginTop: 2 },
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
  monoText: { color: RIOT_COLORS.emerald, fontSize: 12, fontFamily: "monospace" },
  monoMuted: { color: RIOT_COLORS.textSecondary, fontSize: 11, fontFamily: "monospace" },
  emptyText: { color: RIOT_COLORS.textMuted, fontSize: 12 },
  matrixGrid: { flexDirection: "row", flexWrap: "wrap", gap: RIOT_SPACING.sm },
  serviceTile: {
    width: "48%",
    backgroundColor: RIOT_COLORS.surfaceElevated,
    borderRadius: RIOT_RADIUS.md,
    padding: RIOT_SPACING.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  serviceName: { color: RIOT_COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  serviceMeta: { color: RIOT_COLORS.textMuted, fontSize: 11, marginTop: 2 }
});
