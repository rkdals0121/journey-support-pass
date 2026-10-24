import type { Session } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { ingestFlights } from "@/lib/flights/ingest";
import type { FlightRow } from "@/lib/flights/normalize";
import { kstDate } from "@/lib/flights/normalize";
import { issuePass } from "@/lib/passes";
import { createRegistration, type Registration, type RegistrationInput } from "@/lib/registrations";
import { kst } from "./db";

/** 검사용 운항 한 편. sched 는 "2026-10-05 14:30" (한국 시각). */
export function flightRow(flightNo: string, sched: string, over: Partial<FlightRow> = {}): FlightRow {
  const schedAt = kst(sched);
  return {
    flightDate: kstDate(schedAt),
    flightNo,
    masterNo: "",
    airline: "대한항공",
    destCode: "JFK",
    destName: "뉴욕",
    terminal: "CONCOURSE",
    gate: 112,
    schedAt,
    estAt: null,
    status: "",
    ...over,
  };
}

export async function addFlights(db: Db, rows: FlightRow[], now: Date): Promise<void> {
  await ingestFlights(db, rows, now);
}

/** 검사에서 기본으로 쓰는 선택. 안내 방식 하나, 이동 하나, 직원 도움 하나. */
// 표(catalog)의 순서대로 둔다. 등록을 다시 읽으면 이 순서로 나온다.
export const CHOICES = ["tr_walk", "mov_no_stairs", "gd_large", "stf_call"];

export function regInput(over: Partial<RegistrationInput> = {}): RegistrationInput {
  return {
    flightDate: "2026-10-05",
    flightNo: "KE123",
    choices: CHOICES,
    lang: "ko",
    route: "web",
    consent: true,
    startedAt: kst("2026-10-05 11:58"),
    editCount: 0,
    ...over,
  };
}

/** 등록만 한다. 패스는 아직 없다(pending). */
export async function register(db: Db, now: Date, over: Partial<RegistrationInput> = {}): Promise<Registration> {
  const res = await createRegistration(db, regInput(over), now);
  if (!res.ok) throw new Error(`등록 실패: ${res.error}`);
  return res.registration;
}

/** 등록하고 바로 패스를 만든다. 화면에서 등록을 마친 것과 같은 상태다. */
export async function registerWithPass(db: Db, now: Date, over: Partial<RegistrationInput> = {}) {
  const registration = await register(db, now, over);
  const pass = await issuePass(db, registration.id, now);
  if (!pass.ok) throw new Error("패스를 만들지 못했습니다");
  return { registration, pass: { passNo: pass.passNo, token: pass.token } };
}

/**
 * 검사 사이에 여객·운항·기록을 비운다. 구역(zones)은 남긴다.
 * 내장 DB 를 새로 띄우는 데 오래 걸려서, 파일마다 DB 하나를 두고 검사 앞에서 이것으로 비운다.
 */
export async function resetData(db: Db): Promise<void> {
  await db.exec(
    "truncate table assist_requests, calls, events, access_logs, passes, registrations, flights, flight_polls restart identity cascade",
  );
}

/** 검사용 세션. 구역 직원이 기본이다. */
export function sessionOf(now: Date, over: Partial<Session> = {}): Session {
  return {
    zoneId: "cc-end",
    isDesk: false,
    canSwitch: false,
    needsZone: false,
    isKiosk: false,
    placeId: null,
    exp: now.getTime() + 3_600_000,
    ...over,
  };
}

export const deskSession = (now: Date) => sessionOf(now, { zoneId: "desk-t1", isDesk: true });
export const commonSession = (now: Date) => sessionOf(now, { zoneId: "staff-common", canSwitch: true, needsZone: true });
export const kioskSession = (now: Date, placeId: string) => sessionOf(now, { zoneId: "kiosk", isKiosk: true, placeId });

/** 응답 어디에든 이 이름의 칸이 있는가. 이름 같은 값이 새어 나가지 않는지 볼 때 쓴다. */
export function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKey(v, key));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([k, v]) => k === key || hasKey(v, key));
  }
  return false;
}
