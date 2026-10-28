import { GATE_PICKUP_POINTS, gateX, type Area } from "./airport";
import { CHECKPOINTS, GOAL } from "./stamp-book";

// 스탬프북은 에어사이드(출국심사 뒤 면세구역~탑승구)에서만 한다.
// 놀이형: 지금 있는 곳 근처에서 서로 가까운 체크포인트 6곳을 무작위로 묶은 코스.
// 경로형: 지금 있는 곳에서 탑승구까지 가는 길 위 체크포인트 5~6곳. 마지막은 탑승구에서 가장 가까운 곳.
// 터미널을 바꾸거나(제1↔제2) 탑승동에서 제1여객터미널로 되돌아가는 길은 만들지 않는다.

export interface StartPoint {
  id: string;
  area: Area;
  near: number;
  label: string;
}

/** 출국심사를 마치고 나오는 곳. 시연용 모의 위치다. */
export const EXITS: StartPoint[] = [
  { id: "t1-east", area: "T1", near: 11, label: "제1여객터미널 동편 출국심사 출구" },
  { id: "t1-west", area: "T1", near: 40, label: "제1여객터미널 서편 출국심사 출구" },
  { id: "cc-train", area: "CONCOURSE", near: 116, label: "탑승동 셔틀트레인에서 올라온 곳" },
  { id: "t2-east", area: "T2", near: 234, label: "제2여객터미널 동편 출국심사 출구" },
  { id: "t2-west", area: "T2", near: 262, label: "제2여객터미널 서편 출국심사 출구" },
];

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
  const target = GATE_PICKUP_POINTS.find((p) => p.gate === Number(gate));
  if (!gate.trim() || !target) return blocked("탑승구 번호를 입력해 주세요.");
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

/**
 * 놀이형 코스: 지금 있는 곳 근처(가까운 8곳 가운데 하나)를 중심으로, 그 둘레 9곳에서 6곳을 무작위로 고른다.
 * 서로 가까운 곳끼리라 여기 갔다 저기 갔다 하지 않는다. 지금 있는 곳에서 가까운 끝부터 한쪽 방향으로 돈다.
 */
export function makeCourse(origin?: string, rand: () => number = Math.random): number[] {
  const start = startOf(origin);
  if (!start) return [];
  const sx = gateX(start.area, start.near);
  const area = CHECKPOINTS.flatMap((c, i) => (c.area === start.area ? [i] : []));
  const nearest = (px: number) => [...area].sort((a, b) => Math.abs(xOf(a) - px) - Math.abs(xOf(b) - px));
  const around = nearest(sx).slice(0, 8);
  const anchor = around[Math.floor(rand() * around.length)];
  const pool = nearest(xOf(anchor)).slice(0, 9);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const course = pool.slice(0, GOAL).sort((a, b) => xOf(a) - xOf(b));
  return Math.abs(xOf(course[0]) - sx) <= Math.abs(xOf(course[course.length - 1]) - sx) ? course : course.reverse();
}

/** 코스가 지금 있는 곳의 구역에 맞게 만들어져 있는가. */
export function courseFits(course: number[] | undefined, origin?: string): course is number[] {
  const start = startOf(origin);
  return !!start && !!course && course.length === GOAL && course.every((i) => CHECKPOINTS[i]?.area === start.area);
}

/** 카메라·사진·번호 입력·QR 주소 모두 같은 기준으로 도장을 받을 수 있는지 본다. */
export function stampEligibility(
  s: { mode: "play" | "route"; gate: string; startHub?: string; boardingAt?: string; course?: number[] },
  now = Date.now(),
): StampPlan {
  if (s.mode === "route") return stampRoute(s.gate, s.startHub, s.boardingAt, now);
  const start = startOf(s.startHub);
  if (!start) return blocked("지금 있는 곳을 골라 주세요.");
  if (!courseFits(s.course, s.startHub)) return blocked("코스를 만들고 있어요.");
  const minutes = minutesOf(start, s.course);
  const late = boardingBlock(s.boardingAt, minutes, 30, now);
  return late ? blocked(late) : { indices: s.course, minutes, reason: "" };
}
