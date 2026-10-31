import { MAP_FACILITIES, type MapFacility } from "./map-facilities";

export const FACILITY_FILTERS = [
  { id: "all", ko: "전체", en: "All" },
  { id: "restroom", ko: "화장실", en: "Restrooms" },
  { id: "information", ko: "안내데스크", en: "Information" },
  { id: "pharmacy", ko: "약국", en: "Pharmacies" },
  { id: "nursing", ko: "수유실", en: "Nursing rooms" },
  { id: "children", ko: "어린이놀이시설", en: "Children’s play areas" },
  { id: "lounge", ko: "라운지", en: "Lounges" },
  { id: "support", ko: "안심여행센터", en: "Accessible travel centre" },
  { id: "aed", ko: "자동심장충격기", en: "AED" },
  { id: "priority", ko: "우대출구", en: "Priority exits" },
  { id: "gate", ko: "탑승구", en: "Gates" },
  { id: "departure", ko: "출국장", en: "Departure halls" },
  { id: "entrance", ko: "공항 입구", en: "Terminal entrances" },
  { id: "checkin", ko: "체크인카운터", en: "Check-in counters" },
  { id: "food", ko: "식당", en: "Restaurants" },
  { id: "cafe", ko: "카페·간식", en: "Cafés & snacks" },
  { id: "convenience", ko: "편의점", en: "Convenience stores" },
  { id: "atm", ko: "현금인출기", en: "ATMs" },
  { id: "exchange", ko: "환전소", en: "Currency exchange" },
  { id: "bus", ko: "버스·셔틀", en: "Bus & shuttle stops" },
] as const;
export type FacilityFilter = (typeof FACILITY_FILTERS)[number]["id"];
export const PRIMARY_FACILITY_FILTERS: readonly FacilityFilter[] = ["all", "restroom", "information"];
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/** Use the facility's own category/name; nearby landmarks in descriptions are not categories. */
export function facilityInCategory(p: MapFacility, filter: FacilityFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "restroom": return p.category === 112;
    case "information": return p.category === 57;
    case "pharmacy": return p.category === 104;
    case "nursing": return p.category === 19 && /수유|유아휴게/.test(p.name);
    case "children": return p.category === 19 && /어린이|놀이/.test(p.name);
    case "lounge": return p.category === 108;
    case "support": return p.category === 57 && /안심여행센터/.test(p.name);
    case "aed": return p.category === 111;
    case "priority": return p.category === 100101110 && /우대/.test(p.name);
    case "gate": return p.category === 10010216;
    case "departure": return p.category === 10010217 && /^출국장/.test(p.name);
    case "entrance": return p.category === 10010217 && /입구/.test(p.name);
    case "checkin": return p.category === 10010215;
    case "food": return p.category === 10000211;
    case "cafe": return p.category === 10000212;
    case "convenience": return p.category === 30 && /^(CU|GS25)\s*$/i.test(p.name);
    case "atm": return p.category === 10000915;
    case "exchange": return p.category === 85;
    case "bus": return p.category === 76 || p.category === 82;
  }
}
export function facilitiesForMapDisplay(building: number, filter: FacilityFilter, query: string) {
  return MAP_FACILITIES.filter(p => p.building === building && facilityMatches(p, filter, query));
}
export function facilityMatches(p: MapFacility, filter: FacilityFilter, query: string) {
  if (!facilityInCategory(p, filter)) return false;
  const q = normalize(query);
  if (!q) return true;
  const exactCategory = FACILITY_FILTERS.find(item => item.id !== "all" && [normalize(item.ko), normalize(item.en)].includes(q));
  if (exactCategory) return facilityInCategory(p, exactCategory.id);
  const aliases: Record<string, FacilityFilter> = {restroom:"restroom",toilet:"restroom",toilets:"restroom",pharmacy:"pharmacy",nursing:"nursing",유아휴게실:"nursing",aed:"aed",안내소:"information",쉼터:"lounge",식당가:"food",atm:"atm"};
  if (aliases[q]) return facilityInCategory(p, aliases[q]);
  return normalize(p.name + " " + p.description).includes(q);
}
