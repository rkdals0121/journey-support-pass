import { GATE_PICKUP_POINTS, type Place } from "./airport";
import { facilityForPlace, mapFacilityOf, mapFacilityPlace, MAP_FACILITIES, type MapFacility } from "./map-facilities";

const mapped = GATE_PICKUP_POINTS.flatMap(({place}) => {
  const facility = facilityForPlace(place);
  return facility ? [{place, facility}] : [];
});
/** Keep the selected pickup exact; never silently substitute a nearby desk or gate. */
export function mobilityPickupForFacility(facilityId: string | number) {
  const registered = mapped.find(p => String(p.facility.id) === String(facilityId))?.place;
  if (registered) return registered;
  const facility = mapFacilityOf(`map-poi-${facilityId}`);
  return facility ? mapFacilityPlace(`map-poi-${facility.id}`) : null;
}
export function mobilityPickupFacilities(): readonly MapFacility[] {
  return MAP_FACILITIES;
}
export function validMobilityPickupOverride(requested: Place | null) {
  return !!requested && requested.level > 0;
}
