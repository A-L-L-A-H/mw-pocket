import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createAsyncStorageSnapshotCache,
  MoonWitnessMobileClient,
  SnapshotCacheAdapter
} from "../api/client";
import {
  createExpoSecureStorageAdapter,
  DEFAULT_POCKET_SESSION,
  PocketSession,
  PocketSessionStore
} from "../auth/session";
import { parsePairUri } from "../pairing/pairUri";

interface PocketContextValue {
  readonly session: PocketSession;
  readonly client: MoonWitnessMobileClient;
  readonly isLoaded: boolean;
  readonly updateEndpoints: (next: {
    echoUrl: string;
    ridUrl: string;
    myloveUrl: string;
    accessToken?: string;
  }) => Promise<void>;
  readonly applyPairUri: (rawUri: string) => Promise<PocketSession>;
  readonly saveOidcSession: (params: {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresInSeconds?: number;
    subject?: string;
  }) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly clearCache: () => Promise<void>;
}

const PocketContext = createContext<PocketContextValue | null>(null);

export function PocketProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const sessionStore = useMemo(
    () => new PocketSessionStore(createExpoSecureStorageAdapter()),
    []
  );
  const cacheAdapter = useMemo<SnapshotCacheAdapter>(
    () => createAsyncStorageSnapshotCache(),
    []
  );
  const [session, setSession] = useState<PocketSession>(DEFAULT_POCKET_SESSION);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    sessionStore
      .load()
      .then((loadedSession) => {
        if (active) {
          setSession(loadedSession);
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setIsLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [sessionStore]);

  const client = useMemo(
    () =>
      new MoonWitnessMobileClient({
        echoUrl: session.echoUrl,
        myloveUrl: session.myloveUrl,
        accessToken: session.accessToken,
        cache: cacheAdapter
      }),
    [session.echoUrl, session.myloveUrl, session.accessToken, cacheAdapter]
  );

  const updateEndpoints = useCallback(
    async (next: {
      echoUrl: string;
      ridUrl: string;
      myloveUrl: string;
      accessToken?: string;
    }) => {
      const saved = await sessionStore.saveEchoTokenPairing({
        echoUrl: next.echoUrl.trim().replace(/\/+$/, ""),
        ridUrl: next.ridUrl.trim().replace(/\/+$/, ""),
        myloveUrl: next.myloveUrl.trim().replace(/\/+$/, ""),
        token: next.accessToken?.trim() || undefined
      });
      setSession(saved);
    },
    [sessionStore]
  );

  const applyPairUri = useCallback(
    async (rawUri: string): Promise<PocketSession> => {
      const parsed = parsePairUri(rawUri);
      const saved = await sessionStore.saveEchoTokenPairing({
        echoUrl: parsed.echoUrl,
        ridUrl: parsed.ridUrl,
        myloveUrl: parsed.myloveUrl,
        token: parsed.token
      });
      setSession(saved);
      return saved;
    },
    [sessionStore]
  );

  const saveOidcSession = useCallback(
    async (params: {
      accessToken: string;
      refreshToken?: string;
      idToken?: string;
      expiresInSeconds?: number;
      subject?: string;
    }) => {
      const saved = await sessionStore.saveOidcTokens({
        baseSession: session,
        ...params
      });
      setSession(saved);
    },
    [session, sessionStore]
  );

  const signOut = useCallback(async () => {
    const cleared = await sessionStore.clearAuth();
    setSession(cleared);
  }, [sessionStore]);

  const clearCache = useCallback(async () => {
    await cacheAdapter.clearSnapshots();
  }, [cacheAdapter]);

  const value = useMemo<PocketContextValue>(
    () => ({
      session,
      client,
      isLoaded,
      updateEndpoints,
      applyPairUri,
      saveOidcSession,
      signOut,
      clearCache
    }),
    [session, client, isLoaded, updateEndpoints, applyPairUri, saveOidcSession, signOut, clearCache]
  );

  return <PocketContext.Provider value={value}>{children}</PocketContext.Provider>;
}

export function usePocket(): PocketContextValue {
  const ctx = useContext(PocketContext);
  if (!ctx) {
    throw new Error("usePocket must be called inside PocketProvider.");
  }
  return ctx;
}
