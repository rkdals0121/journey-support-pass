import { config } from "./config";

export interface FlightTimes {
  schedAt: Date;
  estAt: Date | null;
  status: string;
}

const MIN = 60_000;

export function departureAt(f: FlightTimes): Date {
  return f.estAt ?? f.schedAt;
}

// 공공데이터에는 탑승 마감 시각이 없다. 출발 시각에서 정한 분만큼 뺀 추정값이며
// 화면에는 반드시 "추정"으로 표시한다.
export function boardingCloseAt(f: FlightTimes): Date {
  return new Date(departureAt(f).getTime() - config.boardingCloseMin * MIN);
}

export function minutesToClose(f: FlightTimes, now: Date): number {
  return Math.floor((boardingCloseAt(f).getTime() - now.getTime()) / MIN);
}

export function isCancelled(f: FlightTimes): boolean {
  return f.status.includes("결항");
}

export function isDeparted(f: FlightTimes): boolean {
  return f.status.includes("출발");
}

export function isDelayed(f: FlightTimes): boolean {
  return f.estAt !== null && f.estAt.getTime() > f.schedAt.getTime();
}

/** 공공데이터가 "탑승마감" 상태를 주면 추정이 아니라 실제로 마감된 것이다. */
export function isBoardingClosed(f: FlightTimes): boolean {
  return f.status.includes("탑승마감");
}

/** 탑승이 진행 중이거나 곧 마감된다고 공공데이터가 알려 준 상태. */
export function isBoardingNow(f: FlightTimes): boolean {
  return f.status.includes("탑승중") || f.status.includes("마감예정");
}

export function isUrgent(f: FlightTimes, now: Date): boolean {
  if (isCancelled(f)) return false;
  return isBoardingNow(f) || isBoardingClosed(f) || minutesToClose(f, now) <= config.urgentMin;
}

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 한국 시각 "14:35" */
export function kstTime(d: Date): string {
  const parts = KST_TIME.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

export interface PollState {
  label: string;
  /** 수집이 멈춘 것으로 보인다. 화면에 경고를 띄운다. */
  stale: boolean;
  /** 멈추지는 않았지만 받은 지 좀 됐다. 탑승구를 전광판에서 한 번 더 보라고 안내한다. */
  aged: boolean;
}

export function pollState(lastOk: Date | null, now: Date): PollState {
  if (!lastOk) return { label: "운항 정보 없음", stale: true, aged: false };
  const age = now.getTime() - lastOk.getTime();
  const stale = age > config.staleMin * MIN;
  return {
    label: `운항 정보 ${kstTime(lastOk)} 기준`,
    stale,
    aged: !stale && age > config.agedMin * MIN,
  };
}
