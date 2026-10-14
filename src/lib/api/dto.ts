import type { FlightChoice } from "../flights/search";
import { kstDate } from "../flights/normalize";
import { kstTime } from "../timing";

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export const ok = (body: Record<string, unknown> = {}): ApiResult => ({ status: 200, body });
/**
 * 실패 응답. error 는 한국어 문구라 한국어 화면은 그대로 보여 준다.
 * code 는 영어 화면이 상황에 맞는 영어 문구를 고르는 데 쓴다(예: "departed", "rate"). 없으면 넣지 않는다.
 */
export const fail = (status: number, error: string, code?: string): ApiResult => ({
  status,
  body: code ? { error, code } : { error },
});

/** "탑승동 끝단 (101~106, 127~132)" 에서 구역 이름만. */
export function zoneName(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}

/** 등록 화면용. 공개 경로이므로 탑승구는 넣지 않는다. */
export interface FlightDto {
  flightDate: string;
  flightNo: string;
  airline: string;
  destName: string;
  /** 도착 공항 코드 (JFK). 영어 화면에서 도착지 이름 대신 쓴다. */
  destCode: string;
  day: "today" | "tomorrow";
  time: string; // 14:30
  cancelled: boolean;
}

export function toFlightDto(f: FlightChoice, now: Date): FlightDto {
  return {
    flightDate: f.flightDate,
    flightNo: f.flightNo,
    airline: f.airline,
    destName: f.destName,
    destCode: f.destCode,
    // 오늘·내일은 실제로 떠나는 날로 정한다. 시각(time)과 같은 값을 봐야 한다.
    // 예정 날짜(flightDate)로 정하면 오늘 23:40 편이 00:15 로 늦어졌을 때 "오늘 00:15"로 보여 이미 떠난 편처럼 보이고,
    // 자정을 넘긴 어제 날짜 편은 "내일"로 보인다. 화면은 오늘·내일 둘뿐이라 모레로 넘어간 편도 "내일"로 둔다.
    day: kstDate(f.estAt ?? f.schedAt) <= kstDate(now) ? "today" : "tomorrow",
    time: kstTime(f.estAt ?? f.schedAt),
    cancelled: f.status.includes("결항"),
  };
}
