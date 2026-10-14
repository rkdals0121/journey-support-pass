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
  /** 수집이 멈춘 것으로 보인다. 화면에 전광판을 확인하라고 띄운다. */
  stale: boolean;
  /**
   * now 부터 몇 ms 뒤에 stale 이 되는가. 수집한 적이 없으면 null.
   * 0 보다 작으면 이미 stale 이다. 꼭 0 이면 아직 아니다(stale 은 staleInMs < 0 과 같다). 화면에서 견줄 때도 이 기준을 쓴다(staleNow).
   * 휴대전화에 남겨 둔 화면을 몇 시간 뒤에 인터넷 없이 열면 서버가 만든 때의 stale 은 그대로 false 다.
   * 화면이 그 뒤 흐른 시간과 견주어 지금은 오래된 정보라는 것을 스스로 알아보게 한다.
   * 시각이 아니라 남은 시간으로 보내, 휴대전화 시계가 틀려도 서버 시계를 기준으로 센다.
   */
  staleInMs: number | null;
}

export function pollState(lastOk: Date | null, now: Date): PollState {
  if (!lastOk) return { label: "운항 정보 없음", stale: true, staleInMs: null };
  const age = now.getTime() - lastOk.getTime();
  return {
    label: `운항 정보 ${kstTime(lastOk)} 기준`,
    stale: age > config.staleMin * MIN,
    staleInMs: config.staleMin * MIN - age,
  };
}

/**
 * 화면에 떠 있는 운항 정보가 지금 오래되었는가. pollState 와 같은 기준(남은 시간이 0 보다 작아지면)으로 화면에서 다시 본다.
 * 휴대전화에 남겨 둔 화면을 몇 시간 뒤에 인터넷 없이 열면 서버가 만든 때의 stale 은 false 로 남아 있어, 탑승구가 바뀌었어도
 * 전광판을 확인하라는 안내가 뜨지 않는다. 그 뒤 흐른 시간이 staleInMs 를 넘으면 오래된 것으로 본다.
 * 흐른 시간은 이 화면에서 받은 내용이면 받은 때(fetchedAt, 휴대전화 시각)부터 센다. 휴대전화 시계가 틀려도 서버 시계와 견주지 않는다.
 * 언제 받았는지 모르는 첫 화면(남겨 둔 화면일 수 있다)만 서버가 만든 시각(generatedAt)부터 세고, 음수이면(휴대전화 시계가 늦다) 0 으로 본다.
 * now 가 null 이면(화면이 막 뜬 때) 서버가 정한 stale 을 그대로 쓴다.
 */
export function staleNow(
  g: { poll: Pick<PollState, "stale" | "staleInMs">; generatedAt: number },
  now: number | null,
  fetchedAt: number | null,
): boolean {
  if (g.poll.stale) return true;
  const left = g.poll.staleInMs;
  // staleInMs 를 싣기 전에 남겨 둔 화면에는 이 칸이 아예 없다(undefined). 그때는 서버가 정한 stale 만 따른다.
  if (now === null || typeof left !== "number") return false;
  return Math.max(0, now - (fetchedAt ?? g.generatedAt)) > left;
}
