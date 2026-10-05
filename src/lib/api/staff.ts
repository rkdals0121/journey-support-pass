import { isLocked, logAccess, login, type Session } from "../auth";
import type { Db } from "../db";
import { endEncounter, getCase, listForZone, recordScan, startEncounter } from "../encounters";
import { lastSuccessfulPoll } from "../flights/ingest";
import { extractToken, resolvePassNo, resolveToken } from "../passes";
import { pollState } from "../timing";
import { getZone } from "../zones";
import { fail, ok, toCaseDto, type ApiResult } from "./dto";

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
  return { ...ok({ zoneLabel: res.zoneLabel, isDesk: res.session.isDesk }), token: res.token };
}

async function poll(db: Db, now: Date) {
  return pollState(await lastSuccessfulPoll(db), now);
}

export async function listHandler(db: Db, session: Session | null, now: Date): Promise<ApiResult> {
  if (!session) return fail(401, "로그인이 필요합니다");
  const [zone, list, pollInfo] = await Promise.all([
    getZone(db, session.zoneId),
    listForZone(db, session.zoneId, now),
    poll(db, now),
  ]);
  return ok({
    zoneLabel: zone?.label ?? "",
    isDesk: session.isDesk,
    poll: pollInfo,
    assigned: list.assigned.map(toCaseDto),
    gateUnknown: list.gateUnknown.map(toCaseDto),
  });
}

/** QR 스캔 결과 또는 손으로 입력한 패스 번호로 등록을 찾는다. */
export async function resolveHandler(
  db: Db,
  session: Session | null,
  body: { scanned?: unknown; passNo?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  if (!session) return fail(401, "로그인이 필요합니다");

  if (typeof body.passNo === "string") {
    // 네 자리는 조합이 적다. 틀린 입력이 쌓이면 맞는 번호도 받지 않는다.
    if (await isLocked(db, device, "number_fail", now)) return fail(429, "잠시 후 다시 시도해 주세요");
    const res = await resolvePassNo(db, body.passNo.trim());
    if (res.kind !== "active") {
      await logAccess(db, { at: now, zoneId: session.zoneId, deviceKey: device, action: "number_fail" });
      return ok({ kind: "unknown" });
    }
    await logAccess(db, {
      at: now,
      zoneId: session.zoneId,
      deviceKey: device,
      action: "number_view",
      registrationId: res.registrationId,
    });
    return ok({ kind: "active", registrationId: res.registrationId });
  }

  const token = typeof body.scanned === "string" ? extractToken(body.scanned) : null;
  if (!token) return ok({ kind: "unknown" });
  const res = await resolveToken(db, token);
  if (res.kind !== "active") return ok({ kind: res.kind });
  await logAccess(db, {
    at: now,
    zoneId: session.zoneId,
    deviceKey: device,
    action: "scan_view",
    registrationId: res.registrationId,
  });
  return ok({ kind: "active", registrationId: res.registrationId });
}

export async function caseHandler(db: Db, session: Session | null, id: string, now: Date): Promise<ApiResult> {
  if (!session) return fail(401, "로그인이 필요합니다");
  const c = await getCase(db, id, now);
  if (!c) return fail(404, "사용할 수 없는 패스입니다");
  const encounter = await recordScan(db, c.registrationId, session.zoneId, now);
  return ok({ case: toCaseDto(c), encounter, poll: await poll(db, now) });
}

export async function encounterHandler(
  db: Db,
  session: Session | null,
  id: string,
  body: { action?: unknown },
  now: Date,
): Promise<ApiResult> {
  if (!session) return fail(401, "로그인이 필요합니다");
  if (body.action === "start") return ok({ ok: await startEncounter(db, id, session.zoneId, now) });
  if (body.action === "end") return ok({ ok: await endEncounter(db, id, session.zoneId, now) });
  return fail(400, "알 수 없는 동작입니다");
}

export type TokenPage =
  | { kind: "staff_only" }
  | { kind: "case"; registrationId: string }
  | { kind: "desk_link"; token: string }
  | { kind: "idle" }
  | { kind: "unusable" };

/**
 * 패스 QR 주소(/p/{token})를 열었을 때 무엇을 보여줄지 정한다.
 * 로그인하지 않은 사람에게는 DB 를 조회하지 않고 같은 안내만 보여주어
 * 토큰이 실제로 있는지조차 드러나지 않게 한다.
 */
export async function decideTokenPage(
  db: Db,
  token: string,
  session: Session | null,
  device: string,
  now: Date,
): Promise<TokenPage> {
  if (!session) return { kind: "staff_only" };
  const res = await resolveToken(db, token);
  if (res.kind === "active") {
    await logAccess(db, {
      at: now,
      zoneId: session.zoneId,
      deviceKey: device,
      action: "scan_view",
      registrationId: res.registrationId,
    });
    return { kind: "case", registrationId: res.registrationId };
  }
  if (res.kind === "idle") return session.isDesk ? { kind: "desk_link", token } : { kind: "idle" };
  return { kind: "unusable" };
}
