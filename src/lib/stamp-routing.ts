import type { Area } from "./airport";
import { gateArea, isGate, walkM } from "./gates";
import { CHECKPOINTS, GOAL } from "./stamp-book";

// 스탬프북은 에어사이드(출국심사 뒤 면세구역~탑승구)에서만 한다. 자리는 실제 탑승구, 거리는 건물을 따라 걷는 거리(gates.ts)다.
// 놀이형: 탑승구가 있는 구역 이곳저곳에 흩어진 6곳. 순서도 섞어 돌아다니게 하고, 마지막 도장만 탑승구 근처로 둔다.
// 경로형: 지금 있는 곳에서 탑승구까지 가는 길 위 체크포인트 5~6곳. 마지막은 탑승구에서 가장 가까운 곳.
// 터미널을 바꾸거나(제1↔제2) 탑승동에서 제1여객터미널로 되돌아가는 길은 만들지 않는다.

export interface StartPoint {
  id: string;
  area: Area;
  /** 가장 가까운 실제 탑승구 번호 */
  near: number;
  label: string;
}

/**
 * 출국심사를 마치고 면세구역으로 나오는 곳: 제1여객터미널 출국장 1~5, 제2여객터미널 출국장 1~2.
 * 탑승동에는 출국심사대가 없다(제1여객터미널에서 심사를 마치고 셔틀트레인으로 간다).
 * 가까운 탑승구(near)는 인천국제공항 공식 지도의 출국심사 위치에서 가장 가까운 탑승구다(terminal-map.ts EXIT_XY).
 */
export const EXITS: StartPoint[] = [
  ...[5, 25, 26, 29, 42].map((near, k) => ({
    id: `t1-${k + 1}`,
    area: "T1" as Area,
    near,
    label: `제1여객터미널 ${k + 1}번 출국장 출국심사 출구`,
  })),
  { id: "t2-1", area: "T2", near: 249, label: "제2여객터미널 1번 출국장 출국심사 출구" },
  { id: "t2-2", area: "T2", near: 252, label: "제2여객터미널 2번 출국장 출국심사 출구" },
];

/** 지금 있는 곳: 출국심사 출구이거나, 근처 체크포인트(번호). */
export function startOf(id?: string): StartPoint | undefined {
  const exit = EXITS.find((e) => e.id === id);
  if (exit) return exit;
  const c = CHECKPOINTS.find((p) => p.code === id);
  return c && { id: c.code, area: c.area, near: c.near, label: c.place };
}

/** 탑승구 번호가 비었거나 인천공항에 없는 번호면 안내 문구, 맞으면 "". */
export function gateProblem(gate: string): string {
  if (!gate.trim()) return "탑승구 번호를 입력해 주세요.";
  return isGate(Number(gate)) ? "" : `${gate}번은 인천공항에 없는 탑승구예요. 탑승권을 다시 확인해 주세요.`;
}

// 자리는 모두 가장 가까운 탑승구 번호로 나타낸다.
const cpAt = (i: number) => CHECKPOINTS[i].near;
const trainAt = (area: Area) => cpAt(CHECKPOINTS.findIndex((c) => c.train && c.area === area));

// ponytail: 걷는 속도·도장 하나에 쓰는 시간·셔틀트레인 시간은 아이 동반 가족 기준 추정값. 현장 측정 뒤 고친다.
const WALK_M_PER_MIN = 50;
const STAMP_MIN = 3;
const TRAIN_MIN = 10;
const walk = (a: number, b: number) => walkM(a, b) / WALK_M_PER_MIN;

export interface StampPlan {
  indices: number[];
  minutes: number;
  reason: string;
}
const blocked = (reason: string): StampPlan => ({ indices: [], minutes: 0, reason });

/** 출발점에서 차례로 들러 마지막 체크포인트까지 걸리는 시간(분). 구역이 바뀌면 셔틀트레인을 탄다. */
export function minutesOf(start: StartPoint, indices: number[]): number {
  let area = start.area;
  let at = start.near;
  let m = 0;
  for (const i of indices) {
    const c = CHECKPOINTS[i];
    if (c.area !== area) {
      m += walk(at, trainAt(area)) + TRAIN_MIN;
      area = c.area;
      at = trainAt(area);
    }
    m += walk(at, cpAt(i)) + STAMP_MIN;
    at = cpAt(i);
  }
  return Math.ceil(m);
}

/** 탑승 시각이 가까우면 도장 대신 탑승구로 보낸다. 여유(spare)는 분. */
function boardingBlock(boardingAt: string | undefined, minutes: number, spare: number, now: number): string {
  if (!boardingAt) return "";
  const at = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(boardingAt) ? boardingAt + "+09:00" : boardingAt).getTime();
  if (!Number.isFinite(at)) return "탑승 시각을 확인해 주세요.";
  return at - now < (minutes + spare) * 60000 ? "탑승 시각이 가까워요. 도장 수집 대신 탑승구로 바로 이동해 주세요." : "";
}

/** list 에서 k 개를 고르게(처음·끝 쪽에 몰리지 않게) 뽑는다. 순서는 그대로. */
function evenly<T>(list: T[], k: number): T[] {
  if (k <= 0) return [];
  if (k >= list.length) return list;
  return Array.from({ length: k }, (_, j) => list[Math.floor(((j + 0.5) * list.length) / k)]);
}

function permutations<T>(list: T[]): T[][] {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

/** 길 위로 칠 여유: 출발점→끝점 걷는 거리보다 이만큼(배율·m) 더 돌아가는 곳까지. */
const DETOUR_RATIO = 1.15;
const DETOUR_M = 60;

/** 경로형: 지금 있는 곳 → 탑승구. 길 위 체크포인트를 가는 순서대로 5~6곳. */
export function stampRoute(gate: string, origin?: string, boardingAt = "", now = Date.now()): StampPlan {
  const bad = gateProblem(gate);
  if (bad) return blocked(bad);
  const start = startOf(origin);
  if (!start) return blocked("지금 있는 곳을 골라 주세요.");
  const ga = gateArea(Number(gate));
  if ((start.area === "T2") !== (ga === "T2"))
    return blocked("지금 있는 터미널과 탑승구의 터미널이 달라요. 탑승권의 터미널을 확인해 주세요.");
  if (start.area === "CONCOURSE" && ga === "T1") return blocked("탑승동에서는 제1여객터미널로 돌아갈 수 없어요.");

  const gp = Number(gate);
  // 같은 구역이면 한 구간, 제1여객터미널 → 탑승동이면 두 구간(승강장 에스컬레이터까지 / 도착 에스컬레이터부터).
  const legs =
    start.area === ga
      ? [{ area: ga, from: start.near, to: gp }]
      : [
          { area: "T1" as Area, from: start.near, to: trainAt("T1") },
          { area: "CONCOURSE" as Area, from: trainAt("CONCOURSE"), to: gp },
        ];
  const legOf = (i: number) => legs.findIndex((l) => l.area === CHECKPOINTS[i].area);
  // 길 위 순서: 앞 구간부터, 같은 구간에서는 구간 끝점(승강장 에스컬레이터·탑승구)에서 먼 곳부터.
  const progress = (i: number) => legOf(i) * 1e6 - walkM(cpAt(i), legs[legOf(i)].to);
  // 길 위: 출발점에서 끝점(승강장 에스컬레이터·탑승구)보다 멀지 않고, 크게 돌아가지 않는 곳.
  // 끝점 너머는 빼서 지나쳤다가 되돌아오지 않게 한다.
  const inLeg = (i: number) => {
    const k = legOf(i);
    if (k < 0) return false;
    const { from, to } = legs[k];
    const len = walkM(from, to);
    return walkM(from, cpAt(i)) <= len && walkM(from, cpAt(i)) + walkM(cpAt(i), to) <= len * DETOUR_RATIO + DETOUR_M;
  };

  // 마지막: 탑승구에서 가장 가까운 체크포인트.
  const inGateArea = CHECKPOINTS.flatMap((c, i) => (c.area === ga ? [i] : []));
  const final = inGateArea.reduce((a, b) => (walkM(cpAt(b), gp) < walkM(cpAt(a), gp) ? b : a));
  const must = new Set<number>([final]);
  // 탑승동으로 가면 두 셔틀트레인 에스컬레이터는 꼭 들른다. 지금 체크포인트 앞이면 거기서 시작한다.
  if (legs.length === 2) CHECKPOINTS.forEach((c, i) => c.train && must.add(i));
  const here = CHECKPOINTS.findIndex((c) => c.code === start.id);
  if (here >= 0) must.add(here);

  const along = CHECKPOINTS.flatMap((_, i) => (inLeg(i) && !must.has(i) ? [i] : [])).sort((a, b) => progress(a) - progress(b));
  let picked = [...must, ...evenly(along, GOAL - must.size)];
  // 길이 짧아 모자라면 탑승구 근처를 조금 더 둘러본다.
  if (picked.length < GOAL) {
    const extra = inGateArea.filter((i) => !picked.includes(i)).sort((a, b) => walkM(cpAt(a), gp) - walkM(cpAt(b), gp));
    picked = [...picked, ...extra.slice(0, GOAL - picked.length)];
  }
  // 고른 곳을 도는 순서는 가장 빨리 끝나는 순서(많아야 5곳이라 모두 따져 본다).
  const orders = permutations(picked.filter((i) => i !== final)).map((o) => [...o, final]);
  const indices = orders.reduce((a, b) => (minutesOf(start, b) < minutesOf(start, a) ? b : a));
  const minutes = minutesOf(start, indices);
  const late = boardingBlock(boardingAt, minutes, 15, now);
  return late ? blocked(late) : { indices, minutes, reason: "" };
}

/** 탑승구 구역의 체크포인트, 탑승구에서 가까운 순. */
function byGate(gate: string): number[] {
  const g = Number(gate);
  return CHECKPOINTS.flatMap((c, i) => (c.area === gateArea(g) ? [i] : [])).sort(
    (a, b) => walkM(cpAt(a), g) - walkM(cpAt(b), g),
  );
}
/** 놀이형 마지막 도장은 탑승구에서 가장 가까운 이 개수 안에서 고른다. */
const FINAL_NEAR = 2;
/** 놀이형 코스에서 체크포인트끼리 적어도 이만큼(걷는 m) 떨어지게 해 이곳저곳을 돌게 한다. */
const SPREAD_M = 150;
// ponytail: 놀이형 한 코스의 상한(분). 넘는 순서는 버린다. 더 짧은 코스는 화면의 "다른 코스로 바꾸기"로 고른다.
const PLAY_MAX_MIN = 60;

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const courseMinutes = (course: number[]) => minutesOf(startOf(CHECKPOINTS[course[0]].code)!, course);

/**
 * 놀이형 코스: 마지막은 탑승구 근처, 나머지 5곳은 구역 곳곳에서 서로 떨어진 곳을 무작위로 고르고
 * 도는 순서도 무작위로 섞는다(한 방향으로 훑지 않게). 다만 PLAY_MAX_MIN 안에 끝나는 순서만 쓴다.
 * 탑승동 탑승구면 탑승동 안에서 돈다.
 */
export function makeCourse(gate: string, rand: () => number = Math.random): number[] {
  if (gateProblem(gate)) return [];
  const near = byGate(gate);
  const final = near[Math.floor(rand() * FINAL_NEAR)];
  let best: number[] = [];
  for (let t = 0; t < 20; t++) {
    const picks: number[] = [];
    for (const i of shuffle(near.slice(FINAL_NEAR), rand))
      if (picks.length < GOAL - 1 && [...picks, final].every((j) => walkM(cpAt(i), cpAt(j)) >= SPREAD_M)) picks.push(i);
    if (picks.length < GOAL - 1) continue;
    const orders = permutations(picks).map((p) => [...p, final]);
    const fits = orders.filter((c) => courseMinutes(c) <= PLAY_MAX_MIN);
    if (fits.length) return fits[Math.floor(rand() * fits.length)];
    const shortest = orders.reduce((a, b) => (courseMinutes(b) < courseMinutes(a) ? b : a));
    if (!best.length || courseMinutes(shortest) < courseMinutes(best)) best = shortest;
  }
  return best;
}

/** 코스가 지금 탑승구에 맞게 만들어져 있는가(같은 구역, 겹치지 않는 6곳, 마지막이 탑승구 근처). */
export function courseFits(course: number[] | undefined, gate: string): course is number[] {
  if (gateProblem(gate) || !course || course.length !== GOAL) return false;
  const near = byGate(gate);
  // 저장된 값이 겹치거나 깨졌으면(같은 번호 반복, 문자열 등) 새로 만든다.
  return (
    new Set(course).size === GOAL &&
    course.every((i) => near.includes(i)) &&
    near.slice(0, FINAL_NEAR).includes(course[GOAL - 1])
  );
}

/** 카메라·사진·번호 입력·QR 주소 모두 같은 기준으로 도장을 받을 수 있는지 본다. */
export function stampEligibility(
  s: { mode: "play" | "route"; gate: string; startHub?: string; boardingAt?: string; course?: number[] },
  now = Date.now(),
): StampPlan {
  if (s.mode === "route") return stampRoute(s.gate, s.startHub, s.boardingAt, now);
  const bad = gateProblem(s.gate);
  if (bad) return blocked(bad);
  if (!courseFits(s.course, s.gate)) return blocked("코스를 만들고 있어요.");
  const minutes = courseMinutes(s.course);
  const late = boardingBlock(s.boardingAt, minutes, 30, now);
  return late ? blocked(late) : { indices: s.course, minutes, reason: "" };
}
