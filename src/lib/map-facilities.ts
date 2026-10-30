import records from "./airport-facilities.json";
import type { Place, Area } from "./airport";
export type MapFacility = (typeof records)[number];
export const MAP_FACILITIES: readonly MapFacility[] = records;
export const buildingArea = (building: number): Area => building === 2 ? "T2" : building === 3 ? "CONCOURSE" : "T1";
export const areaBuilding = (area?: string): 1 | 2 | 3 => area === "T2" ? 2 : area === "CONCOURSE" ? 3 : 1;
export const facilityId = (p: Pick<MapFacility, "id">) => `map-poi-${p.id}`;
export function mapFacilityOf(id: string | null | undefined) {
  return MAP_FACILITIES.find(p => facilityId(p) === id) ?? null;
}
export function mapFacilityPlace(id: string | null | undefined): Place | null {
  const p = mapFacilityOf(id);
  if (!p) return null;
  const area = buildingArea(p.building);
  const terminal = area === "T1" ? "제1터미널" : area === "T2" ? "제2터미널" : "탑승동";
  const detail = p.description && p.description !== "-" ? p.description : `${terminal} 3층`;
  return { id: facilityId(p), area, x: 0, level: 3, landside: p.area === "LAND",
    zoneId: area === "T2" ? "desk-t2" : area === "CONCOURSE" ? "desk-concourse" : "desk-t1",
    label: `${p.name} · ${detail}`, labelEn: `${p.name} · ${area} 3F · ${detail}` };
}
export function facilityAllowed(pickup: Place | null, p: MapFacility) {
  return !!pickup && pickup.level === 3 && pickup.area === buildingArea(p.building) && pickup.landside === (p.area === "LAND");
}
export function validMapDestination(pickup: Place | null, id: string) {
  const p = mapFacilityOf(id);
  return !!p && facilityAllowed(pickup, p);
}
/** Resolve an existing gate location only when its identity matches the map data. */
export function facilityForPlace(place: Place | null) {
  if (!place || place.level !== 3) return null;
  const exact = mapFacilityOf(place.id);
  if (exact) return exact;
  const gate = place.label.match(/(\d+)번 탑승구/);
  if (!gate) return null;
  return MAP_FACILITIES.find(p => p.building === areaBuilding(place.area) && p.name === `탑승구 ${gate[1]}` && (p.area === "LAND") === place.landside) ?? null;
}
