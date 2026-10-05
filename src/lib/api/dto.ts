import { labelsIn } from "../catalog";
import type { CaseView } from "../encounters";
import type { FlightChoice } from "../flights/search";
import { kstDate } from "../flights/normalize";
import { kstTime } from "../timing";
import type { Facilities } from "../zones";

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export const ok = (body: Record<string, unknown> = {}): ApiResult => ({ status: 200, body });
export const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

/** 화면이 그대로 그릴 수 있게 문구까지 만들어 보낸다. 화면은 계산하지 않는다. */
export interface CaseDto {
  registrationId: string;
  name: string;
  comm: string[]; // 소통 방식 (감각·소통)
  categories: string[]; // 교통약자 구분
  needs: string[]; // 필요한 도움 (이동, 환경)
  accompany: string[]; // 동반
  flightNo: string;
  operatingNo: string | null;
  destName: string;
  schedTime: string | null;
  estTime: string | null;
  delayed: boolean;
  cancelled: boolean;
  gate: number | null;
  prevGate: number | null;
  minutesToClose: number | null;
  urgent: boolean;
  zoneLabel: string | null;
  facilities: Facilities | null;
}

export function toCaseDto(c: CaseView): CaseDto {
  return {
    registrationId: c.registrationId,
    name: c.name,
    comm: labelsIn(c.needs, "comm"),
    categories: labelsIn(c.categories, "category"),
    needs: [...labelsIn(c.needs, "move"), ...labelsIn(c.needs, "env")],
    accompany: labelsIn(c.needs, "accompany"),
    flightNo: c.flightNo,
    operatingNo: c.operatingNo,
    destName: c.destName,
    schedTime: c.schedAt ? kstTime(c.schedAt) : null,
    estTime: c.delayed && c.estAt ? kstTime(c.estAt) : null,
    delayed: c.delayed,
    cancelled: c.cancelled,
    gate: c.gate,
    prevGate: c.gateChangedAt ? c.prevGate : null,
    minutesToClose: c.minutesToClose,
    urgent: c.urgent,
    zoneLabel: c.zoneLabel,
    facilities: c.facilities,
  };
}

/** 등록 화면용. 공개 경로이므로 탑승구는 넣지 않는다. */
export interface FlightDto {
  flightDate: string;
  flightNo: string;
  airline: string;
  destName: string;
  label: string; // "KE123 · 뉴욕 · 오늘 14:30 출발"
}

export function toFlightDto(f: FlightChoice, now: Date): FlightDto {
  const day = f.flightDate === kstDate(now) ? "오늘" : "내일";
  const time = kstTime(f.estAt ?? f.schedAt);
  return {
    flightDate: f.flightDate,
    flightNo: f.flightNo,
    airline: f.airline,
    destName: f.destName,
    label: `${f.flightNo} · ${f.destName} · ${day} ${time} 출발`,
  };
}
