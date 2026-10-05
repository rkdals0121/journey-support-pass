import { ipPart, logAccess } from "../auth";
import { config } from "../config";
import type { Db } from "../db";
import { findFlights } from "../flights/search";
import { createRegistration, type Route } from "../registrations";
import { fail, ok, toFlightDto, type ApiResult } from "./dto";

/**
 * 등록 남용 방지. 같은 접속 주소에서 정한 시간 안에 받은 등록 수를 DB 에서 센다.
 * 배포된 서버는 요청마다 다른 서버가 받을 수 있어 메모리에 세면 소용이 없다.
 */
export async function allowRegistration(db: Db, clientKey: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - config.registerWindowMin * 60_000);
  const [row] = await db.query<{ n: number }>(
    `select count(*)::int as n from access_logs
     where action = 'register' and split_part(device_key, ':', 1) = $1 and at > $2`,
    [ipPart(clientKey), since],
  );
  return (row?.n ?? 0) < config.registerMaxPerIp;
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
  if (!(await allowRegistration(db, clientKey, now))) return fail(429, "잠시 후 다시 시도해 주세요");
  const res = await submitRegistration(db, body, "web", now);
  if (!res.ok) return fail(400, res.error);
  await logAccess(db, { at: now, deviceKey: clientKey, action: "register", registrationId: res.registration.id });
  return ok({ receiptNo: res.registration.receiptNo });
}
