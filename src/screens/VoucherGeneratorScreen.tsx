import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { CheckCircle, Plus, RefreshCw, Share2, Ticket } from "lucide-react-native";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

export interface VoucherBatchRequest {
  readonly count: number;
  readonly code_length?: number;
  readonly time_limit_secs: number;
  readonly quota_bytes?: number | null;
  readonly rate_limit: string;
}

export interface IspVoucher {
  readonly code: string;
  readonly time_limit_secs: number;
  readonly quota_bytes: number | null;
  readonly mikrotik_rate_limit: string;
  readonly redeemed: boolean;
  readonly redeemed_by: string | null;
}

export interface VoucherValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly request?: VoucherBatchRequest;
}

export interface VoucherDurationPreset {
  readonly label: string;
  readonly secs: number;
}

export const VOUCHER_DURATION_PRESETS: readonly VoucherDurationPreset[] = [
  { label: "1H", secs: 3600 },
  { label: "3H", secs: 10800 },
  { label: "24H", secs: 86400 },
  { label: "7D", secs: 604800 },
  { label: "30D", secs: 2592000 }
];

export const VOUCHER_RATE_PRESETS: readonly string[] = [
  "1M/2M",
  "2M/5M",
  "5M/10M",
  "10M/20M"
];

type VoucherFilter = "ALL" | "UNUSED" | "REDEEMED";

export function validRateLimit(value: string): boolean {
  const trimmed = value.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0 || slashIndex !== trimmed.lastIndexOf("/")) {
    return false;
  }
  const rx = trimmed.slice(0, slashIndex);
  const tx = trimmed.slice(slashIndex + 1);
  const isPartValid = (part: string): boolean => {
    if (part.length === 0) return false;
    const match = /^(\d+)([kKmMG]?)$/.exec(part);
    return match !== null && (match[1]?.length ?? 0) > 0;
  };
  return isPartValid(rx) && isPartValid(tx);
}

function parseOptionalInt(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

function parseOptionalFloat(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function validateVoucherBatchInput(input: {
  readonly count: string | number;
  readonly codeLength?: string | number;
  readonly timeLimitSecs: string | number;
  readonly quotaMb?: string | number;
  readonly rateLimit: string;
}): VoucherValidationResult {
  const errors: string[] = [];

  const count = parseOptionalInt(input.count);
  if (count === undefined || !Number.isInteger(count) || count < 1 || count > 1000) {
    errors.push("count must be an integer between 1 and 1000");
  }

  const codeLength = parseOptionalInt(input.codeLength);
  if (
    codeLength !== undefined &&
    (!Number.isInteger(codeLength) || codeLength < 8 || codeLength > 32)
  ) {
    errors.push("code_length must be an integer between 8 and 32");
  }

  const timeLimitSecs = parseOptionalInt(input.timeLimitSecs);
  if (timeLimitSecs === undefined || !Number.isInteger(timeLimitSecs) || timeLimitSecs <= 0) {
    errors.push("time_limit_secs must be an integer > 0");
  }

  const quotaMb = parseOptionalFloat(input.quotaMb);
  if (quotaMb !== undefined && (Number.isNaN(quotaMb) || quotaMb <= 0)) {
    errors.push("quotaMb must be a positive number");
  }

  const rateLimit = input.rateLimit.trim();
  if (!validRateLimit(rateLimit)) {
    errors.push("rate_limit must look like 2M/5M");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const quotaBytes =
    quotaMb !== undefined ? Math.round(quotaMb * 1024 * 1024) : null;

  return {
    valid: true,
    errors: [],
    request: {
      count: count as number,
      code_length: codeLength ?? 10,
      time_limit_secs: timeLimitSecs as number,
      quota_bytes: quotaBytes,
      rate_limit: rateLimit
    }
  };
}

export function formatDurationLabel(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) {
    return "0s";
  }
  if (secs % 86400 === 0) {
    return `${secs / 86400}d`;
  }
  if (secs % 3600 === 0) {
    return `${secs / 3600}h`;
  }
  if (secs % 60 === 0) {
    return `${secs / 60}m`;
  }
  return `${Math.round(secs)}s`;
}

export function formatQuotaLabel(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    return "Unlimited";
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
}

export function formatVoucherBatchShareText(vouchers: readonly IspVoucher[]): string {
  if (vouchers.length === 0) {
    return "No hotspot vouchers available.";
  }
  const lines = vouchers.map((voucher, index) => {
    const status = voucher.redeemed
      ? `REDEEMED (${voucher.redeemed_by ?? "unknown"})`
      : "UNUSED";
    return `${index + 1}. ${voucher.code} | ${voucher.mikrotik_rate_limit} | ${formatDurationLabel(
      voucher.time_limit_secs
    )} | ${formatQuotaLabel(voucher.quota_bytes)} | ${status}`;
  });
  return `MoonWitness ISP Hotspot Vouchers (${vouchers.length}):\n${lines.join("\n")}`;
}

export interface VoucherApiOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => Promise<string | null> | string | null;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Voucher API baseUrl must be a non-empty string.");
  }
  return trimmed;
}

async function requestVoucherApi<TResult>(
  opts: VoucherApiOptions,
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<TResult> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = await Promise.resolve(opts.getAccessToken());

  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (token && token.trim() !== "") {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        // ignore read error
      }
      throw new Error(
        `Voucher API HTTP ${response.status} on ${method} ${path}: ${detail || response.statusText}`
      );
    }

    return (await response.json()) as TResult;
  } finally {
    clearTimeout(timer);
  }
}

function parseVoucherRecord(raw: unknown, index: number): IspVoucher {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Invalid voucher object at index ${index}.`);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.code !== "string" || record.code.trim() === "") {
    throw new Error(`Voucher at index ${index} missing valid code.`);
  }
  return {
    code: record.code.trim(),
    time_limit_secs:
      typeof record.time_limit_secs === "number" ? record.time_limit_secs : 0,
    quota_bytes:
      typeof record.quota_bytes === "number" ? record.quota_bytes : null,
    mikrotik_rate_limit:
      typeof record.mikrotik_rate_limit === "string"
        ? record.mikrotik_rate_limit
        : "2M/5M",
    redeemed: Boolean(record.redeemed),
    redeemed_by:
      typeof record.redeemed_by === "string" ? record.redeemed_by : null
  };
}

export async function generateVoucherBatch(
  opts: VoucherApiOptions & { readonly request: VoucherBatchRequest }
): Promise<IspVoucher[]> {
  const payload = await requestVoucherApi<unknown>(
    opts,
    "/api/isp/vouchers/batch",
    "POST",
    opts.request
  );
  if (!Array.isArray(payload)) {
    throw new Error("Invalid batch response: expected array of vouchers.");
  }
  return payload.map((item, idx) => parseVoucherRecord(item, idx));
}

export async function fetchVoucherList(opts: VoucherApiOptions): Promise<IspVoucher[]> {
  const payload = await requestVoucherApi<unknown>(opts, "/api/isp/vouchers", "GET");
  if (!Array.isArray(payload)) {
    throw new Error("Invalid voucher list response: expected array of vouchers.");
  }
  return payload.map((item, idx) => parseVoucherRecord(item, idx));
}

export async function redeemVoucherCode(
  opts: VoucherApiOptions & { readonly code: string; readonly username: string }
): Promise<IspVoucher> {
  const code = opts.code.trim();
  const username = opts.username.trim();
  if (!code) {
    throw new Error("Voucher code is required for redemption.");
  }
  if (!username) {
    throw new Error("Username is required for voucher redemption.");
  }
  const payload = await requestVoucherApi<unknown>(opts, "/api/isp/vouchers/redeem", "POST", {
    code,
    username
  });
  return parseVoucherRecord(payload, 0);
}

export function VoucherGeneratorScreen(): React.JSX.Element {
  const { session } = usePocket();

  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [countInput, setCountInput] = useState("10");
  const [rateLimitInput, setRateLimitInput] = useState("2M/5M");
  const [timeLimitSecs, setTimeLimitSecs] = useState(3600);
  const [quotaMbInput, setQuotaMbInput] = useState("");
  const [codeLengthInput, setCodeLengthInput] = useState("10");
  const [filter, setFilter] = useState<VoucherFilter>("ALL");
  const [redeemUsernames, setRedeemUsernames] = useState<Record<string, string>>({});

  const [vouchers, setVouchers] = useState<readonly IspVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const effectiveBaseUrl = useMemo(() => {
    const trimmedOverride = baseUrlOverride.trim();
    if (trimmedOverride !== "") {
      return trimmedOverride;
    }
    return session.echoUrl || "http://127.0.0.1:3010";
  }, [baseUrlOverride, session.echoUrl]);

  const apiOptions = useMemo<VoucherApiOptions>(
    () => ({
      baseUrl: effectiveBaseUrl,
      getAccessToken: () => session.accessToken || null
    }),
    [effectiveBaseUrl, session.accessToken]
  );

  const loadVouchers = useCallback(async () => {
    try {
      const list = await fetchVoucherList(apiOptions);
      setVouchers(list);
      setStatusMessage(`Loaded ${list.length} voucher(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load vouchers";
      setStatusMessage(msg);
    }
  }, [apiOptions]);

  useEffect(() => {
    setLoading(true);
    loadVouchers().finally(() => setLoading(false));
  }, [loadVouchers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadVouchers();
    setRefreshing(false);
  }, [loadVouchers]);

  const handleGenerateBatch = async () => {
    const validation = validateVoucherBatchInput({
      count: countInput,
      codeLength: codeLengthInput,
      timeLimitSecs,
      quotaMb: quotaMbInput,
      rateLimit: rateLimitInput
    });

    if (!validation.valid || !validation.request) {
      Alert.alert("Invalid Voucher Batch", validation.errors.join("\n"));
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage(`Generating ${validation.request.count} voucher(s)...`);
      const created = await generateVoucherBatch({
        ...apiOptions,
        request: validation.request
      });
      setVouchers((prev) => [...created, ...prev]);
      setStatusMessage(`Generated ${created.length} voucher(s) (${validation.request.rate_limit})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voucher generation failed";
      Alert.alert("Generate Batch Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRedeem = async (code: string) => {
    const username = (redeemUsernames[code] ?? "").trim();
    if (!username) {
      Alert.alert("Redeem Voucher", "Enter a hotspot username before redeeming.");
      return;
    }
    try {
      const updated = await redeemVoucherCode({
        ...apiOptions,
        code,
        username
      });
      setVouchers((prev) => prev.map((v) => (v.code === updated.code ? updated : v)));
      setStatusMessage(`Redeemed ${updated.code} for ${username}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voucher redeem failed";
      Alert.alert("Redeem Error", msg);
    }
  };

  const handleShareBatch = async () => {
    const shareText = formatVoucherBatchShareText(filteredVouchers);
    try {
      await Share.share({ message: shareText });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open share sheet";
      Alert.alert("Share Error", msg);
    }
  };

  const filteredVouchers = useMemo(() => {
    if (filter === "UNUSED") {
      return vouchers.filter((v) => !v.redeemed);
    }
    if (filter === "REDEEMED") {
      return vouchers.filter((v) => v.redeemed);
    }
    return vouchers;
  }, [vouchers, filter]);

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
          <Ticket size={22} color={RIOT_COLORS.sovereignGold} />
          <Text style={styles.headerTitle}>HOTSPOT VOUCHERS</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          mw-isp RADIUS Hotspot Generator &bull; {effectiveBaseUrl}
        </Text>
        {statusMessage && <Text style={styles.statusBar}>{statusMessage}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>BATCH CONFIGURATION</Text>

        <Text style={styles.fieldLabel}>ISP Base URL Override (optional)</Text>
        <TextInput
          style={styles.input}
          value={baseUrlOverride}
          onChangeText={setBaseUrlOverride}
          placeholder={session.echoUrl || "http://127.0.0.1:3010"}
          placeholderTextColor={RIOT_COLORS.textMuted}
          autoCapitalize="none"
        />

        <View style={styles.row}>
          <View style={styles.halfCol}>
            <Text style={styles.fieldLabel}>Count (1-1000)</Text>
            <TextInput
              style={styles.input}
              value={countInput}
              onChangeText={setCountInput}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={RIOT_COLORS.textMuted}
            />
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.fieldLabel}>Code Length (8-32)</Text>
            <TextInput
              style={styles.input}
              value={codeLengthInput}
              onChangeText={setCodeLengthInput}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={RIOT_COLORS.textMuted}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Rate Limit (MikroTik RX/TX)</Text>
        <View style={styles.pillRow}>
          {VOUCHER_RATE_PRESETS.map((preset) => {
            const active = rateLimitInput.trim() === preset;
            return (
              <Pressable
                key={preset}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setRateLimitInput(preset)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{preset}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.input}
          value={rateLimitInput}
          onChangeText={setRateLimitInput}
          placeholder="2M/5M"
          placeholderTextColor={RIOT_COLORS.textMuted}
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Duration Limit</Text>
        <View style={styles.pillRow}>
          {VOUCHER_DURATION_PRESETS.map((preset) => {
            const active = timeLimitSecs === preset.secs;
            return (
              <Pressable
                key={preset.label}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setTimeLimitSecs(preset.secs)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Quota MB (optional, blank = Unlimited)</Text>
        <TextInput
          style={styles.input}
          value={quotaMbInput}
          onChangeText={setQuotaMbInput}
          keyboardType="numeric"
          placeholder="e.g. 2048"
          placeholderTextColor={RIOT_COLORS.textMuted}
        />

        <Pressable
          style={[styles.generateBtn, submitting && styles.disabledBtn]}
          onPress={() => void handleGenerateBatch()}
          disabled={submitting}
        >
          <Plus size={16} color={RIOT_COLORS.canvas} />
          <Text style={styles.generateBtnText}>
            {submitting ? "GENERATING..." : "GENERATE BATCH"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.listHeaderRow}>
        <View style={styles.pillRow}>
          {(["ALL", "UNUSED", "REDEEMED"] as const).map((tabFilter) => {
            const active = filter === tabFilter;
            return (
              <Pressable
                key={tabFilter}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setFilter(tabFilter)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {tabFilter}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.iconActions}>
          <Pressable style={styles.iconBtn} onPress={() => void loadVouchers()}>
            <RefreshCw size={16} color={RIOT_COLORS.radarCyan} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => void handleShareBatch()}>
            <Share2 size={16} color={RIOT_COLORS.sovereignGold} />
          </Pressable>
        </View>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={RIOT_COLORS.sovereignGold}
          style={styles.loader}
        />
      ) : null}

      {filteredVouchers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No vouchers matching filter "{filter}".</Text>
        </View>
      ) : (
        filteredVouchers.map((item) => (
          <View key={item.code} style={styles.voucherCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.voucherCode}>{item.code}</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: item.redeemed
                      ? RIOT_COLORS.textMuted
                      : RIOT_COLORS.emerald
                  }
                ]}
              >
                <Text style={styles.badgeText}>{item.redeemed ? "REDEEMED" : "UNUSED"}</Text>
              </View>
            </View>
            <Text style={styles.voucherMeta}>
              Rate: {item.mikrotik_rate_limit} &bull; Duration:{" "}
              {formatDurationLabel(item.time_limit_secs)} &bull; Quota:{" "}
              {formatQuotaLabel(item.quota_bytes)}
            </Text>
            {item.redeemed ? (
              <Text style={styles.redeemedByText}>
                Redeemed by: {item.redeemed_by ?? "unknown"}
              </Text>
            ) : (
              <View style={styles.redeemRow}>
                <TextInput
                  style={styles.redeemInput}
                  value={redeemUsernames[item.code] ?? ""}
                  onChangeText={(text) =>
                    setRedeemUsernames((prev) => ({ ...prev, [item.code]: text }))
                  }
                  placeholder="hotspot username"
                  placeholderTextColor={RIOT_COLORS.textMuted}
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.redeemBtn}
                  onPress={() => void handleRedeem(item.code)}
                >
                  <CheckCircle size={14} color={RIOT_COLORS.canvas} />
                  <Text style={styles.redeemBtnText}>REDEEM</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
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
  card: {
    backgroundColor: RIOT_COLORS.surface,
    padding: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    marginBottom: RIOT_SPACING.lg
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: RIOT_COLORS.textPrimary,
    marginBottom: RIOT_SPACING.sm,
    letterSpacing: 0.5
  },
  fieldLabel: {
    fontSize: 11,
    color: RIOT_COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 6
  },
  input: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    borderRadius: RIOT_RADIUS.sm,
    color: RIOT_COLORS.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 4
  },
  row: {
    flexDirection: "row",
    gap: RIOT_SPACING.sm
  },
  halfCol: {
    flex: 1
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: RIOT_SPACING.xs,
    marginBottom: 6
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RIOT_RADIUS.pill,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  pillActive: {
    backgroundColor: RIOT_COLORS.sovereignGold,
    borderColor: RIOT_COLORS.sovereignGold
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIOT_COLORS.textSecondary
  },
  pillTextActive: {
    color: RIOT_COLORS.canvas
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: RIOT_COLORS.sovereignGold,
    paddingVertical: 10,
    borderRadius: RIOT_RADIUS.sm,
    marginTop: RIOT_SPACING.md
  },
  disabledBtn: {
    opacity: 0.6
  },
  generateBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: RIOT_COLORS.canvas
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: RIOT_SPACING.sm
  },
  iconActions: {
    flexDirection: "row",
    gap: RIOT_SPACING.sm
  },
  iconBtn: {
    padding: 8,
    backgroundColor: RIOT_COLORS.surface,
    borderRadius: RIOT_RADIUS.sm,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border
  },
  loader: {
    marginVertical: RIOT_SPACING.md
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
  voucherCard: {
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
  voucherCode: {
    fontSize: 15,
    fontWeight: "800",
    color: RIOT_COLORS.sovereignGold,
    fontFamily: "monospace",
    letterSpacing: 1
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RIOT_RADIUS.sm
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: RIOT_COLORS.canvas
  },
  voucherMeta: {
    fontSize: 12,
    color: RIOT_COLORS.textSecondary,
    marginBottom: 6
  },
  redeemedByText: {
    fontSize: 12,
    color: RIOT_COLORS.radarCyan
  },
  redeemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: RIOT_SPACING.sm,
    marginTop: 4
  },
  redeemInput: {
    flex: 1,
    backgroundColor: RIOT_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    borderRadius: RIOT_RADIUS.sm,
    color: RIOT_COLORS.textPrimary,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12
  },
  redeemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: RIOT_COLORS.emerald,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RIOT_RADIUS.sm
  },
  redeemBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIOT_COLORS.canvas
  }
});
