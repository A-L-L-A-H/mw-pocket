import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { KeyRound, QrCode, Settings, Trash2 } from "lucide-react-native";
import {
  buildAuthorizationUrl,
  createPkcePair,
  discoverOidcConfiguration,
  exchangeAuthorizationCode
} from "../auth/pkce";
import { usePocket } from "../context/PocketContext";
import { RIOT_COLORS, RIOT_RADIUS, RIOT_SPACING } from "../theme/riot";

WebBrowser.maybeCompleteAuthSession();

export function SettingsScreen(): React.JSX.Element {
  const { session, updateEndpoints, applyPairUri, saveOidcSession, signOut, clearCache } =
    usePocket();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualPairUri, setManualPairUri] = useState("");
  const [echoUrlInput, setEchoUrlInput] = useState(session.echoUrl);
  const [ridUrlInput, setRidUrlInput] = useState(session.ridUrl);
  const [myloveUrlInput, setMyloveUrlInput] = useState(session.myloveUrl);
  const [tokenInput, setTokenInput] = useState(session.accessToken ?? "");
  const [feedback, setFeedback] = useState("Configured");

  const handleApplyPairUri = useCallback(
    async (rawUri: string) => {
      try {
        const applied = await applyPairUri(rawUri);
        setEchoUrlInput(applied.echoUrl);
        setRidUrlInput(applied.ridUrl);
        setMyloveUrlInput(applied.myloveUrl);
        setTokenInput(applied.accessToken ?? "");
        setScannerOpen(false);
        setFeedback("Paired successfully via mw-pocket://pair");
      } catch (pairError) {
        setFeedback(pairError instanceof Error ? pairError.message : "Invalid pair URI");
      }
    },
    [applyPairUri]
  );

  const handleSaveManualEndpoints = useCallback(async () => {
    await updateEndpoints({
      echoUrl: echoUrlInput,
      ridUrl: ridUrlInput,
      myloveUrl: myloveUrlInput,
      accessToken: tokenInput
    });
    setFeedback("Server endpoints saved to SecureStore.");
  }, [echoUrlInput, myloveUrlInput, ridUrlInput, tokenInput, updateEndpoints]);

  const handleOidcSignIn = useCallback(async () => {
    setFeedback("Starting mw-rid OIDC PKCE S256...");
    try {
      const discovery = await discoverOidcConfiguration(ridUrlInput);
      const pkce = await createPkcePair(64);
      const redirectUri = AuthSession.makeRedirectUri({ scheme: "mw-pocket", path: "auth" });
      const state = `mw-${Date.now()}`;
      const authUrl = buildAuthorizationUrl({
        discovery,
        clientId: "mw-pocket",
        redirectUri,
        scope: "openid profile email offline_access",
        state,
        codeChallenge: pkce.codeChallenge
      });

      const browserResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (browserResult.type !== "success" || !browserResult.url) {
        setFeedback("OIDC sign-in cancelled.");
        return;
      }
      const callbackUrl = new URL(browserResult.url);
      const code = callbackUrl.searchParams.get("code");
      const returnedState = callbackUrl.searchParams.get("state");
      if (!code || returnedState !== state) {
        throw new Error("Invalid OIDC callback state or missing authorization code.");
      }

      const tokenPayload = await exchangeAuthorizationCode({
        discovery,
        clientId: "mw-pocket",
        code,
        redirectUri,
        codeVerifier: pkce.codeVerifier
      });
      await saveOidcSession({
        accessToken: tokenPayload.access_token,
        refreshToken: tokenPayload.refresh_token,
        idToken: tokenPayload.id_token,
        expiresInSeconds: tokenPayload.expires_in
      });
      setFeedback("Signed in via mw-rid OIDC PKCE S256.");
    } catch (oidcError) {
      setFeedback(oidcError instanceof Error ? oidcError.message : "OIDC sign-in failed");
    }
  }, [ridUrlInput, saveOidcSession]);

  const handleToggleScanner = useCallback(async () => {
    if (!permission?.granted) {
      const granted = await requestPermission();
      if (!granted.granted) {
        setFeedback("Camera permission denied. Use manual URI paste below.");
        return;
      }
    }
    setScannerOpen((prev) => !prev);
  }, [permission?.granted, requestPermission]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Settings size={20} color={RIOT_COLORS.sovereignGold} />
        <Text style={styles.title}>SETTINGS & PAIRING</Text>
      </View>
      <Text style={styles.feedback}>{feedback}</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <QrCode size={18} color={RIOT_COLORS.radarCyan} />
          <Text style={styles.cardTitle}>QR PAIRING & DEEP LINK</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => void handleToggleScanner()}>
          <Text style={styles.primaryButtonText}>
            {scannerOpen ? "CLOSE QR SCANNER" : "SCAN ECHO PAIRING QR"}
          </Text>
        </Pressable>
        {scannerOpen ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(scanEvent) => {
                if (scanEvent.data) {
                  void handleApplyPairUri(scanEvent.data);
                }
              }}
            />
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="mw-pocket://pair?echo=...&rid=...&mylove=..."
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={manualPairUri}
          onChangeText={setManualPairUri}
        />
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void handleApplyPairUri(manualPairUri)}
        >
          <Text style={styles.secondaryButtonText}>APPLY PAIR URI</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>LAN / CLOUDFLARE TUNNEL ENDPOINTS</Text>
        <TextInput
          style={styles.input}
          placeholder="mw-echo URL"
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={echoUrlInput}
          onChangeText={setEchoUrlInput}
        />
        <TextInput
          style={styles.input}
          placeholder="mw-rid URL"
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={ridUrlInput}
          onChangeText={setRidUrlInput}
        />
        <TextInput
          style={styles.input}
          placeholder="A-L-L-A-H.COM / mw-mylove URL"
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={myloveUrlInput}
          onChangeText={setMyloveUrlInput}
        />
        <TextInput
          style={styles.input}
          placeholder="MW_ECHO_TOKEN (optional)"
          placeholderTextColor={RIOT_COLORS.textMuted}
          value={tokenInput}
          onChangeText={setTokenInput}
          secureTextEntry
        />
        <Pressable
          style={styles.primaryButton}
          onPress={() => void handleSaveManualEndpoints()}
        >
          <Text style={styles.primaryButtonText}>SAVE ENDPOINTS</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <KeyRound size={18} color={RIOT_COLORS.emerald} />
          <Text style={styles.cardTitle}>MW-RID OIDC SSO ({session.mode.toUpperCase()})</Text>
        </View>
        <View style={styles.actionRow}>
          <Pressable style={styles.primaryButton} onPress={() => void handleOidcSignIn()}>
            <Text style={styles.primaryButtonText}>SIGN IN (PKCE S256)</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, { borderColor: RIOT_COLORS.riotCrimson }]}
            onPress={() => {
              void signOut();
              setFeedback("Signed out.");
            }}
          >
            <Text style={[styles.secondaryButtonText, { color: RIOT_COLORS.riotCrimson }]}>
              SIGN OUT
            </Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.cacheButton}
          onPress={() => {
            void clearCache();
            setFeedback("Offline snapshot cache cleared.");
          }}
        >
          <Trash2 size={14} color={RIOT_COLORS.textSecondary} />
          <Text style={styles.cacheButtonText}>CLEAR OFFLINE SNAPSHOT CACHE</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RIOT_COLORS.canvas },
  content: { padding: RIOT_SPACING.lg, gap: RIOT_SPACING.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: RIOT_SPACING.sm },
  title: { color: RIOT_COLORS.textPrimary, fontSize: 20, fontWeight: "800" },
  feedback: { color: RIOT_COLORS.radarCyan, fontSize: 12 },
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
  cameraContainer: { height: 220, borderRadius: RIOT_RADIUS.md, overflow: "hidden" },
  camera: { flex: 1 },
  input: {
    backgroundColor: RIOT_COLORS.surfaceElevated,
    color: RIOT_COLORS.textPrimary,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.border,
    paddingHorizontal: RIOT_SPACING.md,
    paddingVertical: RIOT_SPACING.sm
  },
  primaryButton: {
    flex: 1,
    backgroundColor: RIOT_COLORS.sovereignGold,
    paddingVertical: RIOT_SPACING.sm,
    paddingHorizontal: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    alignItems: "center"
  },
  primaryButtonText: { color: RIOT_COLORS.canvas, fontWeight: "800", fontSize: 12 },
  secondaryButton: {
    paddingVertical: RIOT_SPACING.sm,
    paddingHorizontal: RIOT_SPACING.md,
    borderRadius: RIOT_RADIUS.md,
    borderWidth: 1,
    borderColor: RIOT_COLORS.radarCyan,
    alignItems: "center"
  },
  secondaryButtonText: { color: RIOT_COLORS.radarCyan, fontWeight: "800", fontSize: 12 },
  actionRow: { flexDirection: "row", gap: RIOT_SPACING.sm },
  cacheButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: RIOT_SPACING.sm
  },
  cacheButtonText: { color: RIOT_COLORS.textSecondary, fontSize: 11, fontWeight: "700" }
});
