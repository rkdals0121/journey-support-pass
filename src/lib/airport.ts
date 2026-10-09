// 공항 안의 키오스크 위치, 교통약자 시설, 길 안내 계산.
//
// !! 이 파일의 위치·거리 값은 모두 시연용 모의 자료다 !!
// 터미널을 한 줄로 늘어선 탑승구로 단순하게 보고, 탑승구 번호로 위치를 정했다.
// 실제 운영에는 기관의 실내 지도와 시설 목록으로 바꿔야 한다 (기업탐방에서 받을 자료).
// 계산하는 방법(가까운 시설 고르기, 계단 없는 길, 걷는 속도)은 자료가 바뀌어도 그대로 쓴다.
//
// 이 파일은 브라우저에서도 읽는다. 서버 전용 코드를 가져오지 말 것.

export type Area = "T1" | "CONCOURSE" | "T2";
export type FacilityKind = "restroom" | "nursing" | "rest" | "lounge" | "calm" | "wheelchair";

/** 등록할 때 고르는 "찾는 시설" 항목과 시설 종류의 짝. */
export const FACILITY_OF_CODE: Record<string, FacilityKind> = {
  fac_restroom: "restroom",
  fac_nursing: "nursing",
  fac_rest: "rest",
  fac_lounge: "lounge",
  fac_calm: "calm",
};

export const FACILITY_KINDS: FacilityKind[] = ["restroom", "nursing", "rest", "lounge", "calm", "wheelchair"];

/** 탑승구가 있는 층. */
export const GATE_LEVEL = 3;
/** 셔틀트레인 승강장이 있는 층 (지하 1층). */
const TRAIN_LEVEL = -1;

interface AreaSpec {
  gates: [number, number];
  /** 가운데에 해당하는 탑승구 번호 (소수일 수 있다). 여기가 x = 0 이다. */
  center: number;
  /** 이웃한 탑승구 사이의 거리(m). */
  spacing: number;
  /** 엘리베이터와 에스컬레이터가 함께 있는 곳의 위치(m). */
  cores: number[];
}

const AREAS: Record<Area, AreaSpec> = {
  T1: { gates: [1, 50], center: 25.5, spacing: 22, cores: [-330, 0, 330] },
  CONCOURSE: { gates: [101, 132], center: 116.5, spacing: 30, cores: [-240, 0, 240] },
  T2: { gates: [208, 291], center: 249.5, spacing: 14, cores: [-300, 0, 300] },
};

export function isArea(v: string): v is Area {
  return v === "T1" || v === "CONCOURSE" || v === "T2";
}

/** 탑승구의 위치(m). 범위를 벗어난 번호는 가장 가까운 끝으로 본다. */
export function gateX(area: Area, gate: number): number {
  const a = AREAS[area];
  const g = Math.min(Math.max(gate, a.gates[0]), a.gates[1]);
  return Math.round((g - a.center) * a.spacing);
}

export function nearestGate(area: Area, x: number): number {
  const a = AREAS[area];
  const g = Math.round(x / a.spacing + a.center);
  return Math.min(Math.max(g, a.gates[0]), a.gates[1]);
}

export interface Spot {
  area: Area;
  x: number;
  level: number;
}

export interface Facility extends Spot {
  kind: FacilityKind;
  /** 가장 가까운 탑승구. 화면에 "124번 탑승구 옆"으로 보여준다. */
  nearGate: number;
}

function fac(area: Area, kind: FacilityKind, gates: number[], level = GATE_LEVEL): Facility[] {
  return gates.map((g) => ({ area, kind, nearGate: g, x: gateX(area, g), level }));
}

export const FACILITIES: Facility[] = [
  ...fac("T1", "restroom", [8, 17, 25, 33, 42]),
  ...fac("T1", "nursing", [12, 28, 40]),
  ...fac("T1", "rest", [6, 15, 22, 30, 37, 45]),
  ...fac("T1", "lounge", [26], 4),
  ...fac("T1", "calm", [24]),
  ...fac("T1", "wheelchair", [11, 25, 39]),

  ...fac("CONCOURSE", "restroom", [104, 110, 116, 123, 129]),
  ...fac("CONCOURSE", "nursing", [112, 121]),
  ...fac("CONCOURSE", "rest", [103, 108, 114, 119, 125, 130]),
  ...fac("CONCOURSE", "lounge", [117], 4),
  ...fac("CONCOURSE", "calm", [115]),
  ...fac("CONCOURSE", "wheelchair", [106, 116, 127]),

  ...fac("T2", "restroom", [214, 228, 242, 250, 258, 272, 286]),
  ...fac("T2", "nursing", [232, 251, 268]),
  ...fac("T2", "rest", [212, 224, 236, 246, 254, 264, 276, 288]),
  ...fac("T2", "lounge", [249], 4),
  ...fac("T2", "calm", [252]),
  ...fac("T2", "wheelchair", [222, 250, 277]),
];

/** 키오스크가 놓인 자리. */
export interface Place extends Spot {
  id: string;
  label: string;
  labelEn: string;
  /** 보안검색 전 구역. 여기서는 탑승구까지의 길을 안내하지 않는다. */
  landside: boolean;
  /** 이 자리에서 누른 「직원 부르기」를 받는 직원 구역. */
  zoneId: string;
}

const place = (
  id: string,
  area: Area,
  near: number,
  label: string,
  labelEn: string,
  zoneId: string,
  over: Partial<Place> = {},
): Place => ({ id, area, x: gateX(area, near), level: GATE_LEVEL, label, labelEn, landside: false, zoneId, ...over });

export const PLACES: Place[] = [
  place("t1-care", "T1", 25, "제1여객터미널 3층 장애인 안심여행센터", "Terminal 1, 3F Assistance Centre", "desk-t1", {
    landside: true,
  }),
  place("t1-info", "T1", 25, "제1여객터미널 3층 안내데스크", "Terminal 1, 3F Information Desk", "desk-t1", {
    landside: true,
  }),
  place("t2-help", "T2", 250, "제2여객터미널 3층 헬프데스크", "Terminal 2, 3F Help Desk", "desk-t1", { landside: true }),

  place("t1-west", "T1", 10, "제1여객터미널 면세구역 서편 (10번 탑승구 앞)", "Terminal 1 airside, near Gate 10", "t1-w"),
  place("t1-center", "T1", 25, "제1여객터미널 면세구역 중앙 (25번 탑승구 앞)", "Terminal 1 airside, near Gate 25", "t1-c"),
  place("t1-east", "T1", 41, "제1여객터미널 면세구역 동편 (41번 탑승구 앞)", "Terminal 1 airside, near Gate 41", "t1-e"),

  place("cc-train", "CONCOURSE", 116, "탑승동 지하 1층 셔틀트레인 도착층", "Concourse B1, shuttle train arrivals", "cc-center", {
    x: 0,
    level: TRAIN_LEVEL,
  }),
  place("cc-center", "CONCOURSE", 116, "탑승동 3층 중앙 (116번 탑승구 앞)", "Concourse 3F, near Gate 116", "cc-center", { x: 0 }),
  place("cc-103", "CONCOURSE", 103, "탑승동 3층 103번 탑승구 앞", "Concourse 3F, near Gate 103", "cc-end"),
  place("cc-108", "CONCOURSE", 108, "탑승동 3층 108번 탑승구 앞", "Concourse 3F, near Gate 108", "cc-mid"),
  place("cc-125", "CONCOURSE", 125, "탑승동 3층 125번 탑승구 앞", "Concourse 3F, near Gate 125", "cc-mid"),
  place("cc-130", "CONCOURSE", 130, "탑승동 3층 130번 탑승구 앞", "Concourse 3F, near Gate 130", "cc-end"),

  place("t2-212", "T2", 212, "제2여객터미널 면세구역 서편 끝 (212번 탑승구 앞)", "Terminal 2 airside, near Gate 212", "t2-wend"),
  place("t2-west", "T2", 220, "제2여객터미널 면세구역 서편 (220번 탑승구 앞)", "Terminal 2 airside, near Gate 220", "t2-wam"),
  place("t2-center", "T2", 250, "제2여객터미널 면세구역 중앙 (250번 탑승구 앞)", "Terminal 2 airside, near Gate 250", "t2-mid"),
  place("t2-east", "T2", 278, "제2여객터미널 면세구역 동편 (278번 탑승구 앞)", "Terminal 2 airside, near Gate 278", "t2-eam"),
  place("t2-286", "T2", 286, "제2여객터미널 면세구역 동편 끝 (286번 탑승구 앞)", "Terminal 2 airside, near Gate 286", "t2-eend"),
];

export function placeOf(id: string | null | undefined): Place | null {
  return PLACES.find((p) => p.id === id) ?? null;
}

// ── 길 계산 ──

export type StepKind = "walk" | "elevator" | "escalator" | "shuttle";
/** 걷는 구간이 끝나는 곳. */
export type WalkTo = "gate" | "facility" | "lift" | "train";

export interface Along {
  kind: FacilityKind;
  nearGate: number;
  /** 이 구간을 걷기 시작한 곳에서부터의 거리(m). */
  meters: number;
}

export interface Step {
  kind: StepKind;
  meters: number;
  minutes: number;
  /** 걷는 구간: 표지판에서 따라갈 탑승구 번호. */
  towardGate: number | null;
  /** 걷는 구간: 탑승구 번호가 커지는 쪽(1)인지 작아지는 쪽(-1)인지. */
  dir: -1 | 0 | 1;
  walkTo: WalkTo | null;
  fromLevel: number;
  toLevel: number;
  /** 걷는 구간에서 지나가는 시설. */
  along: Along[];
}

export interface Route {
  steps: Step[];
  meters: number;
  minutes: number;
  /** 층을 옮기는 횟수. 0 이면 처음부터 끝까지 같은 층이다. */
  levelChanges: number;
  /** 계단과 에스컬레이터가 없는 길인가. */
  stepFree: boolean;
}

export interface RouteOptions {
  /** 층을 옮길 때 엘리베이터만 쓴다. */
  stepFree: boolean;
  /** 천천히 걷는 속도로 시간을 잰다. */
  slow: boolean;
  /** 가는 길에 있으면 알려 줄 시설 종류. */
  alongKinds: FacilityKind[];
}

// 걷는 속도(m/분). 보통 걸음과, 휠체어·쉬어 가야 하는 여객의 걸음.
const PACE = 70;
const PACE_SLOW = 45;
// 층을 옮기는 데 걸리는 시간(분). 엘리베이터는 기다리는 시간을 넣었다.
const ELEVATOR_MIN = 3;
const ESCALATOR_MIN = 1;
// 셔틀트레인: 기다리는 시간과 타는 시간.
const TRAIN_MIN = 7;
// 이보다 짧은 걸음은 따로 적지 않는다.
const SKIP_WALK_M = 15;
const ALONG_MAX = 3;

function walk(area: Area, from: number, to: number, level: number, walkTo: WalkTo, opts: RouteOptions, endGate?: number): Step | null {
  const meters = Math.abs(to - from);
  if (meters < SKIP_WALK_M) return null;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const along = FACILITIES.filter(
    (f) => f.area === area && f.level === level && opts.alongKinds.includes(f.kind) && f.x > lo + 5 && f.x < hi - 5,
  )
    .map((f) => ({ kind: f.kind, nearGate: f.nearGate, meters: Math.abs(f.x - from) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, ALONG_MAX);
  return {
    kind: "walk",
    meters,
    minutes: Math.max(1, Math.ceil(meters / (opts.slow ? PACE_SLOW : PACE))),
    towardGate: endGate ?? nearestGate(area, to),
    dir: to > from ? 1 : -1,
    walkTo,
    fromLevel: level,
    toLevel: level,
    along,
  };
}

function lift(fromLevel: number, toLevel: number, opts: RouteOptions): Step {
  const kind: StepKind = opts.stepFree ? "elevator" : "escalator";
  return {
    kind,
    meters: 0,
    minutes: kind === "elevator" ? ELEVATOR_MIN : ESCALATOR_MIN,
    towardGate: null,
    dir: 0,
    walkTo: null,
    fromLevel,
    toLevel,
    along: [],
  };
}

/** 한 구역 안에서의 길. */
function within(from: Spot, to: Spot, walkTo: WalkTo, opts: RouteOptions, endGate?: number): Step[] {
  const area = from.area;
  if (from.level === to.level) {
    return [walk(area, from.x, to.x, from.level, walkTo, opts, endGate)].filter((s): s is Step => s !== null);
  }
  // 걷는 거리가 가장 짧아지는 엘리베이터(에스컬레이터)를 고른다.
  const core = AREAS[area].cores.reduce((best, c) =>
    Math.abs(from.x - c) + Math.abs(c - to.x) < Math.abs(from.x - best) + Math.abs(best - to.x) ? c : best,
  );
  return [
    walk(area, from.x, core, from.level, "lift", opts),
    lift(from.level, to.level, opts),
    walk(area, core, to.x, to.level, walkTo, opts, endGate),
  ].filter((s): s is Step => s !== null);
}

/**
 * from 에서 to 까지의 길. 이어지지 않는 곳이면 null.
 * 제1여객터미널에서 탑승동으로는 셔틀트레인으로 간다. 그 반대와 제2여객터미널 사이는 여객이 걸어서 갈 수 없다.
 */
export function routeBetween(from: Spot, to: Spot, walkTo: "gate" | "facility", opts: RouteOptions, endGate?: number): Route | null {
  let steps: Step[];
  if (from.area === to.area) {
    steps = within(from, to, walkTo, opts, endGate);
  } else if (from.area === "T1" && to.area === "CONCOURSE") {
    const platform = (area: Area): Spot => ({ area, x: 0, level: TRAIN_LEVEL });
    steps = [
      ...within(from, platform("T1"), "train", opts),
      { kind: "shuttle", meters: 0, minutes: TRAIN_MIN, towardGate: null, dir: 0, walkTo: null, fromLevel: TRAIN_LEVEL, toLevel: TRAIN_LEVEL, along: [] },
      ...within(platform("CONCOURSE"), to, walkTo, opts, endGate),
    ];
  } else {
    return null;
  }
  const levelChanges = steps.filter((s) => s.kind === "elevator" || s.kind === "escalator").length;
  return {
    steps,
    meters: steps.reduce((n, s) => n + s.meters, 0),
    minutes: steps.reduce((n, s) => n + s.minutes, 0),
    levelChanges,
    stepFree: opts.stepFree || levelChanges === 0,
  };
}

export function routeToGate(from: Place, area: Area, gate: number, opts: RouteOptions): Route | null {
  if (from.landside) return null;
  return routeBetween(from, { area, x: gateX(area, gate), level: GATE_LEVEL }, "gate", opts, gate);
}

export interface NearFacility {
  kind: FacilityKind;
  nearGate: number;
  level: number;
  route: Route;
}

/** 이 자리에서 종류마다 가장 빨리 닿는 시설 하나씩. */
export function nearestFacilities(from: Place, opts: RouteOptions): NearFacility[] {
  if (from.landside) return [];
  const found: NearFacility[] = [];
  for (const kind of FACILITY_KINDS) {
    let best: NearFacility | null = null;
    for (const f of FACILITIES) {
      if (f.area !== from.area || f.kind !== kind) continue;
      // 가는 길에 있는 시설을 알려 줄 때 목적지와 같은 종류는 뺀다. "쉴 곳 가는 길에 쉴 곳"은 헷갈린다.
      const route = routeBetween(from, f, "facility", { ...opts, alongKinds: opts.alongKinds.filter((k) => k !== kind) }, f.nearGate);
      if (!route) continue;
      if (!best || route.minutes < best.route.minutes || (route.minutes === best.route.minutes && route.meters < best.route.meters)) {
        best = { kind, nearGate: f.nearGate, level: f.level, route };
      }
    }
    if (best) found.push(best);
  }
  return found;
}

/** 여객이 고른 항목에서 길 계산 조건을 만든다. */
export function routeOptionsOf(choices: string[]): RouteOptions {
  const has = (c: string) => choices.includes(c);
  const alongKinds: FacilityKind[] = [];
  if (has("mov_need_rest") || has("mov_no_standing") || has("fac_rest")) alongKinds.push("rest");
  if (has("fac_restroom") || has("mov_wheelchair_own")) alongKinds.push("restroom");
  if (has("fac_nursing")) alongKinds.push("nursing");
  return {
    stepFree: has("mov_wheelchair_own") || has("mov_wheelchair_need") || has("mov_no_stairs"),
    slow: has("mov_wheelchair_own") || has("mov_wheelchair_need") || has("mov_need_rest") || has("mov_no_standing") || has("mov_no_stairs"),
    alongKinds,
  };
}
