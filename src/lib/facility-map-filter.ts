import { MAP_FACILITIES, type MapFacility } from "./map-facilities";

export type FacilityFilter = "all" | "restroom" | "pharmacy" | "nursing" | "information";
export const FACILITY_FILTERS = [
  { id: "all", ko: "전체", en: "All" },
  { id: "restroom", ko: "화장실", en: "Restrooms" },
  { id: "pharmacy", ko: "약국", en: "Pharmacies" },
  { id: "nursing", ko: "수유실", en: "Nursing" },
  { id: "information", ko: "안내데스크", en: "Information" },
] as const;
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/** Map context is independent of which facilities a service accepts as pickup points. */
export function facilitiesForMapDisplay(building: number, filter: FacilityFilter, query: string) {
  return MAP_FACILITIES.filter(p => p.building === building && facilityMatches(p, filter, query));
}

/** Category IDs come from the canonical registry, never from a nearby place's description. */
export function facilityMatches(p: MapFacility, filter: FacilityFilter, query: string) {
  const category = { restroom: 112, pharmacy: 104, nursing: 19, information: 57 };
  if (filter !== "all" && p.category !== category[filter]) return false;
  const q = normalize(query);
  if (!q) return true;
  if (/^(화장실|restrooms?|toilets?)$/.test(q)) return p.category === 112;
  if (/^(약국|pharmacy|pharmacies)$/.test(q)) return p.category === 104;
  if (/^(수유실|유아휴게실|nursing)$/.test(q)) return p.category === 19;
  if (/^(안내데스크|information)$/.test(q)) return p.category === 57;
  return normalize(p.name + " " + p.description).includes(q);
}
