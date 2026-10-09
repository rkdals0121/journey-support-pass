import type { FlightChoice } from "../flights/search";
import { kstDate } from "../flights/normalize";
import { kstTime } from "../timing";

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export const ok = (body: Record<string, unknown> = {}): ApiResult => ({ status: 200, body });
export const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

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
    day: f.flightDate === kstDate(now) ? "today" : "tomorrow",
    time: kstTime(f.estAt ?? f.schedAt),
    cancelled: f.status.includes("결항"),
  };
}
