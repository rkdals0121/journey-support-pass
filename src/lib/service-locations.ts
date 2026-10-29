import { mapFacilityPlace } from "./map-facilities";
import { NO_MEETING_PLACE, placeOf, type Place } from "./airport";
/** Internal work-queue marker, deliberately excluded from airport maps and kiosk installation. */
const remoteRequest: Place = {
  id: NO_MEETING_PLACE,
  area: "T1",
  x: 0,
  level: 0,
  label: "만나지 않음 · 온라인 요청",
  labelEn: "No meeting · online request",
  landside: true,
  zoneId: "desk-t1",
};
export function requestPlaceOf(id: string | null | undefined) {
  if (id && /^report-(T1|T2|CONCOURSE)$/.test(id)) {
    const area = id.slice(7) as Place["area"];
    return {
      ...remoteRequest,
      id,
      area,
      label: "신고 상세 위치",
      labelEn: "Reported location details",
    };
  }
  return id === NO_MEETING_PLACE ? remoteRequest : placeOf(id);
}
export function reportLocationLabel(
  fields: Record<string, string> | undefined,
  en = false,
) {
  if (!fields?.reportArea || !fields.reportLevel || !fields.reportLocation)
    return "";
  const area =
    fields.reportArea === "CONCOURSE"
      ? en
        ? "Concourse"
        : "탑승동"
      : fields.reportArea === "T2"
        ? en
          ? "Terminal 2"
          : "제2터미널"
        : en
          ? "Terminal 1"
          : "제1터미널";
  const floor =
    fields.reportLevel === "B1"
      ? en
        ? "B1"
        : "지하 1층"
      : fields.reportLevel + (en ? "F" : "층");
  return `${area} ${floor} · ${fields.reportLocation}`;
}

/** Resolve destination labels without registering map facilities as pickup hubs. */
export function destinationPlaceOf(id: string | null | undefined) {
  return placeOf(id) ?? mapFacilityPlace(id);
}
