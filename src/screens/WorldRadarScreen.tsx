import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Radar } from "lucide-react-native";
import { RadarEventEntry } from "../api/client";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

type SeverityFilter = "ALL" | "P0" | "P1" | "P2";

export function WorldRadarScreen(): React.JSX.Element {
  const { client } = usePocket();
  const [events, setEvents] = useState<RadarEventEntry[]>([]);
  const [filter, setFilter] = useState<SeverityFilter>("ALL");
  const [statusLabel, setStatusLabel] = useState("Syncing radar...");

  const loadRadar = useCallback(async () => {
    try {
      const radarSnap = await client.getRadarEvents();
      setEvents(radarSnap.payload);
      setStatusLabel(radarSnap.fromCache ? "Cached Radar Feed" : "Live Radar Feed");
    } catch (loadError) {
      setStatusLabel(loadError instanceof Error ? loadError.message : "Radar offline");
    }
  }, [client]);

  useEffect(() => {
    void loadRadar();
  }, [loadRadar]);

  const handleAcknowledge = useCallback(
    async (eventId: string) => {
      try {
        await client.acknowledgeRadarEvent(eventId);
        setEvents((prev) =>
          prev.map((entry) =>
            entry.id === eventId ? { ...entry, acknowledged: true } : entry
          )
        );
      } catch (ackError) {
        setStatusLabel(ackError instanceof Error ? ackError.message : "Ack failed");
      }
    },
    [client]
  );

  const visibleEvents =
    filter === "ALL" ? events : events.filter((entry) => entry.severity === filter);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Radar size={20} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.title}>WORLD RADAR</Text>
        </View>
        <Text style={styles.subtitle}>{statusLabel}</Text>
      </View>

      <View style={styles.filterRow}>
        {(["ALL", "P0", "P1", "P2"] as const).map((level) => (
          <Pressable
            key={level}
            style={[styles.filterPill, filter === level && styles.filterPillActive]}
            onPress={() => setFilter(level)}
          >
            <Text
              style={[styles.filterText, filter === level && styles.filterTextActive]}
            >
              {level}
            </Text>
          </Pressable>
        ))}
      </View>

      {visibleEvents.map((eventEntry) => {
        const badgeColor =
          eventEntry.severity === "P0"
            ? RIOT_COLORS.riotCrimson
            : eventEntry.severity === "P1"
              ? RIOT_COLORS.sovereignGold
              : RIOT_COLORS.radarCyan;
        return (
          <View key={eventEntry.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <Text style={[styles.severityBadge, { color: badgeColor }]}>
                {eventEntry.severity} · {eventEntry.source}
              </Text>
              <Text style={styles.timestamp}>{eventEntry.timestamp}</Text>
            </View>
            <Text style={styles.headline}>{eventEntry.headline}</Text>
            <Pressable
              style={[
                styles.ackButton,
                eventEntry.acknowledged && styles.ackButtonDone
              ]}
              onPress={() => void handleAcknowledge(eventEntry.id)}
              disabled={eventEntry.acknowledged}
            >
              <CheckCircle2 size={14} color={RIOT_COLORS.textPrimary} />
              <Text style={styles.ackText}>
                {eventEntry.acknowledged ? "ACKNOWLEDGED" : "ACKNOWLEDGE"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: RIOT_SPACING.sm },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  subtitle: { color: RIOT_COLORS.textSecondary, fontSize: 12 },
  filterRow: { flexDirection: "row", gap: RIOT_SPACING.sm },
  filterPill: {
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.xs,
    borderRadius: RIOT_RADIUS.pill,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    backgroundColor: RIOT_COLORS.surface
  },
  filterPillActive: {
    backgroundColor: RIOT_COLORS.radarCyan,
    borderColor: RIOT_COLORS.radarCyan
  },
  filterText: { color: RIOT_COLORS.textSecondary, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: RIOT_COLORS.canvas },
  eventCard: {
    backgroundColor: RIOT_COLORS.surface,
    borderColor: RIOT_COLORS.border,
    borderWidth: 1,
    borderRadius: RIOT_RADIUS.lg,
    padding: RIOT_SPACING.lg,
    gap: RIOT_SPACING.sm
  },
  eventHeader: { flexDirection: "row", justifyContent: "space-between" },
  severityBadge: { fontWeight: "800", fontSize: 12 },
  timestamp: { color: RIOT_COLORS.textMuted, fontSize: 11 },
  headline: { color: RIOT_COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  ackButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.xs,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  ackButtonDone: {
    borderColor: RIOT_COLORS.emerald
  },
  ackText: { color: RIOT_COLORS.textPrimary, fontSize: 11, fontWeight: "700" }
});
