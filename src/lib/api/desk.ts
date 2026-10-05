import { logAccess, type Session } from "../auth";
import { labelsIn, NEED_GROUPS } from "../catalog";
import type { Db } from "../db";
import { getFlight } from "../flights/search";
import { extractToken, idleTokenByPassNo, linkPass, reissue } from "../passes";
import {
  findActiveByNameAndFlight,
  findPendingByReceipt,
  getRegistration,
  isUuid,
  type Registration,
} from "../registrations";
import { kstTime } from "../timing";
import { fail, ok, type ApiResult } from "./dto";
import { submitRegistration, type RegisterBody } from "./public";

const LINK_ERRORS: Record<string, string> = {
  not_a_pass: "패스 QR이 아닙니다",
  no_such_pass_no: "쓸 수 있는 패스 번호가 아닙니다",
  pass_in_use: "이미 사용 중인 패스입니다",
  pass_revoked: "사용할 수 없는 패스입니다",
  registration_not_pending: "이미 패스가 연결된 등록입니다",
  registration_not_active: "패스가 연결된 등록이 아닙니다",
};

/** 스캔한 QR, 또는 카메라를 못 쓸 때 손으로 넣은 패스 번호에서 토큰을 얻는다. */
async function tokenFrom(db: Db, body: { scanned?: unknown; passNo?: unknown }) {
  if (typeof body.passNo === "string") {
    const token = await idleTokenByPassNo(db, body.passNo.trim());
    return { token, error: LINK_ERRORS.no_such_pass_no };
  }
  const token = typeof body.scanned === "string" ? extractToken(body.scanned) : null;
  return { token, error: LINK_ERRORS.not_a_pass };
}

function guard(session: Session | null): ApiResult | null {
  if (!session) return fail(401, "로그인이 필요합니다");
  if (!session.isDesk) return fail(403, "안내데스크에서만 쓸 수 있습니다");
  return null;
}

async function summary(db: Db, r: Registration) {
  const flight = r.flightDate && r.flightNo ? await getFlight(db, r.flightDate, r.flightNo) : null;
  return {
    registrationId: r.id,
    name: r.name ?? "",
    flightNo: r.flightNo ?? "",
    destName: flight?.destName ?? "",
    timeLabel: flight ? kstTime(flight.estAt ?? flight.schedAt) : "",
    categories: labelsIn(r.categories, "category"),
    needs: NEED_GROUPS.flatMap((g) => labelsIn(r.needs, g)),
  };
}

/** 여객이 보여준 접수 번호로 등록 내용을 띄운다. 직원이 여객 화면과 대조한다. */
export async function receiptHandler(
  db: Db,
  session: Session | null,
  body: { receiptNo?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  const reg = await findPendingByReceipt(db, typeof body.receiptNo === "string" ? body.receiptNo.trim() : "");
  if (!reg) return fail(404, "접수 번호를 찾을 수 없습니다");
  await logAccess(db, {
    at: now,
    zoneId: session!.zoneId,
    deviceKey: device,
    action: "receipt_view",
    registrationId: reg.id,
  });
  return ok(await summary(db, reg));
}

export async function linkHandler(
  db: Db,
  session: Session | null,
  body: { registrationId?: unknown; scanned?: unknown; passNo?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  if (!isUuid(body.registrationId)) return fail(400, "등록을 먼저 선택해 주세요");
  const { token, error } = await tokenFrom(db, body);
  if (!token) return fail(400, error);

  const res = await linkPass(db, token, body.registrationId, now);
  if (!res.ok) return fail(400, LINK_ERRORS[res.error]);
  await logAccess(db, {
    at: now,
    zoneId: session!.zoneId,
    deviceKey: device,
    action: "link",
    registrationId: body.registrationId,
  });
  return ok({ ok: true, passNo: res.passNo });
}

/** 종이 체크리스트를 옮겨 적거나 직원이 대신 입력한다. 접수 번호 없이 바로 패스 연결로 넘어간다. */
export async function deskRegisterHandler(
  db: Db,
  session: Session | null,
  body: RegisterBody & { route?: unknown },
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  if (body.route !== "paper" && body.route !== "assisted") return fail(400, "등록 방법을 골라 주세요");
  const res = await submitRegistration(db, body, body.route, now);
  if (!res.ok) return fail(400, res.error);
  return ok(await summary(db, res.registration));
}

/** registrationId 가 없으면 후보를 찾고, 있으면 그 등록에 새 패스를 연결한다. */
export async function reissueHandler(
  db: Db,
  session: Session | null,
  body: { name?: unknown; flightNo?: unknown; registrationId?: unknown; scanned?: unknown; passNo?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;

  if (body.registrationId === undefined) {
    const name = typeof body.name === "string" ? body.name : "";
    const flightNo = typeof body.flightNo === "string" ? body.flightNo : "";
    if (!name.trim() || !flightNo.trim()) return fail(400, "이름과 편명을 입력해 주세요");
    const found = await findActiveByNameAndFlight(db, name, flightNo);
    return ok({ candidates: await Promise.all(found.map((r) => summary(db, r))) });
  }

  if (!isUuid(body.registrationId) || !(await getRegistration(db, body.registrationId))) {
    return fail(400, "등록을 먼저 선택해 주세요");
  }
  const { token, error } = await tokenFrom(db, body);
  if (!token) return fail(400, error);
  const res = await reissue(db, body.registrationId, token, now);
  if (!res.ok) return fail(400, LINK_ERRORS[res.error]);
  await logAccess(db, {
    at: now,
    zoneId: session!.zoneId,
    deviceKey: device,
    action: "reissue",
    registrationId: body.registrationId,
  });
  return ok({ ok: true, passNo: res.passNo });
}
