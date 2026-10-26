import { describe, it, expect } from "vitest";
import { matchPlaces } from "@/lib/place-search";
import {
  GATE_PICKUP_POINTS,
  PICKUP_PLACES,
  PLACES,
  placeOf,
} from "@/lib/airport";
import { locationPhotoError } from "@/lib/location-photo";
import { readSeedZones } from "@/lib/zones";
describe("current-location clues", () => {
  it.each(["130", "130번", "130번 앞", "Gate 130", "130번 게이트"])(
    "finds a canonical gate from %s",
    (text) => {
      expect(matchPlaces(text).candidates.map((c) => c.place.id)).toEqual([
        "cc-130",
      ]);
    },
  );
  it("reads common OCR character confusions only in gate context", () => {
    expect(matchPlaces("GATE I30", "all", "photo").gates).toEqual([130]);
    expect(matchPlaces("GATE L25", "all", "photo").gates).toEqual([125]);
    expect(matchPlaces("SHOP I30", "all", "photo").candidates).toEqual([]);
  });
  it("supports an exact gate 127 pickup rather than silently moving a passenger to gate 125", () => {
    const c = matchPlaces("Gate 127").candidates[0];
    expect(c.place.id).toBe("gate-127");
    expect(c.place.label).toContain("127번");
    expect(c.place.zoneId).toBe("cc-end");
    expect(placeOf(c.place.id)).toEqual(c.place);
  });
  it("does not map unsupported gates or price and date digits to a location", () => {
    expect(matchPlaces("Gate 999", "all", "photo")).toMatchObject({
      candidates: [],
      unsupported: [999],
    });
    for (const text of [
      "커피 6500원 2026.10.26",
      "스타벅스 250",
      "전화 010-1234-5678",
      "₩130",
    ]) {
      expect(matchPlaces(text, "all", "photo").candidates).toEqual([]);
    }
  });
  it("requires clarification for multiple gates and directional signs", () => {
    expect(matchPlaces("Gate 125 Gate 130", "all", "photo")).toMatchObject({
      gates: [125, 130],
      ambiguous: true,
    });
    expect(matchPlaces("GATES 101-132 →", "all", "photo").ambiguous).toBe(true);
  });
  it("refuses inconsistent area and gate clues", () => {
    expect(matchPlaces("Gate 127 4F", "all", "photo")).toMatchObject({
      candidates: [],
      conflict: true,
    });
    expect(
      matchPlaces("Gate 127 3F", "all", "photo").candidates[0].place.id,
    ).toBe("gate-127");
    expect(
      matchPlaces("제1터미널 도착장 1층", "all", "photo").candidates[0].place
        .id,
    ).toBe("t1-arrivals-demo");
    expect(matchPlaces("T2 Gate 130", "all", "photo")).toMatchObject({
      candidates: [],
      conflict: true,
    });
    expect(matchPlaces("130", "T1")).toMatchObject({
      candidates: [],
      conflict: true,
    });
    expect(
      matchPlaces("T1 탑승동 Gate 130", "all", "photo").candidates[0].place.id,
    ).toBe("cc-130");
  });
  it("offers multiple help desks without inventing a merchant database", () => {
    expect(matchPlaces("안내데스크").candidates.map((c) => c.place.id)).toEqual(
      ["t1-info", "t2-help"],
    );
    expect(
      matchPlaces("제2터미널 안내데스크").candidates.map((c) => c.place.id),
    ).toEqual(["t2-help"]);
    expect(matchPlaces("스타벅스").candidates).toEqual([]);
    expect(
      matchPlaces("STARBUCKS GATE 250", "all", "photo").candidates[0].place.id,
    ).toBe("t2-center");
  });
  it("keeps every pilot gate in its configured staff zone and leaves the kiosk preset list intact", () => {
    const zones = readSeedZones();
    expect(GATE_PICKUP_POINTS).toHaveLength(166);
    for (const { gate, place } of GATE_PICKUP_POINTS) {
      const zone = zones.find((z) => z.id === place.zoneId);
      expect(
        zone?.gateRanges.some(([first, last]) => gate >= first && gate <= last),
      ).toBe(true);
      expect(zone?.terminal).toBe(place.area);
    }
    expect(new Set(PICKUP_PLACES.map((p) => p.id)).size).toBe(
      PICKUP_PLACES.length,
    );
    expect(PLACES.some((p) => p.id === "gate-127")).toBe(false);
    expect(placeOf("gate-999")).toBeNull();
  });
  it("bounds clue parsing and keeps arbitrary markup as unmatched text", () => {
    expect(matchPlaces('<script>alert("x")</script>').candidates).toEqual([]);
    expect(matchPlaces("x".repeat(5000) + " Gate 130").candidates).toEqual([]);
  });
});
describe("local photo input validation", () => {
  it("accepts supported photos without uploading anything", () => {
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]) {
      expect(
        locationPhotoError({ type, name: "photo", size: 1024 }),
      ).toBeNull();
    }
  });
  it("rejects empty, oversized and non-photo files before decoding", () => {
    expect(
      locationPhotoError({
        type: "image/png",
        name: "a.png",
        size: 21 * 1024 * 1024,
      }),
    ).toBe("photo_too_large");
    expect(
      locationPhotoError({ type: "image/png", name: "a.png", size: 0 }),
    ).toBe("photo_format");
    expect(
      locationPhotoError({
        type: "image/svg+xml",
        name: "fake.png",
        size: 100,
      }),
    ).toBe("photo_format");
  });
});
