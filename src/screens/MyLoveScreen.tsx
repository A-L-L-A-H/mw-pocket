import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Clock, Search } from "lucide-react-native";
import { AqelRootAnalysis, DailyPromiseCard, MTimeSnapshot } from "../api/client";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

export function MyLoveScreen(): React.JSX.Element {
  const { client } = usePocket();
  const [cards, setCards] = useState<DailyPromiseCard[]>([]);
  const [mTime, setMTime] = useState<MTimeSnapshot | null>(null);
  const [aqelTerm, setAqelTerm] = useState("");
  const [aqelResult, setAqelResult] = useState<AqelRootAnalysis | null>(null);
  const [statusMessage, setStatusMessage] = useState("A-L-L-A-H.COM Companion");

  const loadCompanion = useCallback(async () => {
    try {
      const [cardsSnap, timeSnap] = await Promise.all([
        client.getDailyPromiseCards(),
        client.getAntikytheraTime()
      ]);
      setCards(cardsSnap.payload);
      setMTime(timeSnap.payload);
    } catch (syncError) {
      setStatusMessage(syncError instanceof Error ? syncError.message : "Companion offline");
    }
  }, [client]);

  useEffect(() => {
    void loadCompanion();
  }, [loadCompanion]);

  const handleAnalyzeRoot = useCallback(async () => {
    const trimmed = aqelTerm.trim();
    if (!trimmed) {
      return;
    }
    try {
      const analysis = await client.analyzeAqelRoot(trimmed);
      setAqelResult(analysis);
    } catch (analysisError) {
      setStatusMessage(
        analysisError instanceof Error ? analysisError.message : "AQEL query failed"
      );
    }
  }, [aqelTerm, client]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Svg width={56} height={56} viewBox="0 0 256 256">
          <Circle
            cx="128"
            cy="128"
            r="96"
            stroke={RIOT_COLORS.radarCyan}
            strokeWidth="6"
            strokeDasharray="12 10"
            fill="none"
          />
          <Path
            d="M148 58a70 70 0 1 0 0 140 54 54 0 1 1 0-140Z"
            fill={RIOT_COLORS.sovereignGold}
          />
        </Svg>
        <View style={styles.heroText}>
          <Text style={styles.title}>A-L-L-A-H.COM</Text>
          <Text style={styles.subtitle}>{statusMessage}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Clock size={18} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.cardTitle}>ANTIKYTHERA M-TIME</Text>
        </View>
        <Text style={styles.mTimePrimary}>{mTime?.mTimeLabel ?? "M-TIME SYNCING"}</Text>
        <Text style={styles.mTimeMeta}>
          Hijri: {mTime?.hijriDate ?? "—"} · Phase: {mTime?.lunarPhase ?? "—"}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Search size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.cardTitle}>AQEL ARABIC ROOT ANALYZER</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Enter Arabic term or transliteration..."
            placeholderTextColor={RIOT_COLORS.textMuted}
            value={aqelTerm}
            onChangeText={setAqelTerm}
          />
          <Pressable style={styles.queryButton} onPress={() => void handleAnalyzeRoot()}>
            <Text style={styles.queryButtonText}>ANALYZE</Text>
          </Pressable>
        </View>
        {aqelResult ? (
          <View style={styles.rootBox}>
            <Text style={styles.rootTitle}>
              Root: {aqelResult.root} ({aqelResult.occurrences} occurrences)
            </Text>
            <Text style={styles.rootMeaning}>{aqelResult.meaning}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>DAILY GOD PROMISE CARDS (CAN-0011)</Text>
        {cards.map((promiseCard) => (
          <View key={promiseCard.id} style={styles.promiseTile}>
            <Text style={styles.promiseRef}>{promiseCard.verseRef}</Text>
            <Text style={styles.promiseArabic}>{promiseCard.arabicText}</Text>
            <Text style={styles.promiseTranslation}>{promiseCard.translation}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: RIOT_SPACING.md,
    backgroundColor: RIOT_COLORS.surface,
    borderColor: RIOT_COLORS.sovereignGold,
    borderWidth: 1,
    borderRadius: RIOT_RADIUS.lg,
    padding: RIOT_SPACING.lg
  },
  heroText: { flex: 1 },
  title: { color: RIOT_COLORS.sovereignGold, fontSize: 20, fontWeight: "800" },
  subtitle: { color: RIOT_COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: RIOT_COLORS.surface,
    borderColor: RIOT_COLORS.border,
    borderWidth: 1,
    borderRadius: RIOT_RADIUS.lg,
    padding: RIOT_SPACING.lg,
    gap: RIOT_SPACING.sm
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: RIOT_SPACING.sm },
  cardTitle: { color: RIOT_COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  mTimePrimary: { color: RIOT_COLORS.sovereignGold, fontSize: 22, fontWeight: "800" },
  mTimeMeta: { color: RIOT_COLORS.textSecondary, fontSize: 12 },
  inputRow: { flexDirection: "row", gap: RIOT_SPACING.sm },
  input: {
    flex: 1,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    color: RIOT_COLORS.textPrimary,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.sm
  },
  queryButton: {
    backgroundColor: RIOT_COLORS.radarCyan,
    paddingHorizontal: RIOT_SPACING.md,
    justifyContent: "center",
    borderRadius: RIOT_RADIUS.md
  },
  queryButtonText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 11 },
  rootBox: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md
  },
  rootTitle: { color: RIOT_COLORS.emerald, fontWeight: "700", fontSize: 13 },
  rootMeaning: { color: RIOT_COLORS.textPrimary, fontSize: 12, marginTop: 4 },
  promiseTile: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    borderRadius: RIOT_RADIUS.md,
    padding: RIOT_SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: RIOT_COLORS.sovereignGold,
    gap: 6
  },
  promiseRef: { color: RIOT_COLORS.sovereignGold, fontWeight: "800", fontSize: 11 },
  promiseArabic: {
    color: RIOT_COLORS.textPrimary,
    fontSize: 18,
    textAlign: "right",
    fontWeight: "600"
  },
  promiseTranslation: { color: RIOT_COLORS.textSecondary, fontSize: 13 }
});
