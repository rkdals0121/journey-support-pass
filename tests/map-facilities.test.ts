import { describe, expect, it } from "vitest";
import { MAP_FACILITIES, facilityId, mapFacilityOf, validMapDestination, facilityForPlace } from "@/lib/map-facilities";
import { placeOf } from "@/lib/airport";
import { destinationPlaceOf, requestPlaceOf } from "@/lib/service-locations";
describe("map facility destinations", () => {
  const poi = MAP_FACILITIES.find(p => p.building === 3 && p.area === "AIR")!;
  it("uses canonical IDs and displays a consistent destination after saving", () => {
    expect(mapFacilityOf(facilityId(poi))).toEqual(poi);
    expect(destinationPlaceOf(facilityId(poi))?.label).toContain(poi.name);
    expect(mapFacilityOf("map-poi-not-real")).toBeNull();
    expect(requestPlaceOf(facilityId(poi))?.id).toBe(facilityId(poi));
    expect(facilityForPlace(requestPlaceOf(facilityId(poi)))).toEqual(poi);
    expect(requestPlaceOf("map-poi-not-real")).toBeNull();
  });
  it("rejects destinations across terminals and security boundaries and unsupported floors", () => {
    const from = placeOf("cc-center")!;
    expect(validMapDestination(from, facilityId(poi))).toBe(true);
    expect(validMapDestination({...from,area:"T2"}, facilityId(poi))).toBe(false);
    expect(validMapDestination({...from,landside:true}, facilityId(poi))).toBe(false);
    expect(validMapDestination({...from,level:1}, facilityId(poi))).toBe(false);
    expect(validMapDestination(null, facilityId(poi))).toBe(false);
  });
  it("matches an existing gate by terminal and number, never by guessed coordinates", () => {
    const p = facilityForPlace(placeOf("cc-130"));
    expect(p?.name).toBe("탑승구 130");
    expect(p?.building).toBe(3);
    expect(facilityForPlace({...placeOf("cc-130")!, level: 1})).toBeNull();
  });
});
