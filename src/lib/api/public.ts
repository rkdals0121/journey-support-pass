import { placeOf } from "../airport";
import { ipPart, logAccess, type Session } from "../auth";
import { isAdapted } from "../catalog";
import { config } from "../config";
import type { Db } from "../db";
import { lastSuccessfulPoll } from "../flights/ingest";
import { flightsToCity, suggestFlights, listDestinations } from "../flights/search";
import { buildGuide } from "../guide";
import { getJourney, isJourneyOver, type Journey } from "../journey";
import { allowEvent, logEvent } from "../metrics";
import { extractToken, issuePass, resolveToken } from "../passes";
import { eraseRegistration } from "../purge";
import { createRegistration, type Route } from "../registrations";
import { pollState } from "../timing";
import { fail, ok, toFlightDto, type ApiResult } from "./dto";

/**
 * 등록 남용 방지. 같은 접속 주소에서 정한 시간 안에 받은 등록 수를 DB 에서 센다.
 * 여객 휴대전화에서 온 등록만 센다(구역 없이 남은 기록). 키오스크와 안내데스크의 등록은 세지 않는다.
 * 배포된 서버는 요청마다 다른 서버가 받을 수 있어 메모리에 세면 소용이 없다.
 */
export async function allowRegistration(db: Db, clientKey: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - config.registerWindowMin * 60_000);
  const [row] = await db.query<{ n: number }>(
    `select count(*)::int as n from access_logs
     where action = 'register' and zone_id is null and split_part(device_key, ':', 1) = $1 and at > $2`,
    [ipPart(clientKey), since],
  );
  if ((row?.n ?? 0) >= config.registerMaxPerIp) return false;
  // 주소를 바꿔 가며 등록을 쏟아붓는 것을 막는 전체 한도. 시범 운영의 실제 등록 수보다 훨씬 넉넉하다.
  const [all] = await db.query<{ n: number }>(
    `select count(*)::int as n from access_logs where action = 'register' and zone_id is null and at > $1`,
    [since],
  );
  return (all?.n ?? 0) < config.registerMaxAll;
}

export async function searchFlightsHandler(db: Db, q: string, now: Date, city = ""): Promise<ApiResult> {
  // city 가 오면 도시 목록에서 고른 것이다. 그 도시와 이름이 정확히 같은 곳만 찾는다.
  const flights = city ? await flightsToCity(db, city, now) : await suggestFlights(db, q ?? "", now);
  return ok({ flights: flights.map((f) => toFlightDto(f, now)) });
}

/** 오늘과 내일 떠날 편이 있는 도착 도시 목록. */
export async function destinationsHandler(db: Db, now: Date): Promise<ApiResult> {
  return ok({ destinations: await listDestinations(db, now) });
}

export interface RegisterBody {
  flightDate?: unknown;
  flightNo?: unknown;
  choices?: unknown;
  lang?: unknown;
  consent?: unknown;
  startedAt?: unknown;
  editCount?: unknown;
  /** 첫 질문을 넘길 때 안내 방식을 켜 두었는가. 시작 기록과 같은 값으로 완료를 세기 위해 화면이 함께 보낸다. */
  startAdapted?: unknown;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * 등록을 받고 바로 패스를 만든다. 경로는 누가 보냈는지로 정하고 본문의 값은 믿지 않는다.
 *  - 키오스크 기기에서 왔으면 kiosk, 안내데스크 직원이 대신 넣었으면 assisted, 그 밖에는 web.
 * 패스의 QR 값은 등록한 쪽에만 한 번 돌려준다.
 */
export async function registerHandler(
  db: Db,
  body: RegisterBody,
  session: Session | null,
  clientKey: string,
  now: Date,
  assisted = false,
): Promise<ApiResult> {
  if (assisted && !session?.isDesk) return fail(403, "안내데스크 권한이 필요합니다");
  const route: Route = assisted ? "assisted" : session?.isKiosk ? "kiosk" : "web";
  // 키오스크와 안내데스크는 한 기기로 여러 명을 받으므로 횟수를 막지 않는다. 접속 코드로 확인된 기기다.
  if (route === "web" && !(await allowRegistration(db, clientKey, now))) return fail(429, "잠시 후 다시 시도해 주세요");

  const choices = strings(body.choices);
  const res = await createRegistration(
    db,
    {
      flightDate: typeof body.flightDate === "string" ? body.flightDate : "",
      flightNo: typeof body.flightNo === "string" ? body.flightNo : "",
      choices,
      lang: body.lang === "en" ? "en" : "ko",
      route,
      consent: body.consent === true,
      startedAt: new Date(typeof body.startedAt === "string" ? body.startedAt : Number.NaN),
      editCount: typeof body.editCount === "number" ? body.editCount : 0,
    },
    now,
  );
  if (!res.ok) return fail(400, res.error);

  const pass = await issuePass(db, res.registration.id, now);
  if (!pass.ok) return fail(500, "패스를 만들지 못했습니다. 잠시 후 다시 시도해 주세요");

  await logAccess(db, {
    at: now,
    zoneId: route === "web" ? undefined : session?.zoneId,
    deviceKey: clientKey,
    action: "register",
    registrationId: res.registration.id,
  });
  // 여객이 스스로 한 등록만 완료로 센다. 직원이 대신 넣은 것은 건수(경로)로만 남는다.
  if (route !== "assisted") {
    await logEvent(db, {
      at: now,
      kind: "reg_done",
      route,
      adapted: typeof body.startAdapted === "boolean" ? body.startAdapted : isAdapted(choices),
      placeId: session?.placeId,
      deviceKey: clientKey,
    });
  }
  return ok({ passNo: pass.passNo, token: pass.token });
}

export type PassLookup =
  | { kind: "ok"; journey: Journey; passNo: string; token: string }
  | { kind: "none" }
  | { kind: "ended" };

/** QR 값으로 여객의 등록을 연다. 떠난 여객의 패스는 지워지기 전이라도 열지 않는다. */
export async function lookupPass(db: Db, scanned: string, now: Date): Promise<PassLookup> {
  const token = extractToken(scanned);
  if (!token) return { kind: "none" };
  const res = await resolveToken(db, token);
  if (res.kind === "unknown") return { kind: "none" };
  if (res.kind === "unusable") return { kind: "ended" };
  const journey = await getJourney(db, res.registrationId, now);
  if (!journey || isJourneyOver(journey, now)) return { kind: "ended" };
  return { kind: "ok", journey, passNo: res.pass.passNo, token };
}

export const NOT_A_PASS = "등록된 패스가 아닙니다. QR이나 번호를 다시 확인해 주세요";
export const PASS_ENDED = "사용이 끝난 패스입니다. 항공편이 출발했거나 등록을 지운 패스입니다";

/**
 * 패스의 안내 내용. QR 값을 아는 사람은 누구나 연다 (여객 본인의 휴대전화, 키오스크).
 * 이름은 애초에 받지 않으므로 여기서 나가는 것은 항공편과 고른 항목뿐이다.
 * 길과 가까운 시설은 키오스크에서 열었을 때만 그 자리를 기준으로 넣는다.
 */
export async function guideHandler(db: Db, token: string, session: Session | null, now: Date): Promise<ApiResult> {
  const found = await lookupPass(db, token, now);
  if (found.kind === "none") return fail(404, NOT_A_PASS);
  if (found.kind === "ended") return fail(410, PASS_ENDED);
  const place = session?.isKiosk ? placeOf(session.placeId) : null;
  const poll = pollState(await lastSuccessfulPoll(db), now);
  return ok({ guide: buildGuide(found.journey, found.passNo, place, poll) });
}

/** 여객이 자기 등록을 지운다. QR 값을 아는 사람만 할 수 있다. 지우면 패스는 더 쓸 수 없다. */
export async function eraseHandler(db: Db, body: { token?: unknown }, clientKey: string, now: Date): Promise<ApiResult> {
  const found = await lookupPass(db, typeof body.token === "string" ? body.token : "", now);
  if (found.kind === "none") return fail(404, NOT_A_PASS);
  if (found.kind === "ended") return ok({ erased: true });
  await logAccess(db, { at: now, deviceKey: clientKey, action: "cancel", registrationId: found.journey.registrationId });
  await eraseRegistration(db, found.journey.registrationId, now, "revoked");
  return ok({ erased: true });
}

/**
 * 화면이 보내는 건수 기록. 등록을 시작했다는 것과 만족도 응답 두 가지만 받는다.
 * 완료와 키오스크에서의 안내 열람은 서버가 직접 센다.
 */
export async function eventHandler(
  db: Db,
  body: { kind?: unknown; adapted?: unknown; value?: unknown },
  session: Session | null,
  clientKey: string,
  now: Date,
): Promise<ApiResult> {
  if (!(await allowEvent(db, clientKey, now))) return fail(429, "잠시 후 다시 시도해 주세요");
  const base = {
    at: now,
    route: session?.isKiosk ? "kiosk" : "web",
    adapted: body.adapted === true,
    placeId: session?.placeId,
    deviceKey: clientKey,
  };
  if (body.kind === "reg_start") {
    await logEvent(db, { ...base, kind: "reg_start" });
    return ok();
  }
  if (body.kind === "survey" && (body.value === 1 || body.value === 2 || body.value === 3)) {
    await logEvent(db, { ...base, kind: "survey", value: body.value });
    return ok();
  }
  return fail(400, "기록할 수 없는 값입니다");
}
