import {
  FACILITY_OF_CODE,
  isArea,
  nearestFacilities,
  routeOptionsOf,
  routeToGate,
  type FacilityKind,
  type NearFacility,
  type Place,
  type Route,
} from "./airport";
import type { Journey } from "./journey";
import { config } from "./config";
import { kstTime, type PollState } from "./timing";

/** 안내 화면에 보여줄 항공편. 화면이 그대로 그릴 수 있게 시각은 글자로 만들어 보낸다. */
export interface FlightView {
  flightNo: string;
  operatingNo: string | null;
  destName: string;
  destCode: string;
  /** T1 / CONCOURSE / T2. 모르면 빈 글자. */
  area: string;
  gate: number | null;
  /** 탑승구가 바뀌었으면 바뀌기 전 번호. */
  prevGate: number | null;
  schedTime: string | null;
  /** 지연되었을 때만. 바뀐 출발 시각. */
  estTime: string | null;
  delayed: boolean;
  cancelled: boolean;
  /** 공공데이터의 상태 문구 그대로 (탑승중, 마감예정, 탑승마감, 지연 …). */
  status: string;
  /**
   * 탑승 마감까지의 상태.
   *  open: 남은 시간이 있다 (minutesToClose 분, 출발 시각에서 계산한 추정값)
   *  past: 추정 마감 시각이 지났다      closed: 공공데이터가 탑승 마감을 알렸다
   *  cancelled: 결항                    unknown: 운항 정보가 없다
   */
  close: "open" | "past" | "closed" | "cancelled" | "unknown";
  minutesToClose: number | null;
  boardingNow: boolean;
  /** 마감이 가깝거나 지났다. 항공편 판을 빨갛게 보여준다. */
  urgent: boolean;
}

export function toFlightView(j: Journey): FlightView {
  const close: FlightView["close"] = j.cancelled
    ? "cancelled"
    : j.boardingClosed
      ? "closed"
      : j.minutesToClose === null
        ? "unknown"
        : j.minutesToClose < 0
          ? "past"
          : "open";
  return {
    flightNo: j.flightNo,
    operatingNo: j.operatingNo,
    destName: j.destName,
    destCode: j.destCode,
    area: j.terminal,
    gate: j.gate,
    prevGate: j.prevGate,
    schedTime: j.schedAt ? kstTime(j.schedAt) : null,
    estTime: j.delayed && j.estAt ? kstTime(j.estAt) : null,
    delayed: j.delayed,
    cancelled: j.cancelled,
    status: j.status,
    close,
    minutesToClose: close === "open" ? j.minutesToClose : null,
    boardingNow: j.boardingNow,
    urgent: close === "past" || close === "closed" || (close === "open" && (j.minutesToClose ?? 0) <= config.urgentMin),
  };
}

export interface GuideFacility extends NearFacility {
  /** 여객이 등록할 때 고른 시설인가. 고른 것을 먼저 보여준다. */
  chosen: boolean;
}

/**
 * 탑승구까지의 길을 보여주지 못하는 까닭.
 *  no_place: 키오스크가 아니다 (여객 휴대전화)   landside: 보안검색 전 구역의 키오스크
 *  no_gate: 탑승구가 아직 정해지지 않았다        other_terminal: 걸어서 갈 수 없는 다른 터미널
 *  cancelled: 결항
 */
export type RouteNote = "no_place" | "landside" | "no_gate" | "other_terminal" | "cancelled";

/** 걸리는 시간과 남은 시간을 견준 결과. */
export type Pace = "ok" | "hurry" | "late";

export interface GuideDto {
  passNo: string;
  lang: "ko" | "en";
  choices: string[];
  flight: FlightView;
  place: { id: string; label: string; labelEn: string; level: number; landside: boolean } | null;
  gateRoute: Route | null;
  routeNote: RouteNote | null;
  pace: Pace | null;
  facilities: GuideFacility[];
  poll: PollState;
}

// 마감까지 이만큼(분)은 남아야 여유 있다고 본다.
const COMFORT_MIN = 15;

function paceOf(j: Journey, route: Route | null): Pace | null {
  if (!route || j.cancelled) return null;
  if (j.boardingClosed) return "late";
  if (j.minutesToClose === null) return null;
  const slack = j.minutesToClose - route.minutes;
  return slack < 0 ? "late" : slack < COMFORT_MIN ? "hurry" : "ok";
}

/** 여객이 고른 항목과 키오스크 위치로 안내 화면의 내용을 만든다. place 가 없으면 길과 시설은 비운다. */
export function buildGuide(j: Journey, passNo: string, place: Place | null, poll: PollState): GuideDto {
  const opts = routeOptionsOf(j.choices);

  let gateRoute: Route | null = null;
  let routeNote: RouteNote | null = null;
  if (!place) routeNote = "no_place";
  else if (j.cancelled) routeNote = "cancelled";
  else if (place.landside) routeNote = "landside";
  else if (j.gate === null || !isArea(j.terminal)) routeNote = "no_gate";
  else {
    gateRoute = routeToGate(place, j.terminal, j.gate, opts);
    if (!gateRoute) routeNote = "other_terminal";
  }

  const chosenKinds = new Set<FacilityKind>(
    j.choices.map((c) => FACILITY_OF_CODE[c]).filter((k): k is FacilityKind => k !== undefined),
  );
  if (j.choices.includes("mov_wheelchair_need")) chosenKinds.add("wheelchair");
  // 휠체어가 필요하다고 한 여객에게는 빌리는 곳을 맨 앞에 둔다. 그다음은 고른 시설, 나머지 순이다.
  const rank = (f: NearFacility) => (f.kind === "wheelchair" && chosenKinds.has("wheelchair") ? 0 : chosenKinds.has(f.kind) ? 1 : 2);
  const facilities = (place ? nearestFacilities(place, opts) : [])
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map(({ f }) => ({ ...f, chosen: chosenKinds.has(f.kind) }));

  return {
    passNo,
    lang: j.lang,
    choices: j.choices,
    flight: toFlightView(j),
    place: place
      ? { id: place.id, label: place.label, labelEn: place.labelEn, level: place.level, landside: place.landside }
      : null,
    gateRoute,
    routeNote,
    pace: paceOf(j, gateRoute),
    facilities,
    poll,
  };
}
