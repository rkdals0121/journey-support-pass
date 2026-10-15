import { placeOf } from "../airport";
import { forgetAttempt, ipPart, logAccess, type Session } from "../auth";
import { isAdapted } from "../catalog";
import { config } from "../config";
import type { Db } from "../db";
import { lastSuccessfulPoll } from "../flights/ingest";
import { flightsToCity, suggestFlights, listDestinations } from "../flights/search";
import { buildGuide } from "../guide";
import { getJourney, isJourneyOver, lastRealPoll, type Journey } from "../journey";
import { logEvent, logLimitedEvent } from "../metrics";
import { extractToken, issuePass, resolveToken } from "../passes";
import { eraseRegistration } from "../purge";
import { createRegistration, type Route } from "../registrations";
import { pollState } from "../timing";
import { fail, ok, toFlightDto, type ApiResult } from "./dto";

/**
 * 등록 남용 방지. 같은 접속 주소에서 정한 시간 안에 받은 등록 수를 DB 에서 센다.
 * 여객 휴대전화에서 온 등록만 센다(구역 없이 남은 기록). 키오스크와 안내데스크의 등록은 세지 않는다.
 * 배포된 서버는 요청마다 다른 서버가 받을 수 있어 메모리에 세면 소용이 없다.
 *
 * 먼저 "등록" 기록을 적고, 그 기록까지 세어 한도를 넘었는지 본다(접속 코드의 claimAttempt 와 같은 방식).
 * 센 뒤에 적으면 한꺼번에 수백 건을 보낼 때 모두가 "아직 0건"을 보고 지나가 한도가 소용없게 된다.
 * 한도 안이면 적은 기록의 id 를 돌려준다. 받는 쪽은 등록을 마치면 그 기록에 등록을 잇고,
 * 등록이나 패스 만들기에 실패하면 지운다(forgetAttempt). 한도를 넘었으면 여기서 지우고 null 을 돌려준다.
 */
export async function claimRegistration(db: Db, clientKey: string, now: Date): Promise<string | null> {
  const [row] = await db.query<{ id: string }>(
    "insert into access_logs (at, zone_id, device_key, action) values ($1, null, $2, 'register') returning id::text as id",
    [now, clientKey],
  );
  const since = new Date(now.getTime() - config.registerWindowMin * 60_000);
  const [count] = await db.query<{ by_ip: number; total: number }>(
    `select count(*) filter (where split_part(device_key, ':', 1) = $1)::int as by_ip, count(*)::int as total
     from access_logs where action = 'register' and zone_id is null and at > $2`,
    [ipPart(clientKey), since],
  );
  // 방금 적은 것까지 센 수다. 그래서 "넘으면" 막는다(전에는 적기 전의 수가 "같거나 넘으면" 막았다. 같은 기준이다).
  // 전체 한도는 주소를 바꿔 가며 등록을 쏟아붓는 것을 막는다. 시범 운영의 실제 등록 수보다 훨씬 넉넉하다.
  if ((count?.by_ip ?? 0) > config.registerMaxPerIp || (count?.total ?? 0) > config.registerMaxAll) {
    await forgetAttempt(db, row.id);
    return null;
  }
  return row.id;
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
  // 직원이 대신 넣는 등록에서 로그인이 아예 없으면(안내데스크의 로그인이 풀렸으면) 401 로 답해, 화면이 다시 로그인하러 보내게 한다.
  // 로그인은 했지만 안내데스크가 아닌 기기는 그대로 403 이다.
  if (assisted && !session) return fail(401, "로그인이 필요합니다");
  if (assisted && !session?.isDesk) return fail(403, "안내데스크 권한이 필요합니다");
  const route: Route = assisted ? "assisted" : session?.isKiosk ? "kiosk" : "web";
  // 키오스크와 안내데스크는 한 기기로 여러 명을 받으므로 횟수를 막지 않는다. 접속 코드로 확인된 기기다.
  // 휴대전화 등록은 먼저 기록을 적어 자리를 잡는다(claim). 받지 못하면 아래에서 그 기록을 지운다.
  const claim = route === "web" ? await claimRegistration(db, clientKey, now) : null;
  if (route === "web" && !claim) return fail(429, "잠시 후 다시 시도해 주세요", "rate");

  const choices = strings(body.choices);
  // 잡아 둔 자리를 돌려준다. 예상하지 못한 오류(이상한 값을 DB 가 거부하는 등)에도 돌려준다.
  // 남기면 등록이 생기지 않았는데도 10분 동안 한도를 차지한다.
  const release = async () => {
    if (claim) await forgetAttempt(db, claim);
  };
  let res: Awaited<ReturnType<typeof createRegistration>>;
  try {
    res = await createRegistration(
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
  } catch (e) {
    await release();
    throw e;
  }
  // 받지 못한 등록은 횟수로 세지 않는다. 잘못 넣고 고쳐 다시 보내는 여객이 한도에 걸리지 않게 한다.
  if (!res.ok) {
    await release();
    return fail(400, res.error, res.code);
  }

  let pass: Awaited<ReturnType<typeof issuePass>>;
  try {
    pass = await issuePass(db, res.registration.id, now);
  } catch (e) {
    await release();
    throw e;
  }
  if (!pass.ok) {
    await release();
    return fail(500, "패스를 만들지 못했습니다. 잠시 후 다시 시도해 주세요", "pass");
  }

  if (claim) {
    // 휴대전화 등록은 먼저 적어 둔 기록에 이 등록을 잇는다. 기록을 하나 더 남기면 두 번 센다.
    await db.query("update access_logs set registration_id = $2 where id = $1::bigint", [claim, res.registration.id]);
  } else {
    await logAccess(db, {
      at: now,
      zoneId: session?.zoneId,
      deviceKey: clientKey,
      action: "register",
      registrationId: res.registration.id,
    });
  }
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
  if (!journey || isJourneyOver(journey, now, await lastRealPoll(db))) return { kind: "ended" };
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
  const base = {
    at: now,
    route: session?.isKiosk ? "kiosk" : "web",
    adapted: body.adapted === true,
    placeId: session?.placeId,
    deviceKey: clientKey,
  };
  let event: Parameters<typeof logLimitedEvent>[1];
  if (body.kind === "reg_start") event = { ...base, kind: "reg_start" };
  else if (body.kind === "survey" && (body.value === 1 || body.value === 2 || body.value === 3)) {
    event = { ...base, kind: "survey", value: body.value };
  } else return fail(400, "기록할 수 없는 값입니다");
  // 설치 코드로 들어온 키오스크는 한도에서 뺀다(등록 한도와 같다). 공항 키오스크들은 한 접속 주소로 나가는 일이 많아
  // 바쁜 시간에 함께 한도에 걸리면 등록 시작·만족도가 소리 없이 빠진다.
  if (session?.isKiosk) {
    await logEvent(db, event);
    return ok();
  }
  if (!(await logLimitedEvent(db, event))) return fail(429, "잠시 후 다시 시도해 주세요");
  return ok();
}
