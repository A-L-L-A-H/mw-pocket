import { describe, expect, mock, test } from "bun:test";
import * as actualReact from "react";

const createReactMock = () => {
  const createElement = (
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children
    }
  });

  const hooks = {
    ...actualReact,
    createElement,
    Fragment: actualReact.Fragment ?? Symbol("Fragment"),
    useState: <T,>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] => {
      const value = typeof initial === "function" ? (initial as () => T)() : initial;
      return [value, () => {}];
    },
    useEffect: (_effect: () => void | (() => void), _deps?: readonly unknown[]) => {},
    useCallback: <T extends (...args: never[]) => unknown>(fn: T, _deps: readonly unknown[]): T =>
      fn,
    useMemo: <T,>(factory: () => T, _deps: readonly unknown[]): T => factory()
  };

  return {
    ...hooks,
    default: hooks
  };
};

mock.module("react", createReactMock);

mock.module("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: () => {} },
  Pressable: "Pressable",
  RefreshControl: "RefreshControl",
  ScrollView: "ScrollView",
  Share: { share: async () => ({ action: "sharedAction" }) },
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T): T => styles
  },
  Text: "Text",
  TextInput: "TextInput",
  View: "View"
}));

mock.module("lucide-react-native", () => ({
  CheckCircle: "CheckCircle",
  Plus: "Plus",
  RefreshCw: "RefreshCw",
  Share2: "Share2",
  Ticket: "Ticket"
}));

mock.module("../src/context/PocketContext", () => ({
  usePocket: () => ({
    session: {
      echoUrl: "https://echo.fleet.internal",
      ridUrl: "https://rid.fleet.internal",
      myloveUrl: "https://mylove.fleet.internal",
      accessToken: "mw-rid:tok_voucher_test"
    },
    isLoaded: true
  })
}));

const voucherMod = await import("../src/screens/VoucherGeneratorScreen");

describe("VoucherGeneratorScreen & mw-isp voucher contracts", () => {
  test("validRateLimit matches mw-isp valid_rate_limit rules", () => {
    expect(voucherMod.validRateLimit("2M/5M")).toBe(true);
    expect(voucherMod.validRateLimit("512k/1M")).toBe(true);
    expect(voucherMod.validRateLimit("100M/1G")).toBe(true);
    expect(voucherMod.validRateLimit("1000/2000")).toBe(true);

    expect(voucherMod.validRateLimit("fast")).toBe(false);
    expect(voucherMod.validRateLimit("2M")).toBe(false);
    expect(voucherMod.validRateLimit("/5M")).toBe(false);
    expect(voucherMod.validRateLimit("2M/")).toBe(false);
    expect(voucherMod.validRateLimit("2X/5M")).toBe(false);
    expect(voucherMod.validRateLimit("2MM/5M")).toBe(false);
  });

  test("validateVoucherBatchInput enforces count, codeLength, timeLimitSecs, quotaMb, and rateLimit", () => {
    expect(
      voucherMod.validateVoucherBatchInput({
        count: 0,
        timeLimitSecs: 3600,
        rateLimit: "2M/5M"
      }).valid
    ).toBe(false);

    expect(
      voucherMod.validateVoucherBatchInput({
        count: 1001,
        timeLimitSecs: 3600,
        rateLimit: "2M/5M"
      }).valid
    ).toBe(false);

    expect(
      voucherMod.validateVoucherBatchInput({
        count: 5,
        codeLength: 4,
        timeLimitSecs: 3600,
        rateLimit: "2M/5M"
      }).valid
    ).toBe(false);

    expect(
      voucherMod.validateVoucherBatchInput({
        count: 5,
        timeLimitSecs: 0,
        rateLimit: "2M/5M"
      }).valid
    ).toBe(false);

    expect(
      voucherMod.validateVoucherBatchInput({
        count: 5,
        timeLimitSecs: 3600,
        rateLimit: "invalid"
      }).valid
    ).toBe(false);

    const validResult = voucherMod.validateVoucherBatchInput({
      count: "25",
      codeLength: "12",
      timeLimitSecs: 86400,
      quotaMb: "512",
      rateLimit: "5M/10M"
    });
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toEqual([]);
    expect(validResult.request).toEqual({
      count: 25,
      code_length: 12,
      time_limit_secs: 86400,
      quota_bytes: 512 * 1024 * 1024,
      rate_limit: "5M/10M"
    });
  });

  test("formatDurationLabel, formatQuotaLabel, and formatVoucherBatchShareText format cleanly", () => {
    expect(voucherMod.formatDurationLabel(3600)).toBe("1h");
    expect(voucherMod.formatDurationLabel(86400)).toBe("1d");
    expect(voucherMod.formatDurationLabel(1800)).toBe("30m");
    expect(voucherMod.formatQuotaLabel(null)).toBe("Unlimited");
    expect(voucherMod.formatQuotaLabel(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
    expect(voucherMod.formatQuotaLabel(500 * 1024 * 1024)).toBe("500 MB");

    const shareText = voucherMod.formatVoucherBatchShareText([
      {
        code: "ABCD2345EF",
        time_limit_secs: 3600,
        quota_bytes: 512 * 1024 * 1024,
        mikrotik_rate_limit: "2M/5M",
        redeemed: false,
        redeemed_by: null
      },
      {
        code: "GHJK6789MN",
        time_limit_secs: 86400,
        quota_bytes: null,
        mikrotik_rate_limit: "5M/10M",
        redeemed: true,
        redeemed_by: "guest_01"
      }
    ]);
    expect(shareText).toContain("MoonWitness ISP Hotspot Vouchers (2):");
    expect(shareText).toContain("ABCD2345EF | 2M/5M | 1h | 512 MB | UNUSED");
    expect(shareText).toContain("GHJK6789MN | 5M/10M | 1d | Unlimited | REDEEMED (guest_01)");
  });

  test("generateVoucherBatch, fetchVoucherList, and redeemVoucherCode hit mw-isp endpoints with Bearer auth", async () => {
    const calls: Array<{ url: string; method: string; auth: string | null; body?: string }> = [];
    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const auth = new Headers(init?.headers).get("Authorization");
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, method, auth, body });

      if (url.endsWith("/api/isp/vouchers/batch") && method === "POST") {
        return new Response(
          JSON.stringify([
            {
              code: "VOUCH12345",
              time_limit_secs: 3600,
              quota_bytes: null,
              mikrotik_rate_limit: "2M/5M",
              redeemed: false,
              redeemed_by: null
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/api/isp/vouchers") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              code: "VOUCH12345",
              time_limit_secs: 3600,
              quota_bytes: null,
              mikrotik_rate_limit: "2M/5M",
              redeemed: false,
              redeemed_by: null
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/api/isp/vouchers/redeem") && method === "POST") {
        return new Response(
          JSON.stringify({
            code: "VOUCH12345",
            time_limit_secs: 3600,
            quota_bytes: null,
            mikrotik_rate_limit: "2M/5M",
            redeemed: true,
            redeemed_by: "hotspot_user_1"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const opts = {
      baseUrl: "https://isp.fleet.internal/",
      getAccessToken: () => "mw-rid:tok_isp",
      fetchImpl: mockFetch
    };

    const created = await voucherMod.generateVoucherBatch({
      ...opts,
      request: {
        count: 1,
        code_length: 10,
        time_limit_secs: 3600,
        quota_bytes: null,
        rate_limit: "2M/5M"
      }
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.code).toBe("VOUCH12345");

    const listed = await voucherMod.fetchVoucherList(opts);
    expect(listed).toHaveLength(1);

    const redeemed = await voucherMod.redeemVoucherCode({
      ...opts,
      code: "VOUCH12345",
      username: "hotspot_user_1"
    });
    expect(redeemed.redeemed).toBe(true);
    expect(redeemed.redeemed_by).toBe("hotspot_user_1");

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://isp.fleet.internal/api/isp/vouchers/batch",
      "GET https://isp.fleet.internal/api/isp/vouchers",
      "POST https://isp.fleet.internal/api/isp/vouchers/redeem"
    ]);
    for (const call of calls) {
      expect(call.auth).toBe("Bearer mw-rid:tok_isp");
    }

    const errorFetch = (async () =>
      new Response("voucher already redeemed", { status: 409 })) as unknown as typeof fetch;

    await expect(
      voucherMod.redeemVoucherCode({
        baseUrl: "https://isp.fleet.internal",
        getAccessToken: () => null,
        fetchImpl: errorFetch,
        code: "VOUCH12345",
        username: "guest"
      })
    ).rejects.toThrow("Voucher API HTTP 409");
  });

  test("VoucherGeneratorScreen renders a valid React element tree with mocked RN & PocketContext", () => {
    const element = voucherMod.VoucherGeneratorScreen() as unknown as {
      type: unknown;
      props: { children: unknown };
    };
    expect(element).toBeDefined();
    expect(element.type).toBe("ScrollView");
    const serialized = JSON.stringify(element);
    expect(serialized).toContain("HOTSPOT VOUCHERS");
    expect(serialized).toContain("GENERATE BATCH");
    expect(serialized).toContain("https://echo.fleet.internal");
  });

  test("VoucherGeneratorScreen avoids keystroke baseUrl fetches and does not leak timeout timers on token failure", async () => {
    // 1. Verify TextInput commits baseUrlOverride on onEndEditing/onSubmitEditing rather than onChangeText
    const element = voucherMod.VoucherGeneratorScreen() as unknown as {
      type: unknown;
      props: Record<string, unknown>;
    };

    const findElements = (
      node: unknown,
      predicate: (el: { type: unknown; props: Record<string, unknown> }) => boolean
    ): Array<{ type: unknown; props: Record<string, unknown> }> => {
      const results: Array<{ type: unknown; props: Record<string, unknown> }> = [];
      if (!node || typeof node !== "object") return results;
      if (Array.isArray(node)) {
        for (const item of node) {
          results.push(...findElements(item, predicate));
        }
        return results;
      }
      const el = node as { type?: unknown; props?: Record<string, unknown> };
      if (el.type && el.props) {
        const typed = { type: el.type, props: el.props };
        if (predicate(typed)) {
          results.push(typed);
        }
        if (el.props.children !== undefined) {
          results.push(...findElements(el.props.children, predicate));
        }
      }
      return results;
    };

    const baseUrlInputs = findElements(
      element,
      (el) =>
        el.type === "TextInput" &&
        el.props.placeholder === "https://echo.fleet.internal"
    );
    expect(baseUrlInputs).toHaveLength(1);
    expect(typeof baseUrlInputs[0]?.props.onChangeText).toBe("function");
    expect(typeof baseUrlInputs[0]?.props.onEndEditing).toBe("function");
    expect(typeof baseUrlInputs[0]?.props.onSubmitEditing).toBe("function");

    // 2. Verify requestVoucherApi does not leak a timeout timer when getAccessToken rejects
    const origSetTimeout = globalThis.setTimeout;
    let timersCreated = 0;
    let fetchCalled = false;
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      timersCreated += 1;
      return origSetTimeout(...args);
    }) as typeof setTimeout;

    try {
      await expect(
        voucherMod.fetchVoucherList({
          baseUrl: "https://isp.fleet.internal",
          getAccessToken: async () => {
            throw new Error("token failure");
          },
          fetchImpl: (async () => {
            fetchCalled = true;
            return new Response("[]");
          }) as unknown as typeof fetch
        })
      ).rejects.toThrow("token failure");
      expect(fetchCalled).toBe(false);
      expect(timersCreated).toBe(0);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});
