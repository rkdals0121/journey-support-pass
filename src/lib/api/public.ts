import type { Db } from "../db";
import { findFlights } from "../flights/search";
import { createRegistration, type Route } from "../registrations";
import { fail, ok, toFlightDto, type ApiResult } from "./dto";

// 등록 남용 방지. 프로세스 메모리에만 두므로 서버가 여러 대면 대수만큼 느슨해진다.
// 정식 운영 전에 공용 저장소 기반으로 바꿀 것.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

export function allowRegistration(key: string, now: Date): boolean {
  const t = now.getTime();
  const recent = (hits.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(t);
  hits.set(key, recent);
  return true;
}

export async function searchFlightsHandler(db: Db, q: string, now: Date): Promise<ApiResult> {
  const flights = await findFlights(db, q ?? "", now);
  return ok({ flights: flights.map((f) => toFlightDto(f, now)) });
}

export interface RegisterBody {
  name?: unknown;
  flightDate?: unknown;
  flightNo?: unknown;
  categories?: unknown;
  needs?: unknown;
  consent?: unknown;
  startedAt?: unknown;
  editCount?: unknown;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** 여객 본인 등록과 안내데스크 등록이 함께 쓴다. route 는 호출한 쪽이 정하고 본문의 값은 믿지 않는다. */
export async function submitRegistration(db: Db, body: RegisterBody, route: Route, now: Date) {
  return createRegistration(
    db,
    {
      name: typeof body.name === "string" ? body.name : "",
      flightDate: typeof body.flightDate === "string" ? body.flightDate : "",
      flightNo: typeof body.flightNo === "string" ? body.flightNo : "",
      categories: strings(body.categories),
      needs: strings(body.needs),
      route,
      consent: body.consent === true,
      startedAt: new Date(typeof body.startedAt === "string" ? body.startedAt : Number.NaN),
      editCount: typeof body.editCount === "number" ? body.editCount : 0,
    },
    now,
  );
}

export async function registerHandler(db: Db, body: RegisterBody, clientKey: string, now: Date): Promise<ApiResult> {
  if (!allowRegistration(clientKey, now)) return fail(429, "잠시 후 다시 시도해 주세요");
  const res = await submitRegistration(db, body, "web", now);
  if (!res.ok) return fail(400, res.error);
  return ok({ receiptNo: res.registration.receiptNo });
}
