import { placeOf, PLACES } from "../airport";
import { isLocked, logAccess, login, type Session } from "../auth";
import { cancelCall, createCall, getCallAt } from "../calls";
import { isAdapted } from "../catalog";
import type { Db } from "../db";
import { lastSuccessfulPoll } from "../flights/ingest";
import { buildGuide } from "../guide";
import { getJourney, isJourneyOver } from "../journey";
import { logEvent } from "../metrics";
import { cleanPassNo, resolvePassNo } from "../passes";
import { pollState } from "../timing";
import { fail, ok, type ApiResult } from "./dto";
import { lookupPass, NOT_A_PASS, PASS_ENDED, type PassLookup } from "./public";

const NEED_KIOSK = "키오스크로 설정된 기기에서만 쓸 수 있습니다";

/** 키오스크를 놓을 수 있는 자리. 설치 화면이 고르게 한다. */
export function placesHandler(): ApiResult {
  return ok({ places: PLACES.map((p) => ({ id: p.id, label: p.label, landside: p.landside })) });
}

/** 키오스크 설치. 설치 코드와 놓을 자리를 받아 그 기기를 키오스크로 만든다. */
export async function kioskLoginHandler(
  db: Db,
  body: { code?: unknown; placeId?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult & { token?: string }> {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const place = placeOf(typeof body.placeId === "string" ? body.placeId : "");
  if (!code) return fail(400, "설치 코드를 입력해 주세요");
  if (!place) return fail(400, "키오스크를 놓을 자리를 골라 주세요");
  const res = await login(db, code, device, now, { placeId: place.id });
  if (!res.ok) {
    return res.reason === "locked" ? fail(429, "잠시 후 다시 시도해 주세요") : fail(401, "설치 코드가 맞지 않습니다");
  }
  return { ...ok({ placeId: place.id, placeLabel: place.label }), token: res.token };
}

/**
 * QR 을 찍거나 번호를 넣어 패스를 연다. 키오스크와 안내데스크만 쓴다.
 * QR 값은 길어서 맞힐 수 없지만 번호는 여섯 자리라, 번호 입력은 확인된 기기에서만 받고 틀린 횟수를 센다.
 */
export async function resolveHandler(
  db: Db,
  session: Session | null,
  body: { scanned?: unknown; passNo?: unknown; purpose?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  if (!session || !(session.isKiosk || session.isDesk)) return fail(403, NEED_KIOSK);

  let found: PassLookup;
  if (typeof body.scanned === "string" && body.scanned.trim()) {
    found = await lookupPass(db, body.scanned, now);
  } else {
    if (await isLocked(db, device, "number_fail", now)) {
      return fail(429, "번호를 여러 번 잘못 넣었습니다. 잠시 후 다시 해 주세요");
    }
    const passNo = cleanPassNo(body.passNo);
    if (!passNo) return fail(400, "패스 번호 여섯 자리를 넣어 주세요");
    const res = await resolvePassNo(db, passNo);
    if (res.kind !== "active") {
      await logAccess(db, { at: now, zoneId: session.zoneId, deviceKey: device, action: "number_fail" });
      return fail(404, NOT_A_PASS);
    }
    const journey = await getJourney(db, res.registrationId, now);
    // 출발했지만 아직 지워지지 않은 패스의 번호도 없는 번호와 똑같이 답한다. 번호로는 끝난 패스가 있었는지 알려 주지 않는다.
    // 여객의 잘못이 아니므로 틀린 횟수로는 세지 않는다.
    if (!journey || isJourneyOver(journey, now)) return fail(404, NOT_A_PASS);
    found = { kind: "ok", journey, passNo: res.pass.passNo, token: res.pass.token };
  }
  if (found.kind === "none") return fail(404, NOT_A_PASS);
  if (found.kind === "ended") return fail(410, PASS_ENDED);

  const place = session.isKiosk ? placeOf(session.placeId) : null;
  if (body.purpose === "guide" && session.isKiosk) {
    await logEvent(db, {
      at: now,
      kind: "guide_open",
      route: "kiosk",
      adapted: isAdapted(found.journey.choices),
      placeId: session.placeId,
      deviceKey: device,
    });
  }
  const poll = pollState(await lastSuccessfulPoll(db), now);
  // QR 값(token)은 스티커를 다시 뽑을 때 쓴다. 확인된 기기에만 돌려준다.
  return ok({ token: found.token, guide: buildGuide(found.journey, found.passNo, place, poll) });
}

/** 여객이 「직원 부르기」를 눌렀다. 패스를 찍은 뒤라면 그 패스를 붙여, 직원이 고른 항목을 보고 오게 한다. */
export async function callHandler(
  db: Db,
  session: Session | null,
  body: { token?: unknown; screen?: unknown },
  now: Date,
): Promise<ApiResult> {
  if (!session?.isKiosk || !session.placeId) return fail(403, NEED_KIOSK);
  const found = typeof body.token === "string" && body.token ? await lookupPass(db, body.token, now) : null;
  const call = await createCall(
    db,
    session.placeId,
    found?.kind === "ok" ? found.journey.registrationId : null,
    body.screen === "register" ? "register" : "guide",
    now,
  );
  if (!call) return fail(400, "이 키오스크의 자리를 찾을 수 없습니다. 다시 설치해 주세요");
  return ok({ id: call.id, state: call.state });
}

export async function callStateHandler(db: Db, session: Session | null, id: string): Promise<ApiResult> {
  if (!session?.isKiosk || !session.placeId) return fail(403, NEED_KIOSK);
  const call = await getCallAt(db, id, session.placeId);
  if (!call) return fail(404, "호출을 찾을 수 없습니다");
  return ok({ id: call.id, state: call.state });
}

export async function callCancelHandler(db: Db, session: Session | null, id: string, now: Date): Promise<ApiResult> {
  if (!session?.isKiosk || !session.placeId) return fail(403, NEED_KIOSK);
  await cancelCall(db, id, session.placeId, now);
  const call = await getCallAt(db, id, session.placeId);
  if (!call) return fail(404, "호출을 찾을 수 없습니다");
  return ok({ id: call.id, state: call.state });
}
