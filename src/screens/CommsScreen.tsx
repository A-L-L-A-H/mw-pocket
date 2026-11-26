import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MessageSquare, Send } from "lucide-react-native";
import { WhatsappStatusSnapshot } from "../api/client";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

type CommsChannel = "whatsapp" | "telegram" | "discord";

export function CommsScreen(): React.JSX.Element {
  const { client } = usePocket();
  const [channel, setChannel] = useState<CommsChannel>("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [channelHealth, setChannelHealth] = useState<WhatsappStatusSnapshot | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState("Ready");

  const loadHealth = useCallback(async () => {
    try {
      const snap = await client.getWhatsappStatus();
      setChannelHealth(snap.payload);
    } catch (healthError) {
      setDeliveryStatus(healthError instanceof Error ? healthError.message : "Status offline");
    }
  }, [client]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const handleDispatch = useCallback(async () => {
    if (!recipient.trim() || !messageBody.trim()) {
      setDeliveryStatus("Recipient and message are required.");
      return;
    }
    setDeliveryStatus(`Dispatching via ${channel}...`);
    try {
      const outcome = await client.sendCommsMessage({
        channel,
        recipient: recipient.trim(),
        message: messageBody.trim()
      });
      setDeliveryStatus(
        outcome.delivered ? `Delivered via ${outcome.channel}` : "Queued for retry"
      );
      setMessageBody("");
    } catch (sendError) {
      setDeliveryStatus(sendError instanceof Error ? sendError.message : "Dispatch failed");
    }
  }, [channel, client, messageBody, recipient]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <MessageSquare size={20} color={RIOT_COLORS.emerald} />
        <Text style={styles.title}>UNIFIED COMMS</Text>
      </View>

      <View style={styles.healthRow}>
        <View style={styles.healthTile}>
          <Text style={styles.healthLabel}>GOWA (WA)</Text>
          <Text
            style={[
              styles.healthValue,
              {
                color: channelHealth?.connected
                  ? RIOT_COLORS.emerald
                  : RIOT_COLORS.danger
              }
            ]}
          >
            {channelHealth?.connected ? "ONLINE" : "OFFLINE"}
          </Text>
        </View>
        <View style={styles.healthTile}>
          <Text style={styles.healthLabel}>TELEGRAM</Text>
          <Text
            style={[
              styles.healthValue,
              {
                color: channelHealth?.telegramReady
                  ? RIOT_COLORS.emerald
                  : RIOT_COLORS.warning
              }
            ]}
          >
            {channelHealth?.telegramReady ? "READY" : "IDLE"}
          </Text>
        </View>
        <View style={styles.healthTile}>
          <Text style={styles.healthLabel}>DISCORD</Text>
          <Text
            style={[
              styles.healthValue,
              {
                color: channelHealth?.discordReady
                  ? RIOT_COLORS.emerald
                  : RIOT_COLORS.warning
              }
            ]}
          >
            {channelHealth?.discordReady ? "READY" : "IDLE"}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.channelRow}>
          {(["whatsapp", "telegram", "discord"] as const).map((entry) => (
            <Pressable
              key={entry}
              style={[styles.channelPill, channel === entry && styles.channelPillActive]}
              onPress={() => setChannel(entry)}
            >
              <Text
                style={[styles.channelText, channel === entry && styles.channelTextActive]}
              >
                {entry.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Recipient phone / chat ID / channel..."
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={recipient}
          onChangeText={setRecipient}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Compose sovereign dispatch..."
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={messageBody}
          onChangeText={setMessageBody}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={() => void handleDispatch()}>
          <Send size={16} color={RIOT_COLORS.canvas} />
          <Text style={styles.sendText}>DISPATCH MESSAGE</Text>
        </Pressable>
        <Text style={styles.statusText}>{deliveryStatus}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: RIOT_SPACING.sm },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  healthRow: { flexDirection: "row", gap: RIOT_SPACING.sm },
  healthTile: {
    flex: 1,
    backgroundColor: RIOT_COLORS.surface,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    padding: RIOT_SPACING.md,
    alignItems: "center"
  },
  healthLabel: { color: RIOT_COLORS.textMuted, fontSize: 10, fontWeight: "700" },
  healthValue: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  card: {
    backgroundColor: RIOT_COLORS.surface,
    borderColor: RIOT_COLORS.border,
    borderWidth: 1,
    borderRadius: RIOT_RADIUS.lg,
    padding: RIOT_SPACING.lg,
    gap: RIOT_SPACING.md
  },
  channelRow: { flexDirection: "row", gap: RIOT_SPACING.sm },
  channelPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: RIOT_SPACING.sm,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    backgroundColor: RIOT_COLORS.surfaceElevated
  },
  channelPillActive: {
    backgroundColor: RIOT_COLORS.emerald,
    borderColor: RIOT_COLORS.emerald
  },
  channelText: { color: RIOT_COLORS.textSecondary, fontSize: 11, fontWeight: "800" },
  channelTextActive: { color: RIOT_COLORS.canvas },
  input: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    color: RIOT_COLORS.textPrimary,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    padding: RIOT_SPACING.md
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  sendButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: RIOT_SPACING.sm,
    backgroundColor: RIOT_COLORS.emerald,
    paddingVertical: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md
  },
  sendText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 13 },
  statusText: { color: RIOT_COLORS.textSecondary, fontSize: 12 }
});
