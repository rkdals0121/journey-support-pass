import { journeysByIds, isJourneyOver, lastRealPoll } from "./journey";
import { createHash } from "node:crypto";
import { kstDate } from "./flights/normalize";
import { placeOf } from "./airport";
import type { Db } from "./db";
import { ipPart, type Session } from "./auth";
import { isUuid } from "./registrations";
import { knownCodes } from "./catalog";
import { lookupPass } from "./api/public";
import { getZone } from "./zones";
import { operationalSummary, legacyWorkAction } from "./request-operations";
import { closeStale } from "./calls";
import { closeStaleAssist } from "./assist";
import { alertSnapshots, maintainAlertQueue } from "./request-alerts";
import { pushConfig } from "./staff-push";
import { resourceSnapshot } from "./dispatch-resources";
import {
  isServiceClaimConflict,
  serviceClaimConflict,
  historicalServiceConflicts,
} from "./service-claims";
import { fail, ok, type ApiResult } from "./api/dto";
import {
  OPEN_REQUEST_STATES,
  SERVICE_TYPES,
  type ServiceRequestView,
  type RequestState,
  type ServiceType,
  type RequestAction,
} from "./service-request-model";

const RECEIPT = /^[a-f0-9]{64}$/;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const validReceipt = (v: unknown): v is string =>
  typeof v === "string" && RECEIPT.test(v);
import { expireServiceRequests, REQUEST_TTL_MS } from "./request-retention";
export { expireServiceRequests, REQUEST_TTL_MS } from "./request-retention";
interface Row {
  id: string;
  receipt_hash: string;
  queue?: "integrated" | "call" | "assist";
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
  pending_place_id?: string | null;
  pending_place_at?: Date | null;
}
function view(r: Row): ServiceRequestView {
  const place = placeOf(r.place_id);
  return {
    id: r.id,
    queue: r.queue ?? "integrated",
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
    pendingPlaceId: r.pending_place_id ?? null,
    pendingPlace: placeOf(r.pending_place_id ?? "")?.label ?? "",
    pendingPlaceEn: placeOf(r.pending_place_id ?? "")?.labelEn ?? "",
    pendingPlaceRequestedAt: r.pending_place_at?.toISOString() ?? null,
  };
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
  if (registrationId) {
    await closeStale(db, now);
    await closeStaleAssist(db, now);
    const previousLegacy = await db.query(
      "select id from request_work_ledger where registration_id=$1 and service=$2 and queue<>'integrated' and state in ('received','assigned','en_route','arrived','serving')",
      [registrationId, body.service],
    );
    if (previousLegacy.length) return serviceClaimConflict();
  }
  const source = session?.isKiosk
    ? "kiosk"
    : session?.isDesk && body.assisted === true
      ? "assisted"
      : registrationId
        ? "preregistered"
        : "web";
  // Database claim avoids a check-then-insert race across concurrent server instances.
  const rows = await db
    .query<Row>(
      `with quota as (
 insert into service_request_limits(bucket,window_at,used)
 values($13,$14,1) on conflict(bucket,window_at) do update set used=service_request_limits.used+1
 where service_request_limits.used<20 returning used
 ) insert into service_requests(receipt_hash,registration_id,service,place_id,choices,party,note,lang,source,created_at,updated_at,expires_at,device_key,last_action)
 select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,'created' from quota
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
    )
    .catch((error) => {
      if (isServiceClaimConflict(error)) return null;
      throw error;
    });
  if (rows === null) return serviceClaimConflict();
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
  // The database trigger enqueues alerts atomically. Route-level after() sends after responding.
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
    `update service_requests set state='cancelled',ended_at=$2,updated_at=$2,version=version+1,last_action='cancel',last_actor_zone=null,last_action_reason='',pending_place_id=null,pending_place_at=null
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
/** Capability holders may correct an unassigned pickup or ask the assigned team to confirm it. */
export async function changeRequestPlace(
  db: Db,
  session: Session | null,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  await expireServiceRequests(db, now);
  const r = await receiptRow(db, body.receipt);
  if (!r) return fail(404, "요청을 찾을 수 없습니다", "request_missing");
  if (r.expires_at <= now)
    return fail(410, "요청의 보관 기간이 끝났습니다", "request_expired");
  if (!Number.isInteger(body.version) || Number(body.version) < 0)
    return fail(400, "요청 상태를 다시 확인해 주세요", "request_version");
  if (!["received", "assigned", "en_route", "arrived"].includes(r.state))
    return fail(
      409,
      "지원이 시작되었거나 끝난 요청입니다. 현장 직원에게 위치를 알려 주세요",
      "location_stage",
    );
  const action = body.action ?? "request";
  if (action !== "request" && action !== "withdraw")
    return fail(400, "위치 변경 작업을 확인해 주세요", "location_action");
  let target: string | null = null;
  if (action === "request") {
    const place = placeOf(typeof body.placeId === "string" ? body.placeId : "");
    if (!place)
      return fail(
        400,
        "목록에서 새 만날 곳을 선택해 주세요",
        "location_invalid",
      );
    if (session?.isKiosk && session.placeId !== place.id)
      return fail(
        403,
        "이 키오스크의 설치 위치는 변경할 수 없습니다",
        "location_locked",
      );
    target = place.id;
    if (
      r.pending_place_id === target ||
      (!r.pending_place_id && r.place_id === target)
    )
      return ok({ request: view(r) });
    if (r.pending_place_id && target === r.place_id)
      return fail(
        400,
        "현재 만날 곳을 유지하려면 위치 변경 요청을 철회해 주세요",
        "location_withdraw",
      );
  } else if (!r.pending_place_id) return ok({ request: view(r) });
  if (r.version !== body.version)
    return fail(
      409,
      "요청 상태가 바뀌었습니다. 최신 위치를 확인해 주세요",
      "request_stale",
    );
  const immediate = action === "request" && r.state === "received";
  const event =
    action === "withdraw"
      ? "pickup_withdrawn"
      : immediate
        ? "pickup_changed"
        : "pickup_requested";
  const detail =
    action === "withdraw"
      ? "위치 변경 요청 철회"
      : "만날 곳: " +
        (placeOf(r.place_id)?.label ?? r.place_id) +
        " → " +
        placeOf(target!)!.label;
  const rows = await db.query<Row>(
    `
    update service_requests set
     place_id=case when $4 then $3 else place_id end,
     pending_place_id=case when $5='request' and not $4 then $3 else null end,
     pending_place_at=case when $5='request' and not $4 then $6 else null end,
     updated_at=$6,version=version+1,reason='',
     last_action=$7,last_actor_zone=null,last_action_reason=$8
    where id=$1 and version=$2 and state=$9 and expires_at>$6 returning *`,
    [r.id, r.version, target, immediate, action, now, event, detail, r.state],
  );
  return rows[0]
    ? ok({ request: view(rows[0]) })
    : fail(
        409,
        "요청 상태가 바뀌었습니다. 다시 확인해 주세요",
        "request_stale",
      );
}

async function decideRequestPlace(
  db: Db,
  s: Session,
  r: Row,
  action: "accept_place" | "reject_place",
  reason: unknown,
  now: Date,
): Promise<ApiResult> {
  if (!s.isDesk && r.assigned_zone !== s.zoneId)
    return fail(403, "담당 구역 또는 안내데스크에서 확인해 주세요");
  if (
    !r.pending_place_id ||
    !["assigned", "en_route", "arrived"].includes(r.state)
  )
    return fail(409, "확인 대기 중인 위치 변경 요청이 없습니다");
  const accept = action === "accept_place";
  if (
    !accept &&
    (typeof reason !== "string" || !reason.trim() || reason.length > 120)
  )
    return fail(
      400,
      "위치 변경을 받을 수 없는 사유를 120자 이내로 적어 주세요",
    );
  const detail = accept
    ? "만날 곳 변경 확인: " +
      (placeOf(r.place_id)?.label ?? r.place_id) +
      " → " +
      placeOf(r.pending_place_id)!.label
    : "만날 곳 변경 거절: " + String(reason).trim();
  const publicReason = accept
    ? "담당자가 새 만날 곳을 확인했습니다 / Staff confirmed your new pickup point."
    : "위치 변경 불가 / Pickup change declined: " + String(reason).trim();
  const rows = await db.query<Row>(
    `
    update service_requests set
     place_id=case when $3 then pending_place_id else place_id end,
     state=case when $3 then 'assigned' else state end,
     arrived_at=case when $3 then null else arrived_at end,
     started_at=case when $3 then null else started_at end,
     pending_place_id=null,pending_place_at=null,updated_at=$4,version=version+1,
     reason=$5,last_action=$6,last_actor_zone=$7,last_action_reason=$8
    where id=$1 and version=$2 and state=$9 and pending_place_id=$10 returning *`,
    [
      r.id,
      r.version,
      accept,
      now,
      publicReason,
      accept ? "pickup_accepted" : "pickup_rejected",
      s.zoneId,
      detail,
      r.state,
      r.pending_place_id,
    ],
  );
  return rows[0]
    ? ok({ request: view(rows[0]) })
    : fail(409, "위치 변경 상태가 바뀌었습니다. 다시 확인해 주세요");
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
  options: { history?: boolean; offset?: number } = {},
): Promise<ApiResult> {
  const denied = staffDenied(s);
  if (denied) return denied;
  await expireServiceRequests(db, now);
  await closeStale(db, now);
  await closeStaleAssist(db, now);
  await maintainAlertQueue(db, now);
  const offset = Math.max(
    0,
    Math.min(100000, Number.isInteger(options.offset) ? options.offset! : 0),
  );
  const condition = options.history
    ? "created_at >= $2 and $1::timestamptz is not null"
    : "expires_at>$1 and (state in ('received','assigned','en_route','arrived','serving') or ended_at>$2)";
  const since = options.history
    ? new Date(now.getTime() - 90 * 86400000)
    : new Date(now.getTime() - 30 * 60000);
  const rows = await db.query<Row>(
    `select * from request_work_ledger where ${condition} order by (state in ('received','assigned','en_route','arrived','serving')) desc,created_at desc,id limit 200 offset $3`,
    [now, since, offset],
  );
  const [count] = await db.query<{ total: number }>(
    `select count(*)::int as total from request_work_ledger where ${condition}`,
    [now, since],
  );
  const summary = await operationalSummary(
    db,
    new Date(`${kstDate(now)}T00:00:00+09:00`),
    now,
  );
  const legacyIds = Array.from(
    new Set(
      rows
        .filter((r) => r.queue !== "integrated" && r.registration_id)
        .map((r) => r.registration_id!),
    ),
  );
  const visibleJourneys = await journeysByIds(db, legacyIds, now);
  const lastPoll = legacyIds.length ? await lastRealPoll(db) : null;
  const allowedLegacy = new Set(
    visibleJourneys
      .filter((j) => !isJourneyOver(j, now, lastPoll))
      .map((j) => j.registrationId),
  );
  const zones = await db.query<{ id: string; label: string }>(
    "select id,label from zones where is_kiosk=false",
  );
  return ok({
    requests: rows.map((r) =>
      view(
        r.expires_at <= now ||
          (r.queue !== "integrated" &&
            r.registration_id &&
            !allowedLegacy.has(r.registration_id))
          ? { ...r, place_id: "", choices: [], note: "", reason: "", party: 1 }
          : r,
      ),
    ),
    total: count.total,
    offset,
    zoneId: s!.zoneId,
    isDesk: s!.isDesk,
    summary,
    resources: await resourceSnapshot(db),
    alerts: await alertSnapshots(
      db,
      rows.filter((r) => r.queue === "integrated").map((r) => r.id),
    ),
    pushEnabled: pushConfig().enabled,
    historicalConflicts: await historicalServiceConflicts(
      db,
      rows.map((r) => r.id),
    ),
    dispatchZones: await db.query(
      "select id,label from zones where active and not is_kiosk and not is_common order by label",
    ),
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
  if (id.startsWith("call:") || id.startsWith("assist:"))
    return legacyWorkAction(db, s!, id, body, now);
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
  if (action === "accept_place" || action === "reject_place")
    return decideRequestPlace(db, s!, r, action, body.reason, now);
  if (
    r.pending_place_id &&
    ["travel", "arrive", "serve", "reopen"].includes(action)
  )
    return fail(409, "여객의 위치 변경 요청을 먼저 확인해 주세요");
  let next: RequestState;
  let assignedZone = s!.zoneId;
  if (body.zoneId !== undefined) {
    if (!s!.isDesk)
      return fail(403, "다른 구역 배정은 안내데스크에서 처리합니다");
    const target =
      typeof body.zoneId === "string" ? await getZone(db, body.zoneId) : null;
    if (
      !target ||
      target.isCommon ||
      !(
        await db.query("select id from zones where id=$1 and not is_kiosk", [
          target.id,
        ])
      ).length
    )
      return fail(400, "배정할 근무 구역을 확인해 주세요");
    assignedZone = target.id;
  }
  if (action === "transfer") {
    if (!s!.isDesk) return fail(403, "교대·인계는 안내데스크에서 처리합니다");
    if (!["assigned", "en_route", "arrived", "serving"].includes(r.state))
      return fail(409, "진행 중인 배정만 인계할 수 있습니다");
    if (!body.zoneId || assignedZone === r.assigned_zone)
      return fail(400, "다른 담당 구역을 골라 주세요");
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 120
    )
      return fail(400, "인계 사유를 120자 이내로 적어 주세요");
    next = r.state;
  } else if (action === "reopen") {
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
    if (
      r.state !== step.from &&
      !(
        action === "serve" &&
        r.service === "guidance" &&
        r.state === "assigned"
      )
    )
      return fail(409, "요청 상태가 바뀌었습니다");
    if (action !== "assign" && r.assigned_zone !== s!.zoneId)
      return fail(403, "담당 구역에서 처리해 주세요");
    next = step.to;
  }
  const rows = await db.query<Row>(
    `update service_requests set state=$3,updated_at=$4,version=version+1,
 assigned_zone=case when $8='transfer' then $5 when $3='received' then null when $3='assigned' then $5 else assigned_zone end,
 resource_id=case when $3='received' then null else resource_id end,
 pending_place_id=case when $3 in ('done','unavailable') then null else pending_place_id end,
 pending_place_at=case when $3 in ('done','unavailable') then null else pending_place_at end,
 accepted_at=case when $8='transfer' then accepted_at when $3='received' then null when $3='assigned' then $4 else accepted_at end,
 arrived_at=case when $8='transfer' then arrived_at when $3='received' then null when $3='arrived' then $4 else arrived_at end,
 started_at=case when $8='transfer' then started_at when $3='serving' then $4 else started_at end,
 ended_at=case when $3 in ('done','unavailable') then $4 else ended_at end,
 reason=case when $3='unavailable' then $6 else '' end,
 last_action=$8,last_actor_zone=$9,last_action_reason=case when $8 in ('transfer','unavailable','reopen') then $6 else '' end
 where id=$1 and version=$2 and state=$7 returning *`,
    [
      id,
      body.version,
      next,
      now,
      assignedZone,
      typeof body.reason === "string" ? body.reason.trim() : "",
      r.state,
      action,
      s!.zoneId,
    ],
  );
  return rows[0]
    ? ok({ request: view(rows[0]) })
    : fail(409, "다른 직원이 먼저 처리했습니다. 새로 확인해 주세요");
}

export async function serviceRequestHistory(
  db: Db,
  s: Session | null,
  id: string,
  now: Date,
): Promise<ApiResult> {
  const denied = staffDenied(s);
  if (denied) return denied;
  if (!isUuid(id)) return fail(400, "통합 요청 번호를 확인해 주세요");
  await expireServiceRequests(db, now);
  const [row] = await db.query("select id from service_requests where id=$1", [
    id,
  ]);
  if (!row) return fail(404, "요청을 찾을 수 없습니다");
  const history = await db.query<{
    version: number;
    at: Date;
    action: string;
    state: string;
    actor_zone: string | null;
    assigned_zone: string | null;
    reason: string;
  }>(
    "select * from service_request_history where request_id=$1 order by version",
    [id],
  );
  return ok({
    history: history.map((h) => ({
      version: h.version,
      at: h.at.toISOString(),
      action: h.action,
      state: h.state,
      actorZone: h.actor_zone,
      assignedZone: h.assigned_zone,
      reason: h.reason,
    })),
  });
}

export async function registeredRequestProgress(
  db: Db,
  token: unknown,
  now: Date,
): Promise<ApiResult> {
  const found = await lookupPass(
    db,
    typeof token === "string" ? token : "",
    now,
  );
  if (found.kind !== "ok") return fail(410, "사전등록을 불러올 수 없습니다");
  await expireServiceRequests(db, now);
  await closeStale(db, now);
  await closeStaleAssist(db, now);
  const rows = await db.query<{
    service: ServiceType;
    state: RequestState;
    created_at: Date;
    updated_at: Date;
    location_change_pending: boolean;
  }>(
    "select service,state,created_at,updated_at,pending_place_id is not null as location_change_pending from request_work_ledger where registration_id=$1 and expires_at>$2 order by created_at desc limit 10",
    [found.journey.registrationId, now],
  );
  return ok({
    requests: rows.map((r) => ({
      service: r.service,
      state: r.state,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      locationChangePending: r.location_change_pending,
    })),
  });
}
