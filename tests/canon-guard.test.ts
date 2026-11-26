import { describe, expect, test } from "bun:test";
import {
  assertCanon0011,
  evaluateCanon0011,
  filterCanonSafePayloads
} from "../src/guards/canon";

describe("CAN-0011 runtime guard", () => {
  test("allows typographic, geometric, and celestial crescent/orbit payloads", () => {
    const verdict = evaluateCanon0011({
      id: "card-1",
      title: "Surah Al-Insyirah 94:5",
      visualType: "celestial",
      caption: "Golden crescent orbit geometry"
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.ruleId).toBe("CAN-0011");
  });

  test("blocks figurative depictions of Allah, Prophet Muhammad, or Isa/Yesus", () => {
    expect(() =>
      assertCanon0011({
        title: "Portrait of Prophet Muhammad",
        visualType: "typographic"
      })
    ).toThrow(/CAN-0011/);

    expect(
      evaluateCanon0011({
        caption: "Illustration of Yesus",
        visualType: "geometric"
      }).allowed
    ).toBe(false);

    expect(
      evaluateCanon0011({
        title: "Celestial",
        visualType: "human-portrait"
      }).allowed
    ).toBe(false);
  });

  test("filters unsafe entries out of dynamic card arrays", () => {
    const filtered = filterCanonSafePayloads([
      { id: "safe-1", title: "Crescent Orbit", visualType: "crescent" },
      { id: "unsafe-1", title: "Face of Allah", visualType: "typographic" }
    ]);
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("safe-1");
  });
});
