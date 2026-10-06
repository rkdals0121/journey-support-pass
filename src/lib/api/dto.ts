import { labelsIn } from "../catalog";
import type { CaseView, ServiceRecord } from "../encounters";
import type { FlightChoice } from "../flights/search";
import { kstDate } from "../flights/normalize";
import { kstTime } from "../timing";
import { TERMINAL_LABEL, type Facilities } from "../zones";

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export const ok = (body: Record<string, unknown> = {}): ApiResult => ({ status: 200, body });
export const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

/** 응대 한 건을 화면에 보여줄 모양. 직원 개인은 없고 구역만 있다. */
export interface ServiceDto {
  zone: string; // 탑승구 범위를 뺀 구역 이름
  startTime: string;
  endTime: string | null; // 아직 응대 중이면 null
}

/** "탑승동 끝단 (101~106, 127~132)" 에서 구역 이름만. */
export function zoneName(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}

export function toServiceDto(s: ServiceRecord): ServiceDto {
  return { zone: zoneName(s.zoneLabel), startTime: kstTime(s.startedAt), endTime: s.endedAt ? kstTime(s.endedAt) : null };
}

/** 화면이 그대로 그릴 수 있게 문구까지 만들어 보낸다. 화면은 계산하지 않는다. */
export interface CaseDto {
  registrationId: string;
  name: string;
  comm: string[]; // 소통 방식 (감각·소통)
  categories: string[]; // 교통약자 구분
  needs: string[]; // 필요한 도움 (이동, 환경)
  accompany: string[]; // 동반
  /** 고른 항목의 코드 전체. 목록에서 줄인 말과 그림으로 보여줄 때 쓴다. */
  codes: string[];
  flightNo: string;
  operatingNo: string | null;
  destName: string;
  schedTime: string | null;
  estTime: string | null;
  delayed: boolean;
  cancelled: boolean;
  /** 공공데이터의 상태 문구 그대로 (탑승중, 마감예정, 탑승마감, 지연 …). 없으면 빈 글자. */
  status: string;
  /** 남은 시간 한 줄. 화면은 이 글자를 그대로 보여준다. */
  closeLabel: string;
  gate: number | null;
  prevGate: number | null;
  minutesToClose: number | null;
  urgent: boolean;
  zoneLabel: string | null;
  /** 터미널 이름. 다른 구역의 여객을 볼 때 어디 여객인지 알려 준다. */
  terminalLabel: string;
  facilities: Facilities | null;
  /** 가장 최근의 응대. 없으면 null. 목록에서 응대 중·응대 완료를 보여준다. */
  service: ServiceDto | null;
}

/**
 * 탑승 마감 안내 한 줄. 공공데이터가 실제 마감을 알려 주면 그 값을 쓰고,
 * 그렇지 않으면 출발 시각에서 계산한 값에 "추정"을 붙인다.
 */
export function closeLabelOf(c: CaseView): string {
  if (c.cancelled) return "결항";
  if (c.boardingClosed) return "탑승 마감됨";
  if (c.minutesToClose === null) return "운항 정보 없음";
  if (c.minutesToClose < 0) return "탑승 마감 지남 (추정)";
  return `탑승 마감까지 ${c.minutesToClose}분 (추정)`;
}

export function toCaseDto(c: CaseView, service: ServiceRecord | null = null): CaseDto {
  return {
    registrationId: c.registrationId,
    name: c.name,
    comm: labelsIn(c.needs, "comm"),
    categories: labelsIn(c.categories, "category"),
    needs: [...labelsIn(c.needs, "move"), ...labelsIn(c.needs, "env")],
    accompany: labelsIn(c.needs, "accompany"),
    codes: [...c.categories, ...c.needs],
    flightNo: c.flightNo,
    operatingNo: c.operatingNo,
    destName: c.destName,
    schedTime: c.schedAt ? kstTime(c.schedAt) : null,
    estTime: c.delayed && c.estAt ? kstTime(c.estAt) : null,
    delayed: c.delayed,
    cancelled: c.cancelled,
    status: c.status,
    closeLabel: closeLabelOf(c),
    gate: c.gate,
    prevGate: c.gateChangedAt ? c.prevGate : null,
    minutesToClose: c.minutesToClose,
    urgent: c.urgent,
    zoneLabel: c.zoneLabel,
    terminalLabel: TERMINAL_LABEL[c.terminal] ?? "",
    facilities: c.facilities,
    service: service ? toServiceDto(service) : null,
  };
}

/** 등록 화면용. 공개 경로이므로 탑승구는 넣지 않는다. */
export interface FlightDto {
  flightDate: string;
  flightNo: string;
  airline: string;
  destName: string;
  /** 도착 공항 코드 (JFK). 영어 화면에서 도착지 이름 대신 쓴다. */
  destCode: string;
  label: string; // "KE123 · 뉴욕 · 오늘 14:30 출발"
  day: string; // 오늘 | 내일
  time: string; // 14:30
  cancelled: boolean;
}

export function toFlightDto(f: FlightChoice, now: Date): FlightDto {
  const day = f.flightDate === kstDate(now) ? "오늘" : "내일";
  const time = kstTime(f.estAt ?? f.schedAt);
  const cancelled = f.status.includes("결항");
  return {
    flightDate: f.flightDate,
    flightNo: f.flightNo,
    airline: f.airline,
    destName: f.destName,
    destCode: f.destCode,
    label: cancelled
      ? `${f.flightNo} · ${f.destName} · ${day} ${time} · 결항`
      : `${f.flightNo} · ${f.destName} · ${day} ${time} 출발`,
    day,
    time,
    cancelled,
  };
}
