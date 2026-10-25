import { createHash } from "node:crypto";
import { kstDate } from "./flights/normalize";
import { placeOf } from "./airport";
import type { Db } from "./db";
import { ipPart, type Session } from "./auth";
import { isUuid } from "./registrations";
import { knownCodes } from "./catalog";
import { lookupPass } from "./api/public";
import { notifyNewRequest } from "./staff-push";
import { fail, ok, type ApiResult } from "./api/dto";
import {
  OPEN_REQUEST_STATES,
  SERVICE_TYPES,
  type ServiceRequestView,
  type RequestState,
  type ServiceType,
  type RequestAction,
  type RequestSummary,
} from "./service-request-model";

const RECEIPT = /^[a-f0-9]{64}$/;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const validReceipt = (v: unknown): v is string =>
  typeof v === "string" && RECEIPT.test(v);
export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
interface Row {
  id: string;
  receipt_hash: string;
  registration_id: string | null;
  service: ServiceType;
  state: RequestState;
  place_id: string;
  choices: string[];
  party: number;
  note: string;
  lang: "ko" | "en";
  source: ServiceRequestView["source"];
  assigned_zone: string | null;
  reason: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  version: number;
}
function view(r: Row): ServiceRequestView {
  const place = placeOf(r.place_id);
  return {
    id: r.id,
    service: r.service,
    state: r.state,
    placeId: r.place_id,
    place: place?.label ?? "",
    placeEn: place?.labelEn ?? "",
    choices: r.choices,
    party: r.party,
    note: r.note,
    lang: r.lang,
    source: r.source,
    assignedZone: r.assigned_zone,
    reason: r.reason,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    version: r.version,
  };
}
export async function expireServiceRequests(db: Db, now: Date) {
  await db.query(
    "delete from request_push_subscriptions where expires_at <= $1",
    [now],
  );
  // A timeout is never a completed service. Pilot thresholds, not promised arrival times.
  await db.query(
    `update service_requests set state='expired',ended_at=$1,updated_at=$1,version=version+1,
 reason='응답 대기 시간이 지나 종료되었습니다. 가까운 안내데스크에 문의하거나 새로 요청해 주세요 / Timed out. Contact the nearest information desk or make a new request.'
 where expires_at>$1 and ((state='received' and created_at<=$2) or
 (state in ('assigned','en_route','arrived','serving') and updated_at<=$3))`,
    [
      now,
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() - 3 * 60 * 60 * 1000),
    ],
  );
  // Erase contents at the separate retention deadline.
  await db.query(
    `update service_requests set state=case when state in ('received','assigned','en_route','arrived','serving') then 'expired' else state end,
 registration_id=null, choices='{}', note='', device_key='', reason='', place_id='', party=1,
 ended_at=coalesce(ended_at,$1), updated_at=$1, version=version+1
 where expires_at <= $1 and (place_id<>'' or device_key<>'' or registration_id is not null or note<>'')`,
    [now],
  );
  await db.query("delete from service_request_limits where window_at < $1", [
    new Date(now.getTime() - REQUEST_TTL_MS),
  ]);
  await db.query("delete from service_requests where expires_at < $1", [
    new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
  ]);
}
async function receiptRow(db: Db, receipt: unknown): Promise<Row | undefined> {
  if (!validReceipt(receipt)) return undefined;
  return (
    await db.query<Row>(
      "select * from service_requests where receipt_hash=$1",
      [hash(receipt)],
    )
  )[0];
}
export async function createServiceRequest(
  db: Db,
  session: Session | null,
  body: Record<string, unknown>,
  device: string,
  now: Date,
): Promise<ApiResult> {
  await expireServiceRequests(db, now);
  if (!validReceipt(body.receipt))
    return fail(400, "접수 확인값을 다시 만들어 주세요");
  // Client keeps a random receipt across a network retry. Never issue a second request for that receipt.
  const previous = await receiptRow(db, body.receipt);
  if (previous)
    return previous.expires_at <= now
      ? fail(410, "보관 기간이 끝난 요청입니다")
      : ok({ request: view(previous) });
  if (body.consent !== true) return fail(400, "요청 정보 이용에 동의해 주세요");
  if (!SERVICE_TYPES.includes(body.service as ServiceType))
    return fail(400, "도움 종류를 골라 주세요");
  const place = placeOf(
    session?.isKiosk
      ? session.placeId
      : typeof body.placeId === "string"
        ? body.placeId
        : null,
  );
  if (!place) return fail(400, "현재 위치를 골라 주세요");
  if (
    typeof body.party !== "number" ||
    !Number.isInteger(body.party) ||
    body.party < 1 ||
    body.party > 20
  )
    return fail(400, "함께 도움받을 인원을 1~20명으로 확인해 주세요");
  const party = body.party;
  if (typeof body.note !== "string" || body.note.length > 200)
    return fail(400, "추가 말씀은 200자 이내로 적어 주세요");
  let choices = [
    ...new Set(
      knownCodes(
        Array.isArray(body.choices)
          ? body.choices.filter((v): v is string => typeof v === "string")
          : [],
      ),
    ),
  ];
  let registrationId: string | null = null;
  if (body.registrationToken !== undefined && body.registrationToken !== "") {
    const found = await lookupPass(
      db,
      typeof body.registrationToken === "string" ? body.registrationToken : "",
      now,
    );
    if (found.kind !== "ok")
      return fail(
        410,
        "사전등록을 불러올 수 없습니다. 새 요청으로 접수하거나 등록을 확인해 주세요",
      );
    registrationId = found.journey.registrationId;
    choices = Array.isArray(body.choices) ? choices : found.journey.choices;
  }
  const source = session?.isKiosk
    ? "kiosk"
    : session?.isDesk && body.assisted === true
      ? "assisted"
      : registrationId
        ? "preregistered"
        : "web";
  // Database claim avoids a check-then-insert race across concurrent server instances.
  const rows = await db.query<Row>(
    `with quota as (
 insert into service_request_limits(bucket,window_at,used)
 values($13,$14,1) on conflict(bucket,window_at) do update set used=service_request_limits.used+1
 where service_request_limits.used<20 returning used
 ) insert into service_requests(receipt_hash,registration_id,service,place_id,choices,party,note,lang,source,created_at,updated_at,expires_at,device_key)
 select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12 from quota
 on conflict do nothing returning *`,
    [
      hash(body.receipt),
      registrationId,
      body.service,
      place.id,
      choices,
      party,
      body.note.trim(),
      body.lang === "en" ? "en" : "ko",
      source,
      now,
      new Date(now.getTime() + REQUEST_TTL_MS),
      device,
      ipPart(device),
      new Date(Math.floor(now.getTime() / (10 * 60 * 1000)) * 10 * 60 * 1000),
    ],
  );
  if (!rows[0]) {
    const retry = await receiptRow(db, body.receipt);
    if (retry) return ok({ request: view(retry) });
    if (
      registrationId &&
      (
        await db.query(
          "select id from service_requests where registration_id=$1 and state in ('received','assigned','en_route','arrived','serving')",
          [registrationId],
        )
      ).length
    )
      return fail(
        409,
        "이 사전등록에는 진행 중인 요청이 있습니다. 기존 요청을 확인해 주세요",
      );
    return fail(429, "요청이 많습니다. 잠시 후 다시 시도해 주세요");
  }
  // Dispatch once on the successful insert; retries do not send duplicate alerts.
  // Push failure never changes the accepted request or its receipt.
  try {
    await notifyNewRequest(db, rows[0].id, now);
  } catch {
    /* Polling remains available. */
  }
  return ok({ request: view(rows[0]) });
}
export async function serviceRequestStatus(
  db: Db,
  receipt: unknown,
  now: Date,
): Promise<ApiResult> {
  await expireServiceRequests(db, now);
  const r = await receiptRow(db, receipt);
  if (!r) return fail(404, "요청을 찾을 수 없습니다");
  if (r.expires_at <= now)
    return fail(
      410,
      "보관 기간이 끝난 요청입니다. 필요하면 새로 요청해 주세요",
    );
  return ok({ request: view(r) });
}
export async function cancelServiceRequest(
  db: Db,
  receipt: unknown,
  now: Date,
): Promise<ApiResult> {
  await expireServiceRequests(db, now);
  const r = await receiptRow(db, receipt);
  if (!r) return fail(404, "요청을 찾을 수 없습니다");
  if (r.expires_at <= now) return fail(410, "보관 기간이 끝난 요청입니다");
  if (r.state === "cancelled") return ok({ request: view(r) });
  const rows = await db.query<Row>(
    `update service_requests set state='cancelled',ended_at=$2,updated_at=$2,version=version+1
 where id=$1 and state in ('received','assigned','en_route','arrived') returning *`,
    [r.id, now],
  );
  return rows[0]
    ? ok({ request: view(rows[0]) })
    : fail(
        409,
        "지원이 시작되었거나 끝난 요청입니다. 현장 직원에게 말씀해 주세요",
      );
}
function staffDenied(s: Session | null): ApiResult | null {
  if (!s || s.isKiosk) return fail(401, "직원 로그인이 필요합니다");
  if (s.needsZone) return fail(409, "근무 구역을 먼저 골라 주세요");
  return null;
}
export async function listServiceRequests(
  db: Db,
  s: Session | null,
  now: Date,
): Promise<ApiResult> {
  const denied = staffDenied(s);
  if (denied) return denied;
  await expireServiceRequests(db, now);
  const rows = await db.query<Row>(
    `select * from service_requests where expires_at>$1 and
 (state in ('received','assigned','en_route','arrived','serving') or ended_at>$2) order by (state in ('received','assigned','en_route','arrived','serving')) desc, created_at asc limit 200`,
    [now, new Date(now.getTime() - 30 * 60 * 1000)],
  );
  const [summary] = await db.query<RequestSummary>(
    `select
 count(*) filter(where state='received')::int as received,
 count(*) filter(where state in ('received','assigned','en_route','arrived','serving'))::int as active,
 count(*) filter(where state='done')::int as done,
 count(*) filter(where state='cancelled')::int as cancelled,
 count(*) filter(where state='unavailable')::int as unavailable,
 count(*) filter(where state='expired')::int as expired,
 (percentile_cont(.5) within group(order by extract(epoch from (accepted_at-created_at))) filter(where accepted_at is not null))::int as "medianAcceptSec",
 (percentile_cont(.5) within group(order by extract(epoch from (arrived_at-accepted_at))) filter(where arrived_at is not null and accepted_at is not null))::int as "medianArrivalSec"
 from service_requests where created_at >= $1`,
    [new Date(`${kstDate(now)}T00:00:00+09:00`)],
  );
  const zones = await db.query<{ id: string; label: string }>(
    "select id,label from zones where is_kiosk=false",
  );
  return ok({
    requests: rows.map(view),
    zoneId: s!.zoneId,
    isDesk: s!.isDesk,
    summary,
    zoneLabels: Object.fromEntries(zones.map((z) => [z.id, z.label])),
  });
}
const transitions: Record<string, { from: RequestState; to: RequestState }> = {
  assign: { from: "received", to: "assigned" },
  travel: { from: "assigned", to: "en_route" },
  arrive: { from: "en_route", to: "arrived" },
  serve: { from: "arrived", to: "serving" },
  complete: { from: "serving", to: "done" },
};
export async function actOnServiceRequest(
  db: Db,
  s: Session | null,
  id: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  const denied = staffDenied(s);
  if (denied) return denied;
  await expireServiceRequests(db, now);
  if (!isUuid(id) || !Number.isInteger(body.version))
    return fail(400, "요청을 다시 불러와 주세요");
  const action = body.action as RequestAction;
  const [r] = await db.query<Row>(
    "select * from service_requests where id=$1 and expires_at>$2",
    [id, now],
  );
  if (!r) return fail(404, "요청을 찾을 수 없습니다");
  if (r.version !== body.version)
    return fail(409, "요청 상태가 바뀌었습니다. 최신 내용을 확인해 주세요");
  let next: RequestState;
  if (action === "reopen") {
    if (!s!.isDesk) return fail(403, "재배정은 안내데스크에서 확인해 주세요");
    if (!["assigned", "en_route", "arrived"].includes(r.state))
      return fail(409, "이 상태에서는 재배정할 수 없습니다");
    next = "received";
  } else if (action === "unavailable") {
    if (!OPEN_REQUEST_STATES.includes(r.state))
      return fail(409, "이미 끝난 요청입니다");
    if (!s!.isDesk && r.assigned_zone !== s!.zoneId)
      return fail(403, "담당 구역에서 처리해 주세요");
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 120
    )
      return fail(400, "지원 불가 이유를 120자 이내로 적어 주세요");
    next = "unavailable";
  } else {
    const step = transitions[action];
    if (!step) return fail(400, "할 수 없는 동작입니다");
    if (r.state !== step.from) return fail(409, "요청 상태가 바뀌었습니다");
    if (action !== "assign" && r.assigned_zone !== s!.zoneId)
      return fail(403, "담당 구역에서 처리해 주세요");
    next = step.to;
  }
  const rows = await db.query<Row>(
    `update service_requests set state=$3,updated_at=$4,version=version+1,
 assigned_zone=case when $3='received' then null when $3='assigned' then $5 else assigned_zone end,
 accepted_at=case when $3='received' then null when $3='assigned' then $4 else accepted_at end,
 arrived_at=case when $3='received' then null when $3='arrived' then $4 else arrived_at end,
 started_at=case when $3='serving' then $4 else started_at end,
 ended_at=case when $3 in ('done','unavailable') then $4 else ended_at end,
 reason=case when $3='unavailable' then $6 else '' end
 where id=$1 and version=$2 and state=$7 returning *`,
    [
      id,
      body.version,
      next,
      now,
      s!.zoneId,
      typeof body.reason === "string" ? body.reason.trim() : "",
      r.state,
    ],
  );
  return rows[0]
    ? ok({ request: view(rows[0]) })
    : fail(409, "다른 직원이 먼저 처리했습니다. 새로 확인해 주세요");
}
