export type AuthMode = "oidc" | "echo_token" | "unauthenticated";

export interface PocketSession {
  readonly mode: AuthMode;
  readonly echoUrl: string;
  readonly ridUrl: string;
  readonly myloveUrl: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly idToken?: string;
  readonly expiresAtMs?: number;
  readonly subject?: string;
}

export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

const SESSION_STORAGE_KEY = "mw_pocket_session_v1";

export const DEFAULT_POCKET_SESSION: PocketSession = {
  mode: "unauthenticated",
  echoUrl: "http://192.168.1.10:3010",
  ridUrl: "http://192.168.1.10:3005",
  myloveUrl: "https://a-l-l-a-h.com"
};

export function createInMemorySecureStorage(): SecureStorageAdapter {
  const vault = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return vault.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      vault.set(key, value);
    },
    async deleteItem(key: string): Promise<void> {
      vault.delete(key);
    }
  };
}

export function createExpoSecureStorageAdapter(): SecureStorageAdapter {
  return {
    async getItem(key: string): Promise<string | null> {
      const secureStore = await import("expo-secure-store");
      return secureStore.getItemAsync(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      const secureStore = await import("expo-secure-store");
      await secureStore.setItemAsync(key, value);
    },
    async deleteItem(key: string): Promise<void> {
      const secureStore = await import("expo-secure-store");
      await secureStore.deleteItemAsync(key);
    }
  };
}

export class PocketSessionStore {
  private readonly storage: SecureStorageAdapter;

  constructor(storage: SecureStorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<PocketSession> {
    const rawJson = await this.storage.getItem(SESSION_STORAGE_KEY);
    if (!rawJson) {
      return { ...DEFAULT_POCKET_SESSION };
    }
    try {
      const parsed = JSON.parse(rawJson) as Partial<PocketSession>;
      return {
        mode: parsed.mode ?? "unauthenticated",
        echoUrl: parsed.echoUrl ?? DEFAULT_POCKET_SESSION.echoUrl,
        ridUrl: parsed.ridUrl ?? DEFAULT_POCKET_SESSION.ridUrl,
        myloveUrl: parsed.myloveUrl ?? DEFAULT_POCKET_SESSION.myloveUrl,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        idToken: parsed.idToken,
        expiresAtMs: parsed.expiresAtMs,
        subject: parsed.subject
      };
    } catch {
      return { ...DEFAULT_POCKET_SESSION };
    }
  }

  async save(session: PocketSession): Promise<void> {
    await this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  async saveEchoTokenPairing(params: {
    echoUrl: string;
    ridUrl: string;
    myloveUrl: string;
    token?: string;
  }): Promise<PocketSession> {
    const nextSession: PocketSession = {
      mode: params.token ? "echo_token" : "unauthenticated",
      echoUrl: params.echoUrl,
      ridUrl: params.ridUrl,
      myloveUrl: params.myloveUrl,
      accessToken: params.token
    };
    await this.save(nextSession);
    return nextSession;
  }

  async saveOidcTokens(params: {
    baseSession: PocketSession;
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresInSeconds?: number;
    subject?: string;
  }): Promise<PocketSession> {
    const expiresAtMs = params.expiresInSeconds
      ? Date.now() + params.expiresInSeconds * 1000
      : undefined;
    const nextSession: PocketSession = {
      ...params.baseSession,
      mode: "oidc",
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? params.baseSession.refreshToken,
      idToken: params.idToken ?? params.baseSession.idToken,
      expiresAtMs,
      subject: params.subject ?? params.baseSession.subject
    };
    await this.save(nextSession);
    return nextSession;
  }

  async clearAuth(): Promise<PocketSession> {
    const current = await this.load();
    const cleared: PocketSession = {
      mode: "unauthenticated",
      echoUrl: current.echoUrl,
      ridUrl: current.ridUrl,
      myloveUrl: current.myloveUrl
    };
    await this.save(cleared);
    return cleared;
  }

  async wipeAll(): Promise<void> {
    await this.storage.deleteItem(SESSION_STORAGE_KEY);
  }
}
