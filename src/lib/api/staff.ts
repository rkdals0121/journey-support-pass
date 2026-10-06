import { isLocked, logAccess, login, switchZone, type Session } from "../auth";
import type { Db } from "../db";
import { endEncounter, getCase, listAll, listForZone, recordScan, startEncounter } from "../encounters";
import { lastSuccessfulPoll } from "../flights/ingest";
import { extractToken, resolvePassNo, resolveToken } from "../passes";
import { pollState } from "../timing";
import { getZone, listWorkZones, TERMINAL_LABEL } from "../zones";
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
  return {
    ...ok({ zoneLabel: res.zoneLabel, isDesk: res.session.isDesk, needsZone: res.session.needsZone }),
    token: res.token,
  };
}

const NEEDS_ZONE = "근무 구역을 먼저 골라 주세요";

/** 근무 구역 고르기 화면에 쓸 목록. 터미널별로 묶어 보낸다. */
export async function zonesHandler(db: Db, session: Session | null): Promise<ApiResult> {
  if (!session) return fail(401, "로그인이 필요합니다");
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
  if (!session) return fail(401, "로그인이 필요합니다");
  if (!session.canSwitch) return fail(403, "구역을 바꿀 수 없는 접속 코드입니다");
  const res = await switchZone(db, session, typeof body.zoneId === "string" ? body.zoneId : "");
  if (!res.ok) return fail(400, "고를 수 없는 구역입니다");
  return { ...ok({ zoneLabel: res.zoneLabel }), token: res.token };
}

async function poll(db: Db, now: Date) {
  return pollState(await lastSuccessfulPoll(db), now);
}

const LIST_LOG_GAP_MIN = 10;

// 전체 목록은 30초마다 다시 읽는다. 읽을 때마다 남기면 기록이 넘치므로 같은 기기는 10분에 한 번만 남긴다.
async function logListView(db: Db, session: Session, device: string, now: Date) {
  const since = new Date(now.getTime() - LIST_LOG_GAP_MIN * 60_000);
  const [recent] = await db.query(
    "select 1 from access_logs where device_key = $1 and action = 'list_view' and at > $2 limit 1",
    [device, since],
  );
  if (!recent) await logAccess(db, { at: now, zoneId: session.zoneId, deviceKey: device, action: "list_view" });
}

/**
 * 직원 목록. 기본은 내 구역(탑승구가 내 구역에 속한 여객)만 보낸다.
 * scope 가 all 이면 다른 구역의 여객도 others 에 담아 보낸다. 이름이나 편명으로 찾을 때 쓴다.
 */
export async function listHandler(
  db: Db,
  session: Session | null,
  scope: "zone" | "all",
  device: string,
  now: Date,
): Promise<ApiResult> {
  if (!session) return fail(401, "로그인이 필요합니다");
  if (session.needsZone) return fail(409, NEEDS_ZONE);
  const [zone, list, everyone, pollInfo] = await Promise.all([
    getZone(db, session.zoneId),
    listForZone(db, session.zoneId, now),
    listAll(db, now),
    poll(db, now),
  ]);
  const mine = new Set([...list.assigned, ...list.gateUnknown].map((c) => c.registrationId));
  const others = everyone.filter((c) => !mine.has(c.registrationId));
  if (scope === "all" && others.length > 0) await logListView(db, session, device, now);
  return ok({
    zoneLabel: zone?.label ?? "",
    isDesk: session.isDesk,
    canSwitch: session.canSwitch,
    poll: pollInfo,
    assigned: list.assigned.map(toCaseDto),
    gateUnknown: list.gateUnknown.map(toCaseDto),
    // 이름은 요청했을 때만 보낸다. 건수는 늘 보내 다른 구역에 여객이 있는지 알 수 있게 한다.
    otherCount: others.length,
    others: scope === "all" ? others.map(toCaseDto) : [],
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
  if (session.needsZone) return fail(409, NEEDS_ZONE);

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
  if (session.needsZone) return fail(409, NEEDS_ZONE);
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
  | { kind: "pick_zone" }
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
  if (session.needsZone) return { kind: "pick_zone" };
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
