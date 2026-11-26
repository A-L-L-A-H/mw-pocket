import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CloudUpload, HardDrive, Trophy } from "lucide-react-native";
import { BountyTaskEntry, DiskAuditEntry } from "../api/client";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

const STATUS_SEQUENCE: readonly BountyTaskEntry["status"][] = [
  "todo",
  "in_progress",
  "review",
  "done"
];

function nextBountyStatus(current: BountyTaskEntry["status"]): BountyTaskEntry["status"] {
  const currentIdx = STATUS_SEQUENCE.indexOf(current);
  return STATUS_SEQUENCE[(currentIdx + 1) % STATUS_SEQUENCE.length];
}

export function BountyVaultScreen(): React.JSX.Element {
  const { client } = usePocket();
  const [tasks, setTasks] = useState<BountyTaskEntry[]>([]);
  const [drives, setDrives] = useState<DiskAuditEntry[]>([]);
  const [vaultNote, setVaultNote] = useState("Ready");

  const loadVault = useCallback(async () => {
    try {
      const [tasksSnap, diskSnap] = await Promise.all([
        client.getBountyTasks(),
        client.getDiskAudit()
      ]);
      setTasks(tasksSnap.payload);
      setDrives(diskSnap.payload);
      setVaultNote(tasksSnap.fromCache ? "Cached Vault Telemetry" : "Live Vault Synced");
    } catch (vaultError) {
      setVaultNote(vaultError instanceof Error ? vaultError.message : "Vault offline");
    }
  }, [client]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  const handleAdvanceTask = useCallback(
    async (task: BountyTaskEntry) => {
      const targetStatus = nextBountyStatus(task.status);
      try {
        const updated = await client.advanceBountyTask(task.id, targetStatus);
        setTasks((prev) =>
          prev.map((entry) => (entry.id === task.id ? updated : entry))
        );
      } catch (advanceError) {
        setVaultNote(
          advanceError instanceof Error ? advanceError.message : "Task advance failed"
        );
      }
    },
    [client]
  );

  const handleBackup = useCallback(async () => {
    setVaultNote("Triggering 9Drive Backup...");
    try {
      const backupOutcome = await client.triggerNineDriveBackup();
      setVaultNote(`9Drive Backup ${backupOutcome.jobId} (${backupOutcome.target})`);
    } catch (backupError) {
      setVaultNote(backupError instanceof Error ? backupError.message : "Backup failed");
    }
  }, [client]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>BOUNTY & VAULT</Text>
          <Text style={styles.subtitle}>{vaultNote}</Text>
        </View>
        <Pressable style={styles.backupButton} onPress={() => void handleBackup()}>
          <CloudUpload size={16} color={RIOT_COLORS.canvas} />
          <Text style={styles.backupText}>9DRIVE BACKUP</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Trophy size={18} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.cardTitle}>BOUNTY KANBAN (TAP TO ADVANCE)</Text>
        </View>
        {tasks.map((task) => (
          <Pressable
            key={task.id}
            style={styles.taskTile}
            onPress={() => void handleAdvanceTask(task)}
          >
            <View style={styles.taskHeader}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.xpBadge}>+{task.xpReward} XP</Text>
            </View>
            <Text style={styles.taskMeta}>
              {task.priority} · {task.status.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <HardDrive size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.cardTitle}>DISK DOCTOR GAUGES</Text>
        </View>
        {drives.map((drive) => {
          const barColor =
            drive.status === "healthy"
              ? RIOT_COLORS.emerald
              : drive.status === "warning"
                ? RIOT_COLORS.warning
                : RIOT_COLORS.danger;
          return (
            <View key={drive.drive} style={styles.driveRow}>
              <View style={styles.driveHeader}>
                <Text style={styles.driveLabel}>{drive.drive}</Text>
                <Text style={styles.driveMeta}>
                  {drive.usedPercent}% ({drive.freeGb}GB free / {drive.totalGb}GB)
                </Text>
              </View>
              <View style={styles.gaugeTrack}>
                <View
                  style={[
                    styles.gaugeFill,
                    {
                      width: `${Math.min(100, Math.max(0, drive.usedPercent))}%`,
                      backgroundColor: barColor
                    }
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  subtitle: { color: RIOT_COLORS.textSecondary, fontSize: 12 },
  backupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RIOT_COLORS.radarCyan,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.sm,
    borderRadius: RIOT_RADIUS.md
  },
  backupText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 11 },
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
  taskTile: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    borderRadius: RIOT_RADIUS.md,
    padding: RIOT_SPACING.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  taskTitle: { color: RIOT_COLORS.textPrimary, fontWeight: "700", fontSize: 13, flex: 1 },
  xpBadge: { color: RIOT_COLORS.sovereignGold, fontWeight: "800", fontSize: 12 },
  taskMeta: { color: RIOT_COLORS.textMuted, fontSize: 11, marginTop: 4 },
  driveRow: { gap: 4 },
  driveHeader: { flexDirection: "row", justifyContent: "space-between" },
  driveLabel: { color: RIOT_COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
  driveMeta: { color: RIOT_COLORS.textSecondary, fontSize: 11 },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    overflow: "hidden"
  },
  gaugeFill: { height: 8, borderRadius: 4 }
});
