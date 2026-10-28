import { GATE_PICKUP_POINTS, gateX, type Area } from "./airport";
import { CHECKPOINTS, GOAL } from "./stamp-book";

// 스탬프북은 에어사이드(출국심사 뒤 면세구역~탑승구)에서만 한다.
// 놀이형: 탑승구가 있는 구역 이곳저곳 6곳을 무작위로 묶되, 한 방향으로 돌아 마지막은 탑승구 근처에서 끝나는 코스.
// 경로형: 지금 있는 곳에서 탑승구까지 가는 길 위 체크포인트 5~6곳. 마지막은 탑승구에서 가장 가까운 곳.
// 터미널을 바꾸거나(제1↔제2) 탑승동에서 제1여객터미널로 되돌아가는 길은 만들지 않는다.

export interface StartPoint {
  id: string;
  area: Area;
  near: number;
  label: string;
}

/**
 * 출국심사를 마치고 면세구역으로 나오는 곳: 제1여객터미널 출국장 1~6, 제2여객터미널 출국장 1~2.
 * 탑승동에는 출국심사대가 없다(제1여객터미널에서 심사를 마치고 셔틀트레인으로 간다).
 * 출국장 번호는 실제와 같고, 가까운 탑승구(near)는 시연용 모의 값이다.
 */
export const EXITS: StartPoint[] = [
  ...[8, 16, 23, 28, 35, 43].map((near, k) => ({
    id: `t1-${k + 1}`,
    area: "T1" as Area,
    near,
    label: `제1여객터미널 ${k + 1}번 출국장 출국심사 출구`,
  })),
  { id: "t2-1", area: "T2", near: 234, label: "제2여객터미널 1번 출국장 출국심사 출구" },
  { id: "t2-2", area: "T2", near: 262, label: "제2여객터미널 2번 출국장 출국심사 출구" },
];

// 인천공항이 쓰지 않는 탑승구 번호(공항 공식 안내: 4·13·44·244번은 없다).
// ponytail: 구역 범위 안 나머지 번호는 있다고 본다. 공항의 실제 탑승구 목록을 받으면 그것으로 바꾼다.
const NO_GATES = new Set([4, 13, 44, 244]);

/** 탑승구 번호가 비었거나 인천공항에 없는 번호면 안내 문구, 맞으면 "". */
export function gateProblem(gate: string): string {
  if (!gate.trim()) return "탑승구 번호를 입력해 주세요.";
  const g = Number(gate);
  return GATE_PICKUP_POINTS.some((p) => p.gate === g) && !NO_GATES.has(g)
    ? ""
    : `${gate}번은 인천공항에 없는 탑승구예요. 탑승권의 탑승구 번호를 다시 확인해 주세요.`;
}

/** 지금 있는 곳: 출국심사 출구이거나, 근처 체크포인트(번호). */
export function startOf(id?: string): StartPoint | undefined {
  const exit = EXITS.find((e) => e.id === id);
  if (exit) return exit;
  const c = CHECKPOINTS.find((p) => p.code === id);
  return c && { id: c.code, area: c.area, near: c.near, label: c.place };
}

// ponytail: 걷는 속도·도장 하나에 쓰는 시간·셔틀트레인 시간은 아이 동반 가족 기준 추정값. 현장 측정 뒤 고친다.
const WALK_M_PER_MIN = 50;
const STAMP_MIN = 3;
const TRAIN_MIN = 10;
/** 길 위 후보로 칠 때 구간 양끝에서 더 봐 주는 거리(m). 탑승구 한두 개 정도. */
const SLACK_M = 30;
/** 셔틀트레인 에스컬레이터가 있는 자리(가장 가까운 탑승구) */
const TRAIN_AT: Partial<Record<Area, number>> = { T1: 26, CONCOURSE: 116 };

const xOf = (i: number) => gateX(CHECKPOINTS[i].area, CHECKPOINTS[i].near);

export interface StampPlan {
  indices: number[];
  minutes: number;
  reason: string;
}
const blocked = (reason: string): StampPlan => ({ indices: [], minutes: 0, reason });

/** 출발점에서 차례로 들러 마지막 체크포인트까지 걸리는 시간(분). 구역이 바뀌면 셔틀트레인을 탄다. */
export function minutesOf(start: StartPoint, indices: number[]): number {
  let area = start.area;
  let at = gateX(area, start.near);
  let m = 0;
  for (const i of indices) {
    const c = CHECKPOINTS[i];
    if (c.area !== area) {
      m += Math.abs(at - gateX(area, TRAIN_AT[area] ?? 0)) / WALK_M_PER_MIN + TRAIN_MIN;
      area = c.area;
      at = gateX(area, TRAIN_AT[area] ?? 0);
    }
    m += Math.abs(xOf(i) - at) / WALK_M_PER_MIN + STAMP_MIN;
    at = xOf(i);
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

/** 경로형: 지금 있는 곳 → 탑승구. 길 위 체크포인트를 가는 순서대로 5~6곳. */
export function stampRoute(gate: string, origin?: string, boardingAt = "", now = Date.now()): StampPlan {
  const bad = gateProblem(gate);
  if (bad) return blocked(bad);
  const target = GATE_PICKUP_POINTS.find((p) => p.gate === Number(gate))!;
  const start = startOf(origin);
  if (!start) return blocked("지금 있는 곳을 골라 주세요.");
  const ga = target.place.area;
  if ((start.area === "T2") !== (ga === "T2"))
    return blocked("지금 있는 터미널과 탑승구의 터미널이 달라요. 탑승권의 터미널을 확인해 주세요.");
  if (start.area === "CONCOURSE" && ga === "T1") return blocked("탑승동에서는 제1여객터미널로 돌아갈 수 없어요.");

  const gx = gateX(ga, Number(gate));
  // 같은 구역이면 한 구간, 제1여객터미널 → 탑승동이면 두 구간(승강장 에스컬레이터까지 / 도착 에스컬레이터부터).
  const legs =
    start.area === ga
      ? [{ area: ga, from: gateX(ga, start.near), to: gx }]
      : [
          { area: "T1" as Area, from: gateX("T1", start.near), to: gateX("T1", TRAIN_AT.T1!) },
          { area: "CONCOURSE" as Area, from: gateX("CONCOURSE", TRAIN_AT.CONCOURSE!), to: gx },
        ];
  // 가는 순서를 재는 값: 몇 번째 구간인지 + 그 구간에서 얼마나 나아갔는지.
  const progress = (i: number) => {
    const k = legs.findIndex((l) => l.area === CHECKPOINTS[i].area);
    const l = legs[k];
    return k * 1e6 + (xOf(i) - l.from) * (l.to >= l.from ? 1 : -1);
  };
  // 길 위: 구간 출발점부터 끝까지. 되돌아가지 않게 출발점 뒤쪽은 빼고, 여유는 마지막 구간의 탑승구 쪽에만 둔다
  // (앞 구간에서 승강장 에스컬레이터를 지나쳤다가 돌아오지 않게).
  const inLeg = (i: number) => {
    const k = legs.findIndex((g) => g.area === CHECKPOINTS[i].area);
    if (k < 0) return false;
    const l = legs[k];
    const p = (xOf(i) - l.from) * (l.to >= l.from ? 1 : -1);
    return p >= 0 && p <= Math.abs(l.to - l.from) + (k === legs.length - 1 ? SLACK_M : 0);
  };

  // 마지막: 탑승구에서 가장 가까운 체크포인트.
  const inGateArea = CHECKPOINTS.flatMap((c, i) => (c.area === ga ? [i] : []));
  const final = inGateArea.reduce((a, b) => (Math.abs(xOf(b) - gx) < Math.abs(xOf(a) - gx) ? b : a));
  const must = new Set<number>([final]);
  // 탑승동으로 가면 두 셔틀트레인 에스컬레이터는 꼭 들른다. 지금 체크포인트 앞이면 거기서 시작한다.
  if (legs.length === 2) CHECKPOINTS.forEach((c, i) => c.train && must.add(i));
  const here = CHECKPOINTS.findIndex((c) => c.code === start.id);
  if (here >= 0) must.add(here);

  const along = CHECKPOINTS.flatMap((_, i) => (inLeg(i) && !must.has(i) ? [i] : [])).sort((a, b) => progress(a) - progress(b));
  let picked = [...must, ...evenly(along, GOAL - must.size)];
  // 길이 짧아 모자라면 탑승구 근처를 조금 더 둘러본다.
  if (picked.length < GOAL) {
    const extra = inGateArea
      .filter((i) => !picked.includes(i))
      .sort((a, b) => Math.abs(xOf(a) - gx) - Math.abs(xOf(b) - gx));
    picked = [...picked, ...extra.slice(0, GOAL - picked.length)];
  }
  const indices = [...picked.filter((i) => i !== final).sort((a, b) => progress(a) - progress(b)), final];
  const minutes = minutesOf(start, indices);
  const late = boardingBlock(boardingAt, minutes, 15, now);
  return late ? blocked(late) : { indices, minutes, reason: "" };
}

/** 탑승구 구역의 체크포인트, 탑승구에서 가까운 순. */
function byGate(gate: string): number[] {
  const p = GATE_PICKUP_POINTS.find((g) => g.gate === Number(gate))!.place;
  const gx = gateX(p.area, Number(gate));
  return CHECKPOINTS.flatMap((c, i) => (c.area === p.area ? [i] : [])).sort((a, b) => Math.abs(xOf(a) - gx) - Math.abs(xOf(b) - gx));
}
/** 놀이형 코스의 마지막 도장은 탑승구에서 가장 가까운 이 개수 안에서 고른다. */
const FINAL_NEAR = 2;

/**
 * 놀이형 코스: 탑승구 근처 체크포인트를 끝으로 정하고, 그 한쪽으로 8~13곳 펼쳐진 구간에서 5곳을 무작위로 고른다.
 * 공항 이곳저곳을 돌지만 한 방향으로 걸어 탑승구 쪽에서 끝나므로 여기 갔다 저기 갔다 하지 않는다.
 * 탑승동 탑승구면 탑승동 안에서 돈다.
 */
export function makeCourse(gate: string, rand: () => number = Math.random): number[] {
  if (gateProblem(gate)) return [];
  const near = byGate(gate);
  const line = [...near].sort((a, b) => xOf(a) - xOf(b));
  const final = near[Math.floor(rand() * FINAL_NEAR)];
  const f = line.indexOf(final);
  const span = 8 + Math.floor(rand() * 6);
  const left = f;
  const right = line.length - 1 - f;
  // 넉넉한 쪽에서 더 자주 온다. 한쪽이 5곳도 안 되면 반대쪽에서만.
  const fromLeft = left >= GOAL - 1 && (right < GOAL - 1 || rand() < left / (left + right));
  const seg = fromLeft ? line.slice(Math.max(0, f - span), f) : line.slice(f + 1, f + 1 + span);
  for (let i = seg.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [seg[i], seg[j]] = [seg[j], seg[i]];
  }
  const picks = seg.slice(0, GOAL - 1).sort((a, b) => (fromLeft ? xOf(a) - xOf(b) : xOf(b) - xOf(a)));
  return [...picks, final];
}

/** 코스가 지금 탑승구에 맞게 만들어져 있는가(같은 구역, 마지막이 탑승구 근처). */
export function courseFits(course: number[] | undefined, gate: string): course is number[] {
  if (gateProblem(gate) || !course || course.length !== GOAL) return false;
  const near = byGate(gate);
  return course.every((i) => near.includes(i)) && near.slice(0, FINAL_NEAR).includes(course[GOAL - 1]);
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
  const minutes = minutesOf(startOf(CHECKPOINTS[s.course[0]].code)!, s.course);
  const late = boardingBlock(s.boardingAt, minutes, 30, now);
  return late ? blocked(late) : { indices: s.course, minutes, reason: "" };
}
