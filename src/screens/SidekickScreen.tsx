import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Bot, Play, Terminal } from "lucide-react-native";
import { CoderRunEntry } from "../api/client";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

interface ChatTurn {
  readonly id: string;
  readonly role: "user" | "sidekick";
  readonly text: string;
}

export function SidekickScreen(): React.JSX.Element {
  const { client } = usePocket();
  const [promptInput, setPromptInput] = useState("");
  const [missionInput, setMissionInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [runs, setRuns] = useState<CoderRunEntry[]>([]);
  const [statusNote, setStatusNote] = useState("Ready");

  const refreshRuns = useCallback(async () => {
    try {
      const runsSnap = await client.getCoderRuns();
      setRuns(runsSnap.payload);
    } catch (fetchError) {
      setStatusNote(fetchError instanceof Error ? fetchError.message : "Run sync failed");
    }
  }, [client]);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const handleSendChat = useCallback(async () => {
    const trimmed = promptInput.trim();
    if (!trimmed) {
      return;
    }
    setPromptInput("");
    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
    setStatusNote("Sidekick thinking...");
    try {
      const reply = await client.sendSidekickChat(trimmed);
      setTurns((prev) => [
        ...prev,
        {
          id: `s-${Date.now()}`,
          role: "sidekick",
          text: `${reply.reply} [${reply.model} · ${reply.latencyMs}ms]`
        }
      ]);
      setStatusNote("Ready");
    } catch (chatError) {
      setStatusNote(chatError instanceof Error ? chatError.message : "Chat failed");
    }
  }, [client, promptInput]);

  const handleLaunchMission = useCallback(async () => {
    const trimmed = missionInput.trim();
    if (!trimmed) {
      return;
    }
    setMissionInput("");
    setStatusNote("Launching coding agent mission...");
    try {
      const createdRun = await client.launchCoderMission(trimmed);
      setRuns((prev) => [createdRun, ...prev]);
      setStatusNote(`Mission ${createdRun.runId} queued`);
    } catch (launchError) {
      setStatusNote(launchError instanceof Error ? launchError.message : "Launch failed");
    }
  }, [client, missionInput]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>SHADOW SIDEKICK</Text>
      <Text style={styles.subtitle}>{statusNote}</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Bot size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.cardTitle}>AI CHAT</Text>
        </View>
        {turns.map((turn) => (
          <View
            key={turn.id}
            style={[
              styles.bubble,
              turn.role === "user" ? styles.userBubble : styles.sidekickBubble
            ]}
          >
            <Text style={styles.bubbleText}>{turn.text}</Text>
          </View>
        ))}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask Shadow Sidekick..."
            placeholderTextColor={RIOT_COLORS.textMuted}
            value={promptInput}
            onChangeText={setPromptInput}
          />
          <Pressable style={styles.actionButton} onPress={() => void handleSendChat()}>
            <Text style={styles.actionText}>SEND</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Terminal size={18} color={RIOT_COLORS.riotCrimson} />
          <Text style={styles.cardTitle}>CODING AGENT MISSIONS</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Mission objective..."
            placeholderTextColor={RIOT_COLORS.textMuted}
            value={missionInput}
            onChangeText={setMissionInput}
          />
          <Pressable
            style={[styles.actionButton, { backgroundColor: RIOT_COLORS.riotCrimson }]}
            onPress={() => void handleLaunchMission()}
          >
            <Play size={14} color={RIOT_COLORS.textPrimary} />
          </Pressable>
        </View>
        {runs.map((run) => (
          <View key={run.runId} style={styles.runCard}>
            <Text style={styles.runTitle}>
              {run.mission} ({run.status.toUpperCase()})
            </Text>
            <Text style={styles.runLog} numberOfLines={3}>
              {run.logTail}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  subtitle: { color: RIOT_COLORS.textSecondary, fontSize: 12 },
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
  bubble: { padding: RIOT_SPACING.md, borderRadius: RIOT_RADIUS.md },
  userBubble: { backgroundColor: RIOT_COLORS.surfaceElevated, alignSelf: "flex-end" },
  sidekickBubble: {
    backgroundColor: "#10212B",
    borderColor: RIOT_COLORS.radarCyan,
    borderWidth: 1
  },
  bubbleText: { color: RIOT_COLORS.textPrimary, fontSize: 13 },
  inputRow: { flexDirection: "row", gap: RIOT_SPACING.sm },
  input: {
    flex: 1,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    color: RIOT_COLORS.textPrimary,
    borderRadius: RIOT_RADIUS.md,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.sm,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  actionButton: {
    backgroundColor: RIOT_COLORS.radarCyan,
    paddingHorizontal: RIOT_SPACING.md,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RIOT_RADIUS.md
  },
  actionText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 12 },
  runCard: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  runTitle: { color: RIOT_COLORS.sovereignGold, fontWeight: "700", fontSize: 12 },
  runLog: { color: RIOT_COLORS.textSecondary, fontSize: 11, fontFamily: "monospace", marginTop: 4 }
});
