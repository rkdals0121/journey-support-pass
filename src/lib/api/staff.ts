import { placeOf } from "../airport";
import { login, logAccess, switchZone, type Session } from "../auth";
import { acceptCall, endReason, finishCall, listCalls, type Call, type CallEndReason } from "../calls";
import { shortOf } from "../catalog";
import type { Db } from "../db";
import { toFlightView, type FlightView } from "../guide";
import { getJourney, isJourneyOver } from "../journey";
import { todaySummary } from "../metrics";
import { eraseRegistration } from "../purge";
import { kstTime } from "../timing";
import { listWorkZones, TERMINAL_LABEL } from "../zones";
import { fail, ok, zoneName, type ApiResult } from "./dto";
import { lookupPass, NOT_A_PASS } from "./public";

export async function loginHandler(
  db: Db,
  body: { code?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult & { token?: string }> {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return fail(400, "접속 코드를 입력해 주세요");
  const res = await login(db, code, device, now);
  if (!res.ok) {
    return res.reason === "locked"
      ? fail(429, "잠시 후 다시 시도해 주세요")
      : fail(401, "접속 코드가 맞지 않습니다");
  }
  return {
    ...ok({ zoneLabel: res.zoneLabel, isDesk: res.session.isDesk, needsZone: res.session.needsZone }),
    token: res.token,
  };
}

const NEEDS_ZONE = "근무 구역을 먼저 골라 주세요";

/** 직원 화면을 쓸 수 있는 세션인가. 키오스크 기기는 직원 화면을 열 수 없다. */
function staffError(session: Session | null): ApiResult | null {
  if (!session || session.isKiosk) return fail(401, "로그인이 필요합니다");
  if (session.needsZone) return fail(409, NEEDS_ZONE);
  return null;
}

/** 근무 구역 고르기 화면에 쓸 목록. 터미널별로 묶어 보낸다. */
export async function zonesHandler(db: Db, session: Session | null): Promise<ApiResult> {
  if (!session || session.isKiosk) return fail(401, "로그인이 필요합니다");
  if (!session.canSwitch) return fail(403, "구역을 바꿀 수 없는 접속 코드입니다");
  const zones = await listWorkZones(db);
  const terminals = [...new Set(zones.map((z) => z.terminal))];
  return ok({
    current: session.needsZone ? null : session.zoneId,
    groups: terminals.map((t) => ({
      terminal: TERMINAL_LABEL[t] ?? t,
      zones: zones.filter((z) => z.terminal === t).map((z) => ({ id: z.id, label: z.label })),
    })),
  });
}

export async function switchZoneHandler(
  db: Db,
  session: Session | null,
  body: { zoneId?: unknown },
): Promise<ApiResult & { token?: string }> {
  if (!session || session.isKiosk) return fail(401, "로그인이 필요합니다");
  if (!session.canSwitch) return fail(403, "구역을 바꿀 수 없는 접속 코드입니다");
  const res = await switchZone(db, session, typeof body.zoneId === "string" ? body.zoneId : "");
  if (!res.ok) return fail(400, "고를 수 없는 구역입니다");
  return { ...ok({ zoneLabel: res.zoneLabel }), token: res.token };
}

/** 직원 화면에 보여줄 호출 한 건. 직원 개인은 없고 구역만 있다. */
export interface CallDto {
  id: string;
  state: Call["state"];
  /** 끝난 까닭. 도움 마침(done), 여객이 거둠(cancelled), 아무도 받지 않아 시간이 지나 닫힘(expired). 끝나지 않았으면 null. */
  endReason: CallEndReason | null;
  /** 어느 키오스크에서 불렀는가. */
  place: string;
  /** 내 구역의 키오스크에서 온 호출인가. */
  mine: boolean;
  /** 등록하다가 불렀는지, 안내를 보다가 불렀는지. */
  screen: Call["screen"];
  time: string; // 누른 시각 14:35
  waitedMin: number; // 누른 뒤 지난 시간. 끝난 호출은 끝날 때까지 걸린 시간
  /** 받은 구역 이름. 아직 아무도 받지 않았으면 null. */
  acceptedBy: string | null;
  acceptedByMe: boolean;
  /** 여객이 패스를 찍고 불렀을 때만. 여객이 고른 항목과 항공편. */
  pass: { choices: string[]; lang: "ko" | "en"; flight: FlightView } | null;
}

export async function callsHandler(db: Db, session: Session | null, now: Date): Promise<ApiResult> {
  const denied = staffError(session);
  if (denied) return denied;
  const me = session as Session;

  const calls = await listCalls(db, now);
  const zones = await db.query<{ id: string; label: string }>("select id, label from zones");
  const labelOf = (id: string | null) => (id ? zoneName(zones.find((z) => z.id === id)?.label ?? "") : "");

  const list: CallDto[] = [];
  for (const c of calls) {
    // 이미 떠난 여객의 항공편과 고른 항목은 삭제 작업이 돌기 전이라도 보여주지 않는다.
    const found = c.registrationId ? await getJourney(db, c.registrationId, now) : null;
    const journey = found && !isJourneyOver(found, now) ? found : null;
    const end = c.endedAt ?? now;
    list.push({
      id: c.id,
      state: c.state,
      endReason: endReason(c),
      place: placeOf(c.placeId)?.label ?? c.placeId,
      mine: c.zoneId === me.zoneId,
      screen: c.screen,
      time: kstTime(c.createdAt),
      waitedMin: Math.max(0, Math.floor((end.getTime() - c.createdAt.getTime()) / 60_000)),
      acceptedBy: c.acceptedZone ? labelOf(c.acceptedZone) : null,
      acceptedByMe: c.acceptedZone === me.zoneId,
      pass: journey
        ? { choices: journey.choices.map(shortOf), lang: journey.lang, flight: toFlightView(journey) }
        : null,
    });
  }
  return ok({
    calls: list,
    zoneLabel: labelOf(me.zoneId),
    isDesk: me.isDesk,
    canSwitch: me.canSwitch,
  });
}

/** 직원이 호출을 받거나("가겠습니다") 마친다. 어느 구역 직원이든 할 수 있다. */
export async function callActionHandler(
  db: Db,
  session: Session | null,
  id: string,
  body: { action?: unknown },
  now: Date,
): Promise<ApiResult> {
  const denied = staffError(session);
  if (denied) return denied;
  const me = session as Session;
  if (body.action === "accept") {
    if (!(await acceptCall(db, id, me.zoneId, now))) return fail(409, "다른 직원이 먼저 받았거나 끝난 호출입니다");
    return ok();
  }
  if (body.action === "done") {
    if (!(await finishCall(db, id, me.zoneId, now))) return fail(409, "이미 끝난 호출입니다");
    return ok();
  }
  return fail(400, "할 수 없는 동작입니다");
}

/** 안내데스크의 오늘 현황. 건수만 있다. */
export async function summaryHandler(db: Db, session: Session | null, now: Date): Promise<ApiResult> {
  const denied = staffError(session);
  if (denied) return denied;
  if (!session?.isDesk) return fail(403, "안내데스크 권한이 필요합니다");
  return ok({ summary: await todaySummary(db, now) });
}

/** 여객이 지워 달라고 하면 안내데스크에서 지운다. 먼저 여객의 QR 이나 번호로 패스를 찾아(resolve) 그 QR 값을 넘긴다. */
export async function deskEraseHandler(
  db: Db,
  session: Session | null,
  body: { token?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = staffError(session);
  if (denied) return denied;
  if (!session?.isDesk) return fail(403, "안내데스크 권한이 필요합니다");
  const found = await lookupPass(db, typeof body.token === "string" ? body.token : "", now);
  if (found.kind === "none") return fail(404, NOT_A_PASS);
  if (found.kind === "ok") {
    await logAccess(db, {
      at: now,
      zoneId: session.zoneId,
      deviceKey: device,
      action: "cancel",
      registrationId: found.journey.registrationId,
    });
    await eraseRegistration(db, found.journey.registrationId, now, "revoked");
  }
  return ok({ erased: true });
}
