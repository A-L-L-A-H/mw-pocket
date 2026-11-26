import { describe, expect, test } from "bun:test";
import { parsePairUri } from "../src/pairing/pairUri";

describe("mw-pocket://pair URI parser", () => {
  test("parses valid LAN/Tunnel pairing URI with optional token", () => {
    const uri =
      "mw-pocket://pair?echo=http%3A%2F%2F192.168.1.50%3A3010%2F&rid=https%3A%2F%2Frid.moonwitness.com&mylove=https%3A%2F%2Fa-l-l-a-h.com&token=echo_tok_999";
    const parsed = parsePairUri(uri);
    expect(parsed.echoUrl).toBe("http://192.168.1.50:3010");
    expect(parsed.ridUrl).toBe("https://rid.moonwitness.com");
    expect(parsed.myloveUrl).toBe("https://a-l-l-a-h.com");
    expect(parsed.token).toBe("echo_tok_999");
  });

  test("rejects javascript:, data:, and non-http(s) schemes", () => {
    expect(() =>
      parsePairUri(
        "mw-pocket://pair?echo=javascript:alert(1)&rid=https://rid.example.com&mylove=https://a-l-l-a-h.com"
      )
    ).toThrow(/unsafe/i);

    expect(() =>
      parsePairUri(
        "mw-pocket://pair?echo=https://echo.example.com&rid=data:text/html,evil&mylove=https://a-l-l-a-h.com"
      )
    ).toThrow(/unsafe/i);

    expect(() =>
      parsePairUri(
        "mw-pocket://pair?echo=ftp://echo.example.com&rid=https://rid.example.com&mylove=https://a-l-l-a-h.com"
      )
    ).toThrow(/disallowed protocol/i);
  });

  test("rejects non-mw-pocket scheme or wrong host", () => {
    expect(() => parsePairUri("https://evil.com/pair?echo=https://a.com")).toThrow(/scheme/i);
    expect(() =>
      parsePairUri("mw-pocket://other?echo=https://a.com&rid=https://b.com&mylove=https://c.com")
    ).toThrow(/unsupported/i);
  });
});
