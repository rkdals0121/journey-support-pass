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
import { kstDate } from "./flights/normalize";
import { boardingCloseAt, kstTime, type PollState } from "./timing";

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
  /**
   * 출발 시각이 바뀌었을 때만(늦어졌든 앞당겨졌든). 바뀐 출발 시각.
   * 남은 시간과 마감 시각은 바뀐 시각으로 세므로, 앞당겨진 편도 예정 시각만 보여 주면 화면의 시각과 남은 시간이 어긋난다.
   */
  estTime: string | null;
  /** 늦어졌을 때만 참. 앞당겨진 편은 estTime 만 있고 delayed 는 거짓이다. */
  delayed: boolean;
  /**
   * 실제로 떠나는 날이 이 내용을 만든 때의 오늘인지 내일인지. 등록 화면(toFlightDto)과 같은 기준이다.
   * 등록 화면이 "내일 14:30"으로 보여 준 편이 패스와 안내 화면에서 시각만 보여 오늘 편으로 읽히지 않게 한다.
   */
  day: "today" | "tomorrow";
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
  /**
   * 추정 탑승 마감 시각(ms). minutesToClose 와 같은 기준이며 open 일 때만 싣는다.
   * 휴대전화가 남겨 둔 화면을 인터넷 없이 열어도, 화면이 지금 시각으로 남은 시간을 다시 셀 수 있게 한다.
   */
  closeAtMs: number | null;
  boardingNow: boolean;
  /** 마감이 가깝거나 지났다. 항공편 판을 빨갛게 보여준다. */
  urgent: boolean;
  /** 여객이 등록한 출발 날짜(예정, 2026-12-24). */
  flightDate: string | null;
  /** 먼 날짜에 미리 등록해 운항 정보(시각, 탑승구)가 아직 들어오지 않았다. 출발 이틀 전쯤 들어온다. */
  awaiting: boolean;
}

/** now 는 여정(j)의 남은 시간을 계산한 그 시각을 넘긴다. 오늘·내일을 그 시각으로 정한다. 넘기지 않으면 지금 시각을 쓴다. */
export function toFlightView(j: Journey, now: Date = new Date()): FlightView {
  // 화면에는 분까지만 보이므로 분 단위 글자로 견준다. 초만 다른 시각을 바뀐 시각으로 보여 주지 않는다.
  const schedTime = j.schedAt ? kstTime(j.schedAt) : null;
  const estTime = j.estAt ? kstTime(j.estAt) : null;
  const departAt = j.estAt ?? j.schedAt;
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
    schedTime,
    // 항공편 판은 예정 시각에 줄을 긋고 그 옆에 바뀐 시각을 쓴다. 예정 시각을 모르면 바뀐 시각도 싣지 않는다.
    estTime: schedTime && estTime && estTime !== schedTime ? estTime : null,
    delayed: j.delayed,
    // 등록 화면(toFlightDto)처럼 실제로 떠나는 날로 정한다. 모레로 넘어간 편도 "내일"로 둔다.
    day: departAt && kstDate(departAt) > kstDate(now) ? "tomorrow" : "today",
    cancelled: j.cancelled,
    status: j.status,
    close,
    minutesToClose: close === "open" ? j.minutesToClose : null,
    closeAtMs: close === "open" && j.schedAt ? boardingCloseAt({ schedAt: j.schedAt, estAt: j.estAt, status: j.status }).getTime() : null,
    boardingNow: j.boardingNow,
    urgent: close === "past" || close === "closed" || (close === "open" && (j.minutesToClose ?? 0) <= config.urgentMin),
    flightDate: j.flightDate,
    awaiting: !j.schedAt && j.flightDate !== null && j.flightDate > kstDate(now),
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
  /** 운항 정보 기준 시각과 오래됐는지. poll.staleInMs 는 generatedAt 에서부터 센 남은 시간이다. */
  poll: PollState;
  /** 서버가 이 내용을 만든 시각(ms). 화면이 오래된 내용인지 알아보고 "HH:MM 기준"을 붙일 때 쓴다. */
  generatedAt: number;
  /** 마감까지 이 분 이내면 임박(config.urgentMin). 화면이 남은 시간을 다시 셀 때 urgent 도 같은 기준으로 다시 정한다. */
  urgentMin: number;
  /** 증빙이 확인되었는가. 확인되었으면 우대출구에서 탑승권만으로 확인받는다. */
  proofVerified: boolean;
  /** 체크인해서 전자토큰이 탑승권에 저장되었는가. */
  checkedIn: boolean;
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

/**
 * 여객이 고른 항목과 키오스크 위치로 안내 화면의 내용을 만든다. place 가 없으면 길과 시설은 비운다.
 * now 는 여정(j)의 남은 시간을 계산한 그 시각을 넘긴다. 넘기지 않으면 지금 시각을 쓴다.
 */
export function buildGuide(j: Journey, passNo: string, place: Place | null, poll: PollState, now: Date = new Date()): GuideDto {
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
    flight: toFlightView(j, now),
    place: place
      ? { id: place.id, label: place.label, labelEn: place.labelEn, level: place.level, landside: place.landside }
      : null,
    gateRoute,
    routeNote,
    pace: paceOf(j, gateRoute),
    facilities,
    poll,
    generatedAt: now.getTime(),
    urgentMin: config.urgentMin,
    proofVerified: j.proofVerified,
    checkedIn: j.checkedIn,
  };
}
