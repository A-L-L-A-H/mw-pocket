import { describe, expect, test } from "bun:test";
import {
  createInMemorySnapshotCache,
  MoonWitnessMobileClient
} from "../src/api/client";

describe("MoonWitnessMobileClient", () => {
  test("injects Bearer header and caches offline snapshots", async () => {
    const cache = createInMemorySnapshotCache();
    const capturedHeaders: Array<string | null> = [];
    let shouldFailNetwork = false;

    const mockFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      if (shouldFailNetwork) {
        throw new Error("Network unreachable");
      }
      const headers = new Headers(init?.headers);
      capturedHeaders.push(headers.get("Authorization"));
      return new Response(
        JSON.stringify([
          { id: "mw-echo", name: "mw-echo", port: 3010, status: "online", latencyMs: 12 }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new MoonWitnessMobileClient({
      echoUrl: "http://192.168.1.10:3010",
      myloveUrl: "https://a-l-l-a-h.com",
      accessToken: "bearer_secret_42",
      fetchImpl: mockFetch,
      cache
    });

    const liveResult = await client.getFleetServices();
    expect(capturedHeaders[0]).toBe("Bearer bearer_secret_42");
    expect(liveResult.fromCache).toBe(false);
    expect(liveResult.payload[0]?.name).toBe("mw-echo");

    shouldFailNetwork = true;
    const cachedResult = await client.getFleetServices();
    expect(cachedResult.fromCache).toBe(true);
    expect(cachedResult.payload[0]?.port).toBe(3010);
  });

  test("aborts requests when timeout expires", async () => {
    const slowFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted by timeout"));
        });
      });
    }) as typeof fetch;

    const client = new MoonWitnessMobileClient({
      echoUrl: "http://192.168.1.10:3010",
      myloveUrl: "https://a-l-l-a-h.com",
      timeoutMs: 30,
      fetchImpl: slowFetch
    });

    await expect(client.getRadarEvents()).rejects.toThrow(/aborted/i);
  });
});
