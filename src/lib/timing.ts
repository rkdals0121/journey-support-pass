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

export function isUrgent(f: FlightTimes, now: Date): boolean {
  return !isCancelled(f) && minutesToClose(f, now) <= config.urgentMin;
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

export function pollState(lastOk: Date | null, now: Date): { label: string; stale: boolean } {
  if (!lastOk) return { label: "운항 정보 없음", stale: true };
  return {
    label: `운항 정보 ${kstTime(lastOk)} 기준`,
    stale: now.getTime() - lastOk.getTime() > config.staleMin * MIN,
  };
}
