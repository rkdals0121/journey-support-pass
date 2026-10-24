import { placeOf } from "../airport";
import { cancelAssist, createAssist, latestAssistOf, type Assist } from "../assist";
import { logAccess, type Session } from "../auth";
import { isAdapted } from "../catalog";
import type { Db } from "../db";
import { lastSuccessfulPoll } from "../flights/ingest";
import { getFlight, operatingFlight } from "../flights/search";
import { buildGuide } from "../guide";
import { getJourney } from "../journey";
import { logEvent } from "../metrics";
import { boardingPassText, extractToken, parseBoardingPass } from "../pass-format";
import { bindBoardingPass, issuePass, resolveBoardingRef } from "../passes";
import { createRegistration } from "../registrations";
import { departureAt, isDeparted, kstTime, pollState } from "../timing";
import { fail, ok, toFlightDto, type ApiResult } from "./dto";
import { lookupPass, NOT_A_PASS, PASS_ENDED } from "./public";

// 공항 입구의 교통약자 전용 안내 키오스크. 여객이 탑승권을 찍으면
//  - 미리 등록한 여객(휴대전화 탑승권의 QR, 또는 여기서 등록한 탑승권): 고른 도움을 확인하고 서비스로 넘어간다.
//  - 등록하지 않은 여객(모의 탑승권): 그 자리에서 불편을 고르고 서류를 인식시켜 등록한다. 토큰은 그 탑승권에 잇는다.

const NEED_KIOSK = "키오스크로 설정된 기기에서만 쓸 수 있습니다";

function kioskError(session: Session | null): ApiResult | null {
  if (!session) return fail(401, "로그인이 필요합니다");
  if (!session.isKiosk || !session.placeId) return fail(403, NEED_KIOSK);
  return null;
}

/** 탑승권을 찍었다. 등록한 여객이면 안내를, 아니면 그 탑승권의 편을 돌려준다. */
export async function entryScanHandler(db: Db, session: Session | null, body: { scanned?: unknown }, device: string, now: Date): Promise<ApiResult> {
  const denied = kioskError(session);
  if (denied) return denied;
  const scanned = typeof body.scanned === "string" ? body.scanned : "";
  const bp = parseBoardingPass(scanned);
  let token = extractToken(scanned);
  if (bp) {
    const bound = await resolveBoardingRef(db, bp.ref);
    if (bound.kind === "active") token = bound.pass.token;
  }
  if (token) {
    const found = await lookupPass(db, token, now);
    if (found.kind === "none") return fail(404, NOT_A_PASS);
    if (found.kind === "ended") return fail(410, PASS_ENDED);
    await logEvent(db, {
      at: now,
      kind: "guide_open",
      route: "entry",
      adapted: isAdapted(found.journey.choices),
      placeId: session!.placeId,
      deviceKey: device,
    });
    const poll = pollState(await lastSuccessfulPoll(db), now);
    return ok({ registered: true, token: found.token, guide: buildGuide(found.journey, found.passNo, placeOf(session!.placeId), poll, now) });
  }
  if (!bp) return fail(404, "탑승권을 읽지 못했습니다. 탑승권의 QR을 다시 보여 주세요");
  const flight = await getFlight(db, bp.flightDate, bp.flightNo);
  if (!flight) return fail(404, "탑승권의 항공편을 찾지 못했습니다. 안내데스크에 물어봐 주세요");
  const operating = await operatingFlight(db, flight);
  if (isDeparted(operating) || departureAt(operating) <= now) return fail(410, "이미 출발한 항공편의 탑승권입니다");
  return ok({ registered: false, boarding: boardingPassText(bp), flight: toFlightDto(flight, now) });
}

export interface OnsiteBody {
  boarding?: unknown;
  choices?: unknown;
  lang?: unknown;
  consent?: unknown;
  proof?: unknown;
  startedAt?: unknown;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** 그 자리에서 등록한다. 패스를 만들어 찍은 탑승권에 잇는다(탑승권이 있으므로 체크인한 것으로 본다). */
export async function onsiteRegisterHandler(db: Db, session: Session | null, body: OnsiteBody, device: string, now: Date): Promise<ApiResult> {
  const denied = kioskError(session);
  if (denied) return denied;
  const bp = parseBoardingPass(typeof body.boarding === "string" ? body.boarding : "");
  if (!bp) return fail(400, "탑승권을 다시 찍어 주세요");
  // 같은 탑승권으로 이미 등록했으면(두 번 누름) 그것을 돌려준다.
  const bound = await resolveBoardingRef(db, bp.ref);
  if (bound.kind === "active") {
    return entryScanHandler(db, session, { scanned: boardingPassText(bp) }, device, now);
  }
  const choices = strings(body.choices);
  const res = await createRegistration(
    db,
    {
      flightDate: bp.flightDate,
      flightNo: bp.flightNo,
      choices,
      lang: body.lang === "en" ? "en" : "ko",
      route: "kiosk",
      consent: body.consent === true,
      startedAt: new Date(typeof body.startedAt === "string" ? body.startedAt : Number.NaN),
      editCount: 0,
      proof: body.proof === true,
    },
    now,
  );
  if (!res.ok) return fail(400, res.error, res.code);
  const pass = await issuePass(db, res.registration.id, now);
  if (!pass.ok) return fail(500, "등록하지 못했습니다. 잠시 후 다시 해 주세요", "pass");
  await bindBoardingPass(db, pass.token, bp.ref, now);
  await logAccess(db, { at: now, zoneId: session!.zoneId, deviceKey: device, action: "register", registrationId: res.registration.id });
  await logEvent(db, {
    at: now,
    kind: "reg_done",
    route: "entry",
    adapted: isAdapted(choices),
    placeId: session!.placeId,
    value: res.registration.proofVerified ? 1 : 0,
    deviceKey: device,
  });
  const journey = await getJourney(db, res.registration.id, now);
  if (!journey) return fail(500, "등록하지 못했습니다. 잠시 후 다시 해 주세요");
  const poll = pollState(await lastSuccessfulPoll(db), now);
  return ok({ registered: true, token: pass.token, guide: buildGuide(journey, pass.passNo, placeOf(session!.placeId), poll, now) });
}

/** 여객이 보는 이동지원 요청 상태. */
export interface AssistDto {
  state: Assist["state"];
  /** 요청한 시각 14:30 */
  time: string;
  /** 요청한 곳. 키오스크 자리 이름, 휴대전화면 빈 글자. */
  place: string;
}

function toAssistDto(a: Assist | null): AssistDto | null {
  if (!a) return null;
  return { state: a.state, time: kstTime(a.createdAt), place: placeOf(a.placeId ?? "")?.label ?? "" };
}

async function journeyOf(db: Db, token: unknown, now: Date): Promise<{ error: ApiResult } | { registrationId: string }> {
  const found = await lookupPass(db, typeof token === "string" ? token : "", now);
  if (found.kind === "none") return { error: fail(404, NOT_A_PASS) };
  if (found.kind === "ended") return { error: fail(410, PASS_ENDED) };
  return { registrationId: found.journey.registrationId };
}

/** 이동지원(전동차) 요청. 키오스크에서 청하면 그 자리를, 휴대전화에서 청하면 자리 없이 남긴다. */
export async function assistRequestHandler(db: Db, session: Session | null, body: { token?: unknown }, now: Date): Promise<ApiResult> {
  const j = await journeyOf(db, body.token, now);
  if ("error" in j) return j.error;
  const placeId = session?.isKiosk ? session.placeId : null;
  const a = await createAssist(db, j.registrationId, placeId, now);
  if (!a) return fail(500, "요청하지 못했습니다. 잠시 후 다시 해 주세요");
  return ok({ request: toAssistDto(a) });
}

export async function assistStatusHandler(db: Db, body: { token?: unknown }, now: Date): Promise<ApiResult> {
  const j = await journeyOf(db, body.token, now);
  if ("error" in j) return j.error;
  return ok({ request: toAssistDto(await latestAssistOf(db, j.registrationId, now)) });
}

export async function assistCancelHandler(db: Db, body: { token?: unknown }, now: Date): Promise<ApiResult> {
  const j = await journeyOf(db, body.token, now);
  if ("error" in j) return j.error;
  if (!(await cancelAssist(db, j.registrationId, now))) return fail(409, "이미 직원이 이동을 시작해 거둘 수 없습니다");
  return ok({ request: toAssistDto(await latestAssistOf(db, j.registrationId, now)) });
}
