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
  return id === NO_MEETING_PLACE ? remoteRequest : placeOf(id);
}
