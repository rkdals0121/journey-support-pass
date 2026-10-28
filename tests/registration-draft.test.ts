import { describe, expect, it } from "vitest";
import {
  normalizeFlightQuery,
  readRegistrationDraft,
} from "../src/lib/registration-draft";
const now = 1_000_000;
const draft = {
  at: now,
  context: "booking-A",
  lang: "en",
  choices: ["tr_walk", "mov_no_stairs"],
  extra: { party: 3, strollers: 1, note: "쉬었다 갈게요" },
  step: 3,
  query: "천",
  later: false,
  laterDate: "",
  laterNo: "",
  flight: null,
  docs: ["welfare"],
  noDocs: false,
  proofOk: { welfare: true },
};
describe("private registration history draft", () => {
  it("restores selected answers, companions, notes and document acknowledgement", () => {
    expect(readRegistrationDraft(draft, "booking-A", now)).toEqual(draft);
  });
  it("does not mix a different booking or restore expired answers", () => {
    expect(readRegistrationDraft(draft, "booking-B", now)).toBeNull();
    expect(
      readRegistrationDraft(draft, "booking-A", now + 3_600_001),
    ).toBeNull();
    expect(readRegistrationDraft(draft, "booking-A", now - 1)).toBeNull();
  });
  it("rejects corrupt state and limits unrecognized fields", () => {
    expect(readRegistrationDraft(null, "", now)).toBeNull();
    expect(
      readRegistrationDraft({ ...draft, choices: [null] }, "booking-A", now),
    ).toBeNull();
    expect(
      readRegistrationDraft({ ...draft, step: -1 }, "booking-A", now),
    ).toBeNull();
    const restored = readRegistrationDraft(
      {
        ...draft,
        choices: ["mov_no_stairs", "unknown"],
        extra: { party: 999, note: "abc" },
      },
      "booking-A",
      now,
    )!;
    expect(restored.choices).toEqual(["mov_no_stairs"]);
    expect(restored.extra.party).toBeNull();
  });
});
describe("Korean flight search input", () => {
  it.each(["ㆍ", "ㅊㆍ", "ᆞ", "ㅊᆞ", "천", "천진", "천"])(
    "keeps Cheonjiin and Hangul composition %s",
    (value) => {
      expect(normalizeFlightQuery(value)).toBe(value);
    },
  );
  it("normalizes flight codes after composition", () => {
    expect(normalizeFlightQuery(" ke123")).toBe("KE123");
    expect(normalizeFlightQuery("천\u0000진")).toBe("천진");
  });
});
