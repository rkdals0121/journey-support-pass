import { logAccess, type Session } from "../auth";
import { labelsIn, NEED_GROUPS } from "../catalog";
import type { Db } from "../db";
import { getFlight } from "../flights/search";
import {
  activePassOf,
  extractToken,
  generatePasses,
  idleTokenByPassNo,
  issuePass,
  linkPass,
  nextIdleToken,
  reissue,
} from "../passes";
import { todaySummary } from "../metrics";
import { eraseRegistration } from "../purge";
import {
  findActiveByNameAndFlight,
  findPendingByReceipt,
  getRegistration,
  isUuid,
  updateRegistration,
  type Registration,
} from "../registrations";
import { kstTime } from "../timing";
import { fail, ok, type ApiResult } from "./dto";
import { strings, submitRegistration, type RegisterBody } from "./public";

const LINK_ERRORS: Record<string, string> = {
  not_a_pass: "패스 QR이 아닙니다",
  no_such_pass_no: "쓸 수 있는 패스 번호가 아닙니다",
  pass_in_use: "이미 사용 중인 패스입니다",
  pass_revoked: "사용할 수 없는 패스입니다",
  registration_not_pending: "이미 패스가 연결된 등록입니다",
  registration_not_active: "패스가 연결된 등록이 아닙니다",
  no_idle_pass: "미사용 패스가 없습니다. 패스를 더 만들어 주세요",
};

// 자동 배정에서 두 안내데스크가 같은 패스를 집었을 때 다음 패스로 다시 해 보는 횟수.
const AUTO_RETRIES = 3;

/** 스캔한 QR, 또는 카메라를 못 쓸 때 손으로 넣은 패스 번호에서 토큰을 얻는다. */
async function tokenFrom(db: Db, body: { scanned?: unknown; passNo?: unknown; auto?: unknown }) {
  // 자동 배정: 번호가 가장 작은 미사용 패스를 쓴다. 직원은 화면에 뜬 번호의 패스를 건넨다.
  // 미리 만들어 둔 패스가 없으면 새로 만든다. 패스가 모자라서 발급이 막히는 일이 없다.
  if (body.auto === true) {
    const token = (await nextIdleToken(db)) ?? (await generatePasses(db, 1))[0].token;
    return { token, error: LINK_ERRORS.no_idle_pass };
  }
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
    // 지금 연결된 패스의 번호. 패스의 주소(토큰)는 화면으로 보내지 않는다. 인쇄 화면이 서버에서 직접 읽는다.
    passNo: (await activePassOf(db, r.id))?.passNo ?? null,
    name: r.name ?? "",
    flightNo: r.flightNo ?? "",
    destName: flight?.destName ?? "",
    timeLabel: flight ? kstTime(flight.estAt ?? flight.schedAt) : "",
    categories: labelsIn(r.categories, "category"),
    needs: NEED_GROUPS.flatMap((g) => labelsIn(r.needs, g)),
    // 고치기 화면을 채울 때 쓴다.
    flightDate: r.flightDate ?? "",
    categoryCodes: r.categories,
    needCodes: r.needs,
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
  body: { registrationId?: unknown; scanned?: unknown; passNo?: unknown; auto?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  if (!isUuid(body.registrationId)) return fail(400, "등록을 먼저 선택해 주세요");
  let { token, error } = await tokenFrom(db, body);
  if (!token) return fail(400, error);

  let res = await linkPass(db, token, body.registrationId, now);
  for (let i = 0; i < AUTO_RETRIES && body.auto === true && !res.ok && res.error === "pass_in_use"; i++) {
    ({ token, error } = await tokenFrom(db, body));
    if (!token) return fail(400, error);
    res = await linkPass(db, token, body.registrationId, now);
  }
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
  // 대신 등록도 마치는 즉시 패스를 만든다. 직원은 이어서 그 패스를 인쇄해 건넨다.
  const pass = await issuePass(db, res.registration.id, now);
  if (!pass.ok) return fail(500, "패스를 만들지 못했습니다. 잠시 후 다시 시도해 주세요");
  return ok(await summary(db, res.registration));
}

/**
 * 여객의 QR 을 찍거나 목록에서 고른 등록의 내용을 안내데스크에 띄운다. 패스 인쇄, 고치기, 재발급, 취소의 출발점이다.
 */
export async function getHandler(
  db: Db,
  session: Session | null,
  body: { registrationId?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  const reg = isUuid(body.registrationId) ? await getRegistration(db, body.registrationId) : null;
  if (!reg || (reg.status !== "pending" && reg.status !== "active")) return fail(404, "등록을 찾을 수 없습니다");
  await logAccess(db, {
    at: now,
    zoneId: session!.zoneId,
    deviceKey: device,
    action: "receipt_view",
    registrationId: reg.id,
  });
  return ok(await summary(db, reg));
}

/** registrationId 가 없으면 후보를 찾고, 있으면 그 등록에 새 패스를 연결한다. */
export async function reissueHandler(
  db: Db,
  session: Session | null,
  body: {
    name?: unknown;
    flightNo?: unknown;
    registrationId?: unknown;
    scanned?: unknown;
    passNo?: unknown;
    auto?: unknown;
  },
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
  let { token, error } = await tokenFrom(db, body);
  if (!token) return fail(400, error);
  let res = await reissue(db, body.registrationId, token, now);
  for (let i = 0; i < AUTO_RETRIES && body.auto === true && !res.ok && res.error === "pass_in_use"; i++) {
    ({ token, error } = await tokenFrom(db, body));
    if (!token) return fail(400, error);
    res = await reissue(db, body.registrationId, token, now);
  }
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
  flight_date: string | null;
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
export async function deskListHandler(
  db: Db,
  session: Session | null,
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  // 여러 여객의 이름이 한꺼번에 보이는 화면이다. 누가 언제 열었는지 남긴다.
  await logAccess(db, { at: now, zoneId: session!.zoneId, deviceKey: device, action: "list_view" });

  const rows = await db.query<DeskRow>(
    `select r.id, r.receipt_no, r.name, r.flight_no, r.flight_date::text as flight_date, r.categories, r.needs, r.status, r.submitted_at,
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
    flightDate: r.flight_date ?? "",
    categoryCodes: r.categories,
    needCodes: r.needs,
    receiptNo: r.receipt_no,
    passNo: r.pass_no,
    submittedLabel: kstTime(r.submitted_at),
  });
  const [{ idle }] = await db.query<{ idle: number }>(
    "select count(*)::int as idle from passes where state = 'idle'",
  );
  return ok({
    idlePasses: idle,
    pending: rows.filter((r) => r.status === "pending").map(item),
    active: rows.filter((r) => r.status === "active").map(item),
  });
}

/**
 * 잘못 등록했거나 여객이 원하지 않을 때 등록을 취소한다.
 * 출발 후 삭제와 같은 방식으로 사람을 알 수 있는 값을 지우고, 연결된 패스는 끝낸다(다시 쓰지 않는다).
 * 등록 내용을 고치는 기능은 따로 두지 않는다. 취소하고 다시 등록한다.
 */
export async function cancelHandler(
  db: Db,
  session: Session | null,
  body: { registrationId?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  const reg = isUuid(body.registrationId) ? await getRegistration(db, body.registrationId) : null;
  if (!reg || (reg.status !== "pending" && reg.status !== "active")) {
    return fail(404, "취소할 수 있는 등록이 아닙니다");
  }
  await eraseRegistration(db, reg.id, reg.needs, reg.categories, null, now, "revoked");
  await logAccess(db, { at: now, zoneId: session!.zoneId, deviceKey: device, action: "cancel" });
  return ok({ ok: true });
}

/**
 * 등록 내용 고치기. 이름을 잘못 적었거나 편이 바뀌었을 때 취소하고 다시 등록하지 않아도 된다.
 * 패스가 이미 연결되어 있으면 패스는 그대로 두고 내용만 바꾼다.
 */
export async function updateHandler(
  db: Db,
  session: Session | null,
  body: RegisterBody & { registrationId?: unknown },
  device: string,
  now: Date,
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  if (!isUuid(body.registrationId)) return fail(400, "등록을 먼저 선택해 주세요");
  const res = await updateRegistration(db, body.registrationId, {
    name: typeof body.name === "string" ? body.name : "",
    flightDate: typeof body.flightDate === "string" ? body.flightDate : "",
    flightNo: typeof body.flightNo === "string" ? body.flightNo : "",
    categories: strings(body.categories),
    needs: strings(body.needs),
  }, now);
  if (!res.ok) return fail(400, res.error);
  await logAccess(db, {
    at: now,
    zoneId: session!.zoneId,
    deviceKey: device,
    action: "edit",
    registrationId: body.registrationId,
  });
  return ok(await summary(db, res.registration));
}

/** 오늘 현황. 건수와 가운데값뿐이라 조회 기록은 남기지 않는다. */
export async function summaryHandler(db: Db, session: Session | null, now: Date): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  return ok({ ...(await todaySummary(db, now)) });
}

const MAX_NEW_PASSES = 50;

/** 미사용 패스를 더 만든다. 패스는 일회용이라 쓸수록 줄어든다. */
export async function morePassesHandler(
  db: Db,
  session: Session | null,
  body: { count?: unknown },
): Promise<ApiResult> {
  const denied = guard(session);
  if (denied) return denied;
  const count = typeof body.count === "number" && Number.isInteger(body.count) ? body.count : 0;
  if (count < 1 || count > MAX_NEW_PASSES) return fail(400, `한 번에 1~${MAX_NEW_PASSES}장까지 만들 수 있습니다`);
  const made = await generatePasses(db, count);
  return ok({ ok: true, made: made.length });
}
