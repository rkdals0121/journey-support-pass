import { describe, expect, it } from "vitest";
import { facilityMatches, facilitiesForMapDisplay } from "@/lib/facility-map-filter";
import { MAP_FACILITIES } from "@/lib/map-facilities";

describe("facility map filtering", () => {
  it("keeps map facilities visible when mobility pickup choices contain only gates or are empty", () => {
    const displayed = facilitiesForMapDisplay(1, "all", "");
    expect(displayed).toEqual(MAP_FACILITIES.filter(p => p.building === 1));
    expect(displayed.some(p => p.category === 112)).toBe(true);
    expect(displayed.some(p => p.category === 104)).toBe(true);
    expect(displayed.some(p => p.name.startsWith("출국장"))).toBe(true);
    const gateOnly = displayed.filter(p => /^탑승구 \d+$/.test(p.name));
    expect(gateOnly.length).toBeGreaterThan(0);
    expect(displayed.length).toBeGreaterThan(gateOnly.length);
    expect(facilitiesForMapDisplay(1, "restroom", "")).toEqual(MAP_FACILITIES.filter(p => p.building === 1 && p.category === 112));
    expect(facilitiesForMapDisplay(2, "all", "").every(p => p.building === 2)).toBe(true);
  });
  it("shows restroom facilities only, including when searching instead of using the category button", () => {
    for (const p of MAP_FACILITIES) {
      expect(facilityMatches(p, "restroom", "")).toBe(p.category === 112);
      expect(facilityMatches(p, "all", "화장실")).toBe(p.category === 112);
    }
  });
  it("does not treat a shop near a restroom as a restroom", () => {
    const shop = { ...MAP_FACILITIES[0], category: 28, name: "기념품 매장", description: "화장실 옆" };
    expect(facilityMatches(shop, "all", "화장실")).toBe(false);
    expect(facilityMatches(shop, "restroom", "")).toBe(false);
  });
  it("combines query and category rather than accidentally resetting the category", () => {
    const restroom = MAP_FACILITIES.find(p => p.category === 112)!;
    expect(facilityMatches(restroom, "restroom", "없는시설123456")).toBe(false);
    expect(facilityMatches(restroom, "restroom", " ")).toBe(true);
    expect(MAP_FACILITIES.filter(p => facilityMatches(p, "pharmacy", "")).every(p => p.category === 104)).toBe(true);
  });
  it("restores every facility for the all category and empty query", () => {
    expect(MAP_FACILITIES.every(p => facilityMatches(p, "all", ""))).toBe(true);
  });
});
