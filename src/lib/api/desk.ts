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

interface DeskRow {
  id: string;
  receipt_no: string | null;
  name: string | null;
  flight_no: string | null;
  categories: string[];
  needs: string[];
  status: "pending" | "active";
  submitted_at: Date;
  pass_no: string | null;
  dest_name: string | null;
  depart_at: Date | null;
}

/**
 * 안내데스크용 등록 목록. 패스 연결을 기다리는 등록과 패스가 연결된 등록을 모두 보여준다.
 * 여객이 접수 번호를 잊었거나 패스를 잃어버렸을 때 여기서 찾는다.
 */
export async function deskListHandler(db: Db, session: Session | null): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;

  const rows = await db.query<DeskRow>(
    `select r.id, r.receipt_no, r.name, r.flight_no, r.categories, r.needs, r.status, r.submitted_at,
            p.pass_no, f.dest_name, coalesce(f.est_at, f.sched_at) as depart_at
     from registrations r
     left join passes p on p.registration_id = r.id and p.state = 'active'
     left join flights f on f.flight_date = r.flight_date and f.flight_no = r.flight_no
     where r.status in ('pending', 'active')
     order by r.submitted_at desc
     limit 200`,
  );
  const item = (r: DeskRow) => ({
    registrationId: r.id,
    name: r.name ?? "",
    flightNo: r.flight_no ?? "",
    destName: r.dest_name ?? "",
    timeLabel: r.depart_at ? kstTime(r.depart_at) : "",
    categories: labelsIn(r.categories, "category"),
    needs: NEED_GROUPS.flatMap((g) => labelsIn(r.needs, g)),
    receiptNo: r.receipt_no,
    passNo: r.pass_no,
    submittedLabel: kstTime(r.submitted_at),
  });
  return ok({
    pending: rows.filter((r) => r.status === "pending").map(item),
    active: rows.filter((r) => r.status === "active").map(item),
  });
}
