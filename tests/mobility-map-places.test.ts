import { describe, expect, it } from "vitest";
import { placeOf } from "@/lib/airport";
import { facilityForPlace, MAP_FACILITIES, facilityId } from "@/lib/map-facilities";
import { requestPlaceOf } from "@/lib/service-locations";
import { mobilityPickupForFacility, mobilityPickupFacilities, validMobilityPickupOverride } from "@/lib/mobility-map-places";
describe("mobility map meeting points", () => {
  it("keeps an exact registered gate ID rather than substituting a nearby hub", () => {
    const poi = facilityForPlace(placeOf("gate-132"))!;
    expect(mobilityPickupForFacility(poi.id)?.id).toBe("gate-132");
    expect(mobilityPickupForFacility("made-up")).toBeNull();
  });
  it("allows every map facility as an exact pickup, without a gate or device-terminal restriction", () => {
    expect(mobilityPickupFacilities()).toEqual(MAP_FACILITIES);
    for (const p of MAP_FACILITIES) {
      const pickup = mobilityPickupForFacility(p.id)!;
      expect(pickup).not.toBeNull();
      expect(facilityForPlace(pickup)?.id).toBe(p.id);
      expect(validMobilityPickupOverride(pickup)).toBe(true);
    }
    const restroom=MAP_FACILITIES.find(p=>p.category===112)!;
    expect(mobilityPickupForFacility(restroom.id)?.id).toBe(facilityId(restroom));
    expect(validMobilityPickupOverride(placeOf("t1-info"))).toBe(true);
    expect(validMobilityPickupOverride(placeOf("t2-center"))).toBe(true);
    expect(validMobilityPickupOverride(requestPlaceOf("no-meeting"))).toBe(false);
    expect(validMobilityPickupOverride(null)).toBe(false);
  });
});
