import { expireVisits } from "./support-maintenance";
export { expireVisits } from "./support-maintenance";
import { createHash, randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Session } from "./auth";
import { fail, ok, type ApiResult } from "./api/dto";
import { knownCodes } from "./catalog";
import { lookupPass } from "./api/public";
import { placeOf } from "./airport";
import { atomicResult } from "./atomic-result";
import {
  hubRules,
  availableHubRule,
  operatingBlock,
  claimHubResource,
  ensureHubUnits,
} from "./support-operations";
import {
  SERVICE_HUBS,
  hubOf,
  ruleBlock,
  VISIT_MINUTES,
  type VisitService,
  type VisitView,
} from "./service-hubs";
export { hubRules } from "./support-operations";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const validReceipt = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const columns = `id,hub_id as "hubId",service,start_at as "startAt",state,task,choices,party,recognition,destination_id as "destinationId",request_id as "requestId",assigned_crew as "assignedCrew",version,created_at as "createdAt",notice,lang,handed_over_at as "handedOverAt",resource_id as "resourceId",registration_id as "registrationId",flight_no as "flightNo",flight_date as "flightDate"`;
export const staffDenied = (s: Session | null, now: Date) =>
  !s || s.isKiosk || s.needsZone || s.exp <= now.getTime();
const terminal = (v: VisitView) =>
  ["done", "cancelled", "missed"].includes(v.state);
async function logVisit(
  db: Db,
  id: string,
  version: number,
  action: string,
  actor: string,
  now: Date,
  reason = "",
) {
  await db.query(
    `insert into support_visit_history(visit_id,version,action,actor,at,reason) values($1,$2,$3,$4,$5,$6) on conflict(visit_id,version) do update set action=excluded.action,actor=excluded.actor,reason=excluded.reason`,
    [id, version, action, actor, now, reason],
  );
}
async function lockedVisit(db: Db, id: string) {
  return (
    await db.query<VisitView>(
      `select ${columns} from support_visits where id=$1 for update`,
      [id],
    )
  )[0];
}
async function ownVisit(db: Db, receipt: string) {
  return (
    await db.query<VisitView>(
      `select ${columns} from support_visits where receipt_hash=$1`,
      [hash(receipt)],
    )
  )[0];
}
async function lockedRule(db: Db, hubId: string, service: VisitService) {
  await db.query(
    `insert into support_hub_rules(hub_id,service) values($1,$2) on conflict do nothing`,
    [hubId, service],
  );
  await db.query(
    `select hub_id from support_hub_rules where hub_id=$1 and service=$2 for update`,
    [hubId, service],
  );
  return (await hubRules(db)).find(
    (r) => r.hubId === hubId && r.service === service,
  )!;
}
export async function visitSlots(
  db: Db,
  hubId: unknown,
  service: unknown,
  day: unknown,
  now: Date,
): Promise<ApiResult> {
  const hub = hubOf(hubId);
  if (
    !hub ||
    !["robot", "mobility"].includes(String(service)) ||
    typeof day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)
  )
    return fail(400, "거점·날짜·서비스를 확인해 주세요", "visit_input");
  const date = new Date(day + "T12:00:00+09:00");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    return fail(400, "날짜를 확인해 주세요", "visit_date");
  await expireVisits(db, now);
  const configuredRule = (await hubRules(db)).find(
    (r) => r.hubId === hub.id && r.service === service,
  )!;
  const rule = await availableHubRule(db, configuredRule);
  const used = await db.query<{ startAt: string; n: number }>(
    `select start_at as "startAt",count(*)::int as n from support_visits where hub_id=$1 and service=$2 and start_at>=$3 and start_at<$3::timestamptz+interval '1 day' and state in ('booked','checked_in','responding','handed_over') group by start_at`,
    [hub.id, service, day + "T00:00:00+09:00"],
  );
  const slots = [];
  for (
    let minute = rule.openHour * 60;
    minute + VISIT_MINUTES <= rule.closeHour * 60;
    minute += VISIT_MINUTES
  ) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const start = new Date(`${day}T${label}:00+09:00`),
      reason = ruleBlock(rule, start, now);
    const remaining = reason
      ? 0
      : Math.max(
          0,
          rule.capacity -
            (used.find((x) => Date.parse(x.startAt) === start.getTime())?.n ??
              0),
        );
    slots.push({
      startAt: start.toISOString(),
      label,
      remaining,
      reason: reason ?? (remaining ? "" : "예약 정원이 찼습니다"),
    });
  }
  return ok({ hub, rule, slots, simulation: true });
}
async function statusOf(db: Db, visit: VisitView) {
  const history = await db.query(
    `select version,action,actor,at,reason from support_visit_history where visit_id=$1 order by version`,
    [visit.id],
  );
  const [work] = await db.query(
    `select r.state,r.version,r.assigned_zone as "assignedZone",r.resource_id as "resourceId",r.assigned_crew as "assignedCrew",c.label as "staffLabel" from service_requests r left join support_crew c on c.id=r.assigned_crew where r.id=$1`,
    [visit.requestId],
  );
  return ok({
    visit,
    hub: hubOf(visit.hubId),
    history,
    work,
    simulation: true,
  });
}
export async function visitStatus(
  db: Db,
  receipt: unknown,
  now: Date,
): Promise<ApiResult> {
  if (!validReceipt(receipt))
    return fail(400, "예약 확인값을 확인해 주세요", "visit_receipt");
  await expireVisits(db, now);
  const visit = await ownVisit(db, receipt);
  return visit
    ? statusOf(db, visit)
    : fail(404, "예약을 찾지 못했습니다", "visit_missing");
}
export async function bookVisit(
  db: Db,
  body: Record<string, unknown>,
  device: string,
  now: Date,
): Promise<ApiResult> {
  if (!validReceipt(body.receipt) || body.consent !== true)
    return fail(
      400,
      "예약 확인과 정보 전달 동의가 필요합니다",
      "visit_consent",
    );
  await expireVisits(db, now);
  const old = await ownVisit(db, body.receipt);
  if (old) return statusOf(db, old);
  const hub = hubOf(body.hubId),
    service = body.service as VisitService,
    start = new Date(typeof body.startAt === "string" ? body.startAt : "");
  if (
    !hub ||
    !["robot", "mobility"].includes(service) ||
    !Number.isFinite(start.getTime())
  )
    return fail(400, "거점·서비스·시간대를 확인해 주세요", "visit_input");
  if (
    !Number.isInteger(body.party) ||
    Number(body.party) < 1 ||
    Number(body.party) > 20 ||
    !["directions", "wheelchair", "escort"].includes(String(body.task))
  )
    return fail(400, "인원과 필요한 도움을 확인해 주세요", "visit_party");
  if (
    (service === "robot" && body.task !== "directions") ||
    (service === "mobility" && body.task === "directions")
  )
    return fail(
      400,
      "응대 방식과 필요한 도움을 확인해 주세요",
      "visit_service",
    );
  const recognition =
    typeof body.recognition === "string" ? body.recognition.trim() : "";
  if (recognition.length > 100)
    return fail(
      400,
      "인상착의는 100자 이내로 적어 주세요",
      "visit_recognition",
    );
  let choices = knownCodes(
      Array.isArray(body.choices)
        ? body.choices.filter((c): c is string => typeof c === "string")
        : [],
    ),
    registrationId: string | null = null,
    flightNo: string | null = null,
    flightDate: string | null = null;
  if (body.registrationToken) {
    const found = await lookupPass(db, String(body.registrationToken), now);
    if (found.kind !== "ok")
      return fail(410, "사전등록을 다시 확인해 주세요", "visit_registration");
    choices = found.journey.choices;
    registrationId = found.journey.registrationId;
    flightNo = found.journey.flightNo;
    flightDate = found.journey.flightDate;
  }
  return atomicResult(db, async (tx) => {
    const retry = await ownVisit(tx, body.receipt as string);
    if (retry) return statusOf(tx, retry);
    const rule = await availableHubRule(
      tx,
      await lockedRule(tx, hub.id, service),
    );
    const concurrentRetry = await ownVisit(tx, body.receipt as string);
    if (concurrentRetry) return statusOf(tx, concurrentRetry);
    const blocked = ruleBlock(rule, start, now);
    if (blocked) return fail(409, blocked, "visit_time");
    const [limit] = await tx.query<{ n: number }>(
      `select count(*)::int as n from support_visits where device_key=$1 and created_at>$2::timestamptz-interval '24 hours'`,
      [device, now],
    );
    if (limit.n >= 10)
      return fail(
        429,
        "이 기기의 예약 한도를 넘었습니다. 직원에게 문의해 주세요",
        "visit_rate",
      );
    const seats = await tx.query<{ seat: number }>(
      `select seat from support_visits where hub_id=$1 and service=$2 and start_at=$3 and state in ('booked','checked_in','responding','handed_over')`,
      [hub.id, service, start],
    );
    if (seats.length >= rule.capacity)
      return fail(
        409,
        "해당 시간대 정원이 찼습니다. 기존 예약은 유지됩니다",
        "visit_full",
      );
    const seat = Array.from({ length: rule.capacity }, (_, i) => i + 1).find(
      (n) => !seats.some((s) => s.seat === n),
    );
    if (!seat)
      return fail(
        409,
        "방금 예약이 마감됐습니다. 다른 시간대를 골라 주세요",
        "visit_full",
      );
    const id = randomUUID(),
      lang = body.lang === "en" ? "en" : "ko";
    const [visit] = await tx.query<VisitView>(
      `insert into support_visits(id,receipt_hash,hub_id,service,start_at,seat,task,choices,party,recognition,created_at,updated_at,device_key,request_id,registration_id,lang,flight_no,flight_date) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$1,$13,$14,$15,$16) returning ${columns}`,
      [
        id,
        hash(body.receipt as string),
        hub.id,
        service,
        start,
        seat,
        body.task,
        choices,
        body.party,
        recognition,
        now,
        device,
        registrationId,
        lang,
        flightNo,
        flightDate,
      ],
    );
    await tx.query(
      `insert into service_requests(id,receipt_hash,service,place_id,choices,party,note,lang,source,created_at,updated_at,expires_at,device_key,last_action,topic_id,business_id,service_details,visit_id,planned_at,registration_linked,target_zone) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,'reserved',$13,'passenger-terminal',$14::jsonb,$1,$15,$16,$17)`,
      [
        id,
        hash(body.receipt as string),
        service,
        hub.placeId,
        choices,
        body.party,
        recognition,
        lang,
        registrationId ? "preregistered" : "web",
        now,
        new Date(start.getTime() + 86400000),
        device,
        service === "robot" ? "robot" : "mobility",
        JSON.stringify({
          task:
            service === "robot"
              ? "robot-visit"
              : body.task === "wheelchair"
                ? "mobility-wheelchair"
                : "mobility-escort",
          fields: {},
        }),
        start,
        !!registrationId,
        placeOf(hub.placeId)!.zoneId,
      ],
    );
    await ensureHubUnits(tx, hub.id, service, rule.capacity, now);
    return statusOf(tx, visit);
  });
}
async function changeLocked(
  tx: Db,
  v: VisitView,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  if (v.version !== body.version)
    return fail(
      409,
      "예약 상태가 바뀌었습니다. 새로 확인해 주세요",
      "visit_stale",
    );
  const action = String(body.action),
    hub = hubOf(v.hubId)!;
  if (terminal(v)) return fail(409, "종료된 예약입니다", "visit_ended");
  if (action === "reschedule") {
    if (v.state !== "booked")
      return fail(409, "방문 전 예약만 변경할 수 있습니다", "visit_stage");
    const nextHub = hubOf(body.hubId),
      start = new Date(String(body.startAt));
    if (!nextHub || !Number.isFinite(start.getTime()))
      return fail(400, "거점과 시간을 확인해 주세요", "visit_input");
    const rule = await availableHubRule(
        tx,
        await lockedRule(tx, nextHub.id, v.service),
      ),
      blocked = ruleBlock(rule, start, now);
    if (blocked) return fail(409, blocked, "visit_time");
    const seats = await tx.query<{ seat: number }>(
      `select seat from support_visits where id<>$1 and hub_id=$2 and service=$3 and start_at=$4 and state in ('booked','checked_in','responding','handed_over')`,
      [v.id, nextHub.id, v.service, start],
    );
    if (seats.length >= rule.capacity)
      return fail(
        409,
        "해당 시간대 정원이 찼습니다. 기존 예약은 유지됩니다",
        "visit_full",
      );
    const seat = Array.from({ length: rule.capacity }, (_, i) => i + 1).find(
      (n) => !seats.some((s) => s.seat === n),
    );
    if (!seat)
      return fail(
        409,
        "해당 시간대 정원이 찼습니다. 기존 예약은 유지됩니다",
        "visit_full",
      );
    await tx.query(
      `update support_visits set hub_id=$2,start_at=$3,seat=$4,version=version+1,updated_at=$5 where id=$1`,
      [v.id, nextHub.id, start, seat, now],
    );
    await tx.query(
      `update service_requests set place_id=$2,planned_at=$3,expires_at=$4,updated_at=$5,target_zone=$6,version=version+1,last_action='reschedule' where id=$1`,
      [
        v.requestId ?? v.id,
        nextHub.placeId,
        start,
        new Date(start.getTime() + 86400000),
        now,
        placeOf(nextHub.placeId)!.zoneId,
      ],
    );
  } else if (action === "cancel") {
    const [job] = await tx.query<{ state: string }>(
      `select state from service_requests where id=$1 for update`,
      [v.requestId ?? v.id],
    );
    if (job?.state === "serving" && v.state !== "responding")
      return fail(
        409,
        "지원이 시작되었습니다. 담당 직원에게 종료를 요청해 주세요",
        "visit_serving",
      );
    await tx.query(
      `update support_visits set state='cancelled',ended_at=$2,updated_at=$2,version=version+1 where id=$1`,
      [v.id, now],
    );
    await tx.query(
      `update service_requests set state='cancelled',ended_at=$2,updated_at=$2,planned_at=null,version=version+1,last_action='cancel',pending_place_id=null,pending_place_at=null where id=$1`,
      [v.requestId ?? v.id, now],
    );
  } else if (action === "checkin" && v.state === "booked") {
    const delta = now.getTime() - Date.parse(v.startAt);
    if (delta < -15 * 60000)
      return fail(
        409,
        "아직 도착 확인 시간이 아닙니다. 예약 15분 전부터 확인해 주세요",
        "visit_early",
      );
    if (delta > 15 * 60000)
      return fail(
        409,
        "도착 확인 시간이 지났습니다. 다른 시간으로 변경하거나 현장 직원에게 도움을 요청해 주세요",
        "visit_late",
      );
    const blocked = await operatingBlock(tx, hub.placeId, v.service, now, true);
    if (blocked) return blocked;
    await tx.query(
      `update support_visits set state='checked_in',updated_at=$2,version=version+1 where id=$1`,
      [v.id, now],
    );
    await tx.query(
      `update service_requests set planned_at=null,created_at=$2,updated_at=$2,version=version+1,last_action='arrival' where id=$1`,
      [v.requestId ?? v.id, now],
    );
  } else if (
    action === "respond" &&
    v.state === "checked_in" &&
    v.service === "robot"
  ) {
    const blocked = await operatingBlock(tx, hub.placeId, v.service, now);
    if (blocked) return blocked;
    const rule = await lockedRule(tx, v.hubId, v.service);
    const resource = await claimHubResource(
      tx,
      v.id,
      v.hubId,
      v.service,
      rule.capacity,
      now,
    );
    if (!resource)
      return fail(
        409,
        "다른 안내가 진행 중입니다. 잠시 기다리거나 직원 도움으로 전환해 주세요",
        "visit_busy",
      );
    await tx.query(
      `update support_visits set state='responding',resource_id=$3,updated_at=$2,version=version+1 where id=$1`,
      [v.id, now, resource],
    );
    await tx.query(
      `update service_requests set state='serving',resource_id=$3,assigned_zone=$4,accepted_at=coalesce(accepted_at,$2),arrived_at=$2,started_at=$2,updated_at=$2,version=version+1,last_action='robot_response' where id=$1`,
      [v.requestId ?? v.id, now, resource, placeOf(hub.placeId)!.zoneId],
    );
  } else if (
    action === "complete" &&
    v.state === "responding" &&
    body.confirmed === true
  ) {
    await tx.query(
      `update support_visits set state='done',ended_at=$2,updated_at=$2,version=version+1 where id=$1`,
      [v.id, now],
    );
    await tx.query(
      `update service_requests set state='done',ended_at=$2,updated_at=$2,version=version+1,last_action='robot_complete' where id=$1`,
      [v.requestId ?? v.id, now],
    );
    await experienceEvent(tx, "visit:" + v.id, "robot_complete", 1, now);
  } else if (
    action === "handover" &&
    ["checked_in", "responding"].includes(v.state)
  ) {
    await handoverLocked(tx, v, now);
  } else
    return fail(409, "현재 상태에서는 이 동작을 할 수 없습니다", "visit_stage");
  const changed = await lockedVisit(tx, v.id);
  await logVisit(tx, v.id, changed.version, action, "passenger", now);
  return statusOf(tx, changed);
}
export async function changeVisit(
  db: Db,
  body: Record<string, unknown>,
  _device: string,
  now: Date,
): Promise<ApiResult> {
  if (!validReceipt(body.receipt))
    return fail(400, "예약 확인값을 확인해 주세요", "visit_receipt");
  await expireVisits(db, now);
  const own = await ownVisit(db, body.receipt);
  if (!own) return fail(404, "예약을 찾지 못했습니다", "visit_missing");
  return atomicResult(db, async (tx) =>
    changeLocked(tx, (await lockedVisit(tx, own.id))!, body, now),
  );
}
async function handoverLocked(tx: Db, v: VisitView, now: Date) {
  await tx.query(
    `update support_visits set state='handed_over',handed_over_at=$2,updated_at=$2,version=version+1 where id=$1`,
    [v.id, now],
  );
  const service = v.service === "robot" ? "guidance" : "mobility";
  await tx.query(
    `update service_requests set service=$3,state=case when assigned_crew is null then 'received' else 'assigned' end,resource_id=null,assigned_zone=case when assigned_crew is null then null else assigned_zone end,started_at=null,arrived_at=null,updated_at=$2,version=version+1,last_action='handover',topic_id=$3,service_details=$4::jsonb where id=$1`,
    [
      v.requestId ?? v.id,
      now,
      service,
      JSON.stringify({
        task:
          service === "guidance"
            ? "guidance-person"
            : v.task === "wheelchair"
              ? "mobility-wheelchair"
              : "mobility-escort",
        fields:
          service === "guidance"
            ? { purpose: "로봇 안내에서 직원에게 인계" }
            : {},
      }),
    ],
  );
  await experienceEvent(tx, "visit:" + v.id, "handover", 1, now);
}

/** Installed meeting-point devices use a short public reference, never a personal receipt URL. */
export async function kioskVisitAction(
  db: Db,
  session: Session | null,
  body: Record<string, unknown>,
  device: string,
  now: Date,
): Promise<ApiResult> {
  if (!session?.isKiosk || !session.placeId || session.exp <= now.getTime())
    return fail(401, "설치된 기기에서 이용해 주세요", "kiosk_required");
  const hub = SERVICE_HUBS.find((h) => h.placeId === session.placeId);
  if (!hub)
    return fail(
      409,
      "예약된 만남 장소의 기기 또는 개인 휴대전화에서 확인해 주세요",
      "kiosk_meeting_point",
    );
  await expireVisits(db, now);
  let visit: VisitView | undefined;
  if (body.action === "lookup") {
    const code =
      typeof body.reference === "string"
        ? body.reference.trim().toLowerCase()
        : "";
    if (!/^[a-f0-9]{8}$/.test(code))
      return fail(
        400,
        "예약 확인번호 8자리를 입력해 주세요",
        "visit_reference",
      );
    const windowAt = new Date(Math.floor(now.getTime() / 600000) * 600000);
    const quota = await db.query(
      `insert into service_request_limits(bucket,window_at,used) values($1,$2,1) on conflict(bucket,window_at) do update set used=service_request_limits.used+1 where service_request_limits.used<20 returning used`,
      ["kiosk-visit:" + device, windowAt],
    );
    if (!quota.length)
      return fail(
        429,
        "조회가 많습니다. 잠시 후 다시 확인하거나 직원에게 문의해 주세요",
        "visit_rate",
      );
    const day =
      new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10) +
      "T00:00:00+09:00";
    const found = await db.query<VisitView>(
      `select ${columns} from support_visits where hub_id=$1 and start_at>=$2 and start_at<$2::timestamptz+interval '1 day' and left(id::text,8)=$3 and state not in ('cancelled','missed','done')`,
      [hub.id, day, code],
    );
    if (found.length !== 1)
      return fail(
        404,
        "오늘 이 장소의 예약을 찾지 못했습니다. 예약 장소와 번호를 확인해 주세요",
        "visit_reference_missing",
      );
    visit = found[0];
  } else {
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
      return fail(400, "예약을 먼저 확인해 주세요", "visit_input");
    const day =
      new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10) +
      "T00:00:00+09:00";
    [visit] = await db.query<VisitView>(
      `select ${columns} from support_visits where id=$1 and hub_id=$2 and start_at>=$3 and start_at<$3::timestamptz+interval '1 day'`,
      [body.id, hub.id, day],
    );
    if (!visit)
      return fail(
        404,
        "이 기기에서 확인할 수 없는 예약입니다",
        "visit_missing",
      );
  }
  if (body.action === "lookup" || body.action === "status")
    return statusOf(db, visit);
  if (
    !["checkin", "respond", "complete", "handover"].includes(
      String(body.action),
    )
  )
    return fail(400, "기기에서 지원하지 않는 작업입니다", "visit_stage");
  return atomicResult(db, async (tx) =>
    changeLocked(tx, (await lockedVisit(tx, visit!.id))!, body, now),
  );
}

export async function experienceEvent(
  db: Db,
  device: string,
  kind: string,
  value: number,
  now: Date,
) {
  if (
    ![
      "stamp_start",
      "stamp_finish",
      "stamp_share",
      "robot_complete",
      "handover",
      "delay",
      "paper_replaced",
    ].includes(kind) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1000
  )
    return;
  const [count] = await db.query<{ n: number }>(
    `select count(*)::int as n from support_experience_events where device_key=$1 and at>$2::timestamptz - interval '1 hour'`,
    [device, now],
  );
  if (count.n < 50)
    await db.query(
      `insert into support_experience_events(at,device_key,kind,value) values($1,$2,$3,$4)`,
      [now, device, kind, value],
    );
}

export async function updateHubRule(
  db: Db,
  s: Session | null,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  if (!s!.isDesk)
    return fail(403, "운영 기준 변경은 안내데스크에서 처리합니다");
  const hub = hubOf(body.hubId);
  if (
    !hub ||
    !["robot", "mobility"].includes(String(body.service)) ||
    ![
      body.openHour,
      body.closeHour,
      body.capacity,
      body.battery,
      body.version,
    ].every(Number.isInteger) ||
    Number(body.openHour) < 0 ||
    Number(body.closeHour) > 24 ||
    Number(body.closeHour) <= Number(body.openHour) ||
    Number(body.capacity) < 0 ||
    Number(body.capacity) > 4 ||
    Number(body.battery) < 0 ||
    Number(body.battery) > 100 ||
    !["ready", "paused", "charging"].includes(String(body.state))
  )
    return fail(400, "운영시간·정원·장비 준비 상태를 확인해 주세요");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > 150 || (body.state !== "ready" && !reason))
    return fail(400, "운영 중지·충전 사유를 150자 이내로 적어 주세요");
  const available = body.availableAfter
    ? new Date(String(body.availableAfter))
    : null;
  if (available && !Number.isFinite(available.getTime()))
    return fail(400, "운영 재개 예상 시각을 확인해 주세요");
  const rows = await db.query(
    `insert into support_hub_rules(hub_id,service,open_hour,close_hour,capacity,state,battery,available_after,reason,version) select $1,$2,$3,$4,$5,$6,$7,$8,$9,1 where $10::int=0 on conflict(hub_id,service) do update set open_hour=$3,close_hour=$4,capacity=$5,state=$6,battery=$7,available_after=$8,reason=$9,version=support_hub_rules.version+1 where support_hub_rules.version=$10 returning version`,
    [
      hub.id,
      body.service,
      body.openHour,
      body.closeHour,
      body.capacity,
      body.state,
      body.battery,
      available,
      reason,
      body.version,
    ],
  );
  if (!rows.length && Number(body.version) > 0) {
    const updated = await db.query(
      `update support_hub_rules set open_hour=$3,close_hour=$4,capacity=$5,state=$6,battery=$7,available_after=$8,reason=$9,version=version+1 where hub_id=$1 and service=$2 and version=$10 returning version`,
      [
        hub.id,
        body.service,
        body.openHour,
        body.closeHour,
        body.capacity,
        body.state,
        body.battery,
        available,
        reason,
        body.version,
      ],
    );
    if (!updated.length)
      return fail(
        409,
        "다른 직원이 변경했습니다. 최신 기준을 다시 불러와 주세요",
      );
  } else if (!rows.length)
    return fail(
      409,
      "다른 직원이 변경했습니다. 최신 기준을 다시 불러와 주세요",
    );
  return ok({ rules: await hubRules(db) });
}

export async function ensureCrew(db: Db, s: Session, key: string, now: Date) {
  let [crew] = await db.query<{
    id: string;
    state: string;
    zoneId: string;
    expiresAt: Date;
  }>(
    `select id,state,zone_id as "zoneId",expires_at as "expiresAt" from support_crew where session_hash=$1 for update`,
    [hash(key)],
  );
  if (!crew) {
    [crew] = await db.query(
      `insert into support_crew(session_hash,zone_id,label,state,expires_at) values($1,$2,$3,'available',$4) on conflict(session_hash) do update set expires_at=excluded.expires_at returning id,state,zone_id as "zoneId",expires_at as "expiresAt"`,
      [
        hash(key),
        s.zoneId,
        `현장 ${hash(key).slice(0, 4).toUpperCase()}`,
        new Date(Math.min(s.exp, now.getTime() + 4 * 3600000)),
      ],
    );
  } else {
    [crew] = await db.query(
      `update support_crew set expires_at=$2,state=case when expires_at<=$3 then 'available' else state end where id=$1 returning id,state,zone_id as "zoneId",expires_at as "expiresAt"`,
      [crew.id, new Date(Math.min(s.exp, now.getTime() + 4 * 3600000)), now],
    );
  }
  return crew;
}
export async function crewShift(
  db: Db,
  s: Session | null,
  key: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (
    !key ||
    !label ||
    label.length > 30 ||
    !["available", "busy", "away"].includes(String(body.state))
  )
    return fail(400, "근무 표시 이름과 상태를 확인해 주세요");
  await expireVisits(db, now);
  return atomicResult(db, async (tx) => {
    const mine = await ensureCrew(tx, s!, key, now);
    if (body.state === "away" || mine.zoneId !== s!.zoneId) {
      const active = await tx.query(
        `select id from service_requests where assigned_crew=$1 and state in ('received','assigned','en_route','arrived','serving') and planned_at is null`,
        [mine.id],
      );
      if (active.length)
        return fail(
          409,
          "담당 중인 지원을 다른 직원에게 인계한 뒤 근무를 변경해 주세요",
        );
    }
    const [crew] = await tx.query(
      `update support_crew set label=$2,state=$3,zone_id=$4,expires_at=$5,version=version+1 where id=$1 returning id,label,state,zone_id as "zoneId",version`,
      [
        mine.id,
        label,
        body.state,
        s!.zoneId,
        new Date(Math.min(s!.exp, now.getTime() + 4 * 3600000)),
      ],
    );
    return ok({ crew });
  });
}
export interface VisitQueue {
  hub?: string;
  state?: string;
  search?: string;
  day?: string;
  offset?: number;
  limit?: number;
}
export async function staffVisits(
  db: Db,
  s: Session | null,
  key: string,
  now: Date,
  options: VisitQueue = {},
): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  await expireVisits(db, now);
  const hubIds = SERVICE_HUBS.filter(
    (h) => s!.isDesk || placeOf(h.placeId)!.zoneId === s!.zoneId,
  ).map((h) => h.id);
  if (options.hub && options.hub !== "all" && !hubOf(options.hub))
    return fail(400, "거점을 선택해 주세요");
  const state = options.state ?? "open",
    offset = options.offset ?? 0,
    limit = options.limit ?? 20;
  if (
    !["open", "mine", "all"].includes(state) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (options.search?.length ?? 0) > 80 ||
    (options.day && !/^\d{4}-\d{2}-\d{2}$/.test(options.day))
  )
    return fail(400, "목록 조건을 확인해 주세요");
  const [mine] = await db.query<{ id: string }>(
    `select id from support_crew where session_hash=$1 and expires_at>$2`,
    [hash(key), now],
  );
  const params: unknown[] = [hubIds, now, s!.zoneId],
    where = [
      `(hub_id=any($1::text[]) or request_id in(select id from service_requests where assigned_zone=$3))`,
      `start_at>$2::timestamptz-interval '30 days'`,
    ];
  const bind = (v: unknown) => {
    params.push(v);
    return "$" + params.length;
  };
  if (state !== "all") where.push(`state not in ('done','cancelled','missed')`);
  if (state === "mine") where.push(`assigned_crew=${bind(mine?.id ?? null)}`);
  if (options.hub && options.hub !== "all")
    where.push(`hub_id=${bind(options.hub)}`);
  if (options.search?.trim())
    where.push(
      `position(lower(${bind(options.search.trim())}) in lower(id::text||' '||recognition||' '||coalesce(flight_no,'')))>0`,
    );
  if (options.day) {
    const day = bind(options.day + "T00:00:00+09:00");
    where.push(
      `start_at>=${day}::timestamptz and start_at<${day}::timestamptz+interval '1 day'`,
    );
  }
  const condition = where.join(" and "),
    [count] = await db.query<{ total: number }>(
      `select count(*)::int as total from support_visits where ${condition}`,
      params,
    );
  const visits = await db.query<VisitView>(
    `select ${columns} from support_visits where ${condition} order by case when state in ('checked_in','handed_over') and assigned_crew is null then 0 when state in ('checked_in','responding','handed_over') then 1 when state='booked' then 2 else 3 end,start_at,id limit ${bind(limit)} offset ${bind(offset)}`,
    params,
  );
  const crew = await db.query(
    `select c.id,c.label,c.zone_id as "zoneId",case when exists(select 1 from service_requests r where r.assigned_crew=c.id and r.planned_at is null and r.state in ('received','assigned','en_route','arrived','serving')) then 'busy' else c.state end as state,c.session_hash=$2 as mine,c.expires_at as "expiresAt" from support_crew c where c.expires_at>$1 and ($3::boolean or c.zone_id=$4) order by c.label`,
    [now, hash(key), s!.isDesk, s!.zoneId],
  );
  const work = await db.query(
    `select id,visit_id as "visitId",state,version,assigned_crew as "assignedCrew",assigned_zone as "assignedZone" from service_requests where visit_id=any($1::uuid[])`,
    [visits.map((v) => v.id)],
  );
  return ok({
    visits,
    crew,
    work,
    rules: await hubRules(db),
    total: count.total,
    offset,
    limit,
    hasMore: offset + visits.length < count.total,
    simulation: true,
  });
}
async function claimWork(
  tx: Db,
  s: Session,
  key: string,
  v: VisitView,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  const mine = await ensureCrew(tx, s, key, now);
  if (
    body.action !== "transfer" &&
    v.assignedCrew &&
    v.assignedCrew !== mine.id
  )
    return fail(409, "이미 다른 직원이 맡았습니다. 교대 인계를 이용해 주세요");
  if (
    body.action === "transfer" &&
    (!body.reason || (!s.isDesk && v.assignedCrew !== mine.id))
  )
    return fail(403, "담당 예약에서 인계 사유를 적어 주세요");
  const targetId = body.action === "transfer" ? body.target : mine.id;
  if (typeof targetId !== "string" || !/^[a-f0-9-]{36}$/i.test(targetId))
    return fail(400, "인계할 직원을 선택해 주세요");
  const [target] = await tx.query<{ id: string; zoneId: string }>(
    `select id,zone_id as "zoneId" from support_crew where id=$1 and state='available' and expires_at>$2 and ($3::boolean or zone_id=$4) for update`,
    [targetId, now, s.isDesk, s.zoneId],
  );
  if (!target) return fail(409, "근무자의 가용 상태를 확인해 주세요");
  const busy = await tx.query(
    `select id from service_requests where id<>$1 and assigned_crew=$2 and planned_at is null and state in ('received','assigned','en_route','arrived','serving')`,
    [v.requestId ?? v.id, targetId],
  );
  if (busy.length) return fail(409, "이 직원은 다른 지원을 처리 중입니다");
  if (v.state === "booked") return fail(409, "여객 도착 확인 후 수락해 주세요");
  if (!v.handedOverAt) {
    await handoverLocked(tx, v, now);
  }
  await tx.query(
    `update service_requests set assigned_crew=$3,assigned_zone=$4,state=case when state='received' then 'assigned' else state end,accepted_at=coalesce(accepted_at,$2),updated_at=$2,version=version+1,last_action=$5,last_actor_zone=$6,last_action_reason=$7 where id=$1`,
    [
      v.requestId ?? v.id,
      now,
      targetId,
      target.zoneId,
      body.action === "transfer" ? "crew_transfer" : "assign",
      s.zoneId,
      String(body.reason ?? "").slice(0, 150),
    ],
  );
  return ok();
}
export async function staffVisitAction(
  db: Db,
  s: Session | null,
  key: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  await expireVisits(db, now);
  if (
    typeof body.id !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(body.id) ||
    !Number.isInteger(body.version)
  )
    return fail(400, "예약 상태를 확인해 주세요");
  return atomicResult(db, async (tx) => {
    const v = await lockedVisit(tx, String(body.id));
    if (!v) return fail(404, "예약을 찾지 못했습니다");
    const [assigned] = await tx.query<{ zone: string | null }>(
      `select assigned_zone as zone from service_requests where id=$1`,
      [v.requestId],
    );
    if (
      !s!.isDesk &&
      placeOf(hubOf(v.hubId)!.placeId)!.zoneId !== s!.zoneId &&
      assigned?.zone !== s!.zoneId
    )
      return fail(403, "담당 구역에서 처리해 주세요");
    if (v.version !== body.version)
      return fail(409, "다른 직원이 먼저 변경했습니다");
    if (terminal(v)) return fail(409, "종료된 예약입니다");
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 150) : "";
    if (body.action === "claim" || body.action === "transfer") {
      const assigned = await claimWork(tx, s!, key, v, body, now);
      if (assigned.status !== 200) return assigned;
    } else if (body.action === "handover") {
      if (!["checked_in", "responding"].includes(v.state))
        return fail(409, "응대 중인 예약에서 직원 지원으로 전환해 주세요");
      await handoverLocked(tx, v, now);
    } else if (body.action === "delay") {
      if (!reason)
        return fail(400, "여객에게 보낼 지연·대체 안내를 적어 주세요");
      await tx.query(
        `update support_visits set notice=$2,updated_at=$3,version=version+1 where id=$1`,
        [v.id, reason, now],
      );
      await experienceEvent(tx, hash(key), "delay", 1, now);
    } else if (body.action === "missed") {
      if (
        v.state !== "booked" ||
        now.getTime() < Date.parse(v.startAt) + 15 * 60000
      )
        return fail(
          409,
          "예약 시각 15분 이후 미도착 예약만 종료할 수 있습니다",
        );
      await tx.query(
        `update support_visits set state='missed',ended_at=$2,updated_at=$2,version=version+1 where id=$1`,
        [v.id, now],
      );
      await tx.query(
        `update service_requests set state='cancelled',ended_at=$2,updated_at=$2,planned_at=null,version=version+1,last_action='missed' where id=$1`,
        [v.requestId ?? v.id, now],
      );
    } else return fail(400, "지원하지 않는 작업입니다");
    const next = await lockedVisit(tx, v.id);
    await logVisit(
      tx,
      v.id,
      next.version,
      String(body.action),
      s!.zoneId,
      now,
      reason,
    );
    return statusOf(tx, next);
  });
}
/** The normal staff work screen uses the same person and fulfilment as the appointment screen. */
export async function visitWorkAction(
  db: Db,
  s: Session,
  key: string,
  id: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  if (staffDenied(s, now) || !key)
    return fail(401, "근무 기기에서 다시 로그인해 주세요");
  await expireVisits(db, now);
  return atomicResult(db, async (tx) => {
    const [bound] = await tx.query<{ visitId: string }>(
      `select visit_id as "visitId" from service_requests where id=$1`,
      [id],
    );
    const v = bound?.visitId ? await lockedVisit(tx, bound.visitId) : undefined;
    if (!v) return fail(404, "예약을 찾지 못했습니다");
    const [job] = await tx.query<{
      version: number;
      assigned_crew: string | null;
    }>(
      `select version,assigned_crew from service_requests where id=$1 for update`,
      [id],
    );
    if (!job || job.version !== body.version)
      return fail(409, "요청 상태가 바뀌었습니다. 다시 확인해 주세요");
    const [scope] = await tx.query<{ zone: string | null }>(
      `select assigned_zone as zone from service_requests where id=$1`,
      [id],
    );
    if (
      !s.isDesk &&
      placeOf(hubOf(v.hubId)!.placeId)!.zoneId !== s.zoneId &&
      scope?.zone !== s.zoneId
    )
      return fail(403, "담당 구역에서 처리해 주세요");
    if (v.state === "booked")
      return fail(409, "예약된 여객의 도착 확인을 먼저 진행해 주세요");
    if (body.action === "assign" || body.action === "transfer") {
      if (body.zoneId && body.zoneId !== s.zoneId && body.action === "assign")
        return fail(
          400,
          "예약 지원은 직접 수락하거나 가용 직원에게 인계해 주세요",
        );
      const result = await claimWork(
        tx,
        s,
        key,
        v,
        {
          ...body,
          action: body.action === "assign" ? "claim" : "transfer",
          target: body.targetCrewId,
        },
        now,
      );
      if (result.status !== 200) return result;
      const { serviceRequestById } = await import("./service-requests");
      return serviceRequestById(tx, id);
    }
    const mine = await ensureCrew(tx, s, key, now);
    if (
      !["operator_cancel", "unavailable", "classify_business"].includes(
        String(body.action),
      ) &&
      job.assigned_crew !== mine.id
    )
      return fail(403, "담당 직원이 처리하거나 교대 인계를 진행해 주세요");
    const { actOnServiceRequest } = await import("./service-requests");
    return actOnServiceRequest(tx, s, id, body, now, {
      visitInternal: true,
      crewKey: key,
    });
  });
}

export async function experienceSummary(
  db: Db,
  s: Session | null,
  now: Date,
): Promise<ApiResult> {
  if (staffDenied(s, now) || !s!.isDesk)
    return fail(403, "안내데스크에서 확인해 주세요");
  await expireVisits(db, now);
  const [visits] = await db.query(
    `select count(*)::int as total,count(*) filter(where state='done' and service='robot' and handed_over_at is null)::int as "robotResolved",count(*) filter(where handed_over_at is not null)::int as handovers,count(*) filter(where state='missed')::int as missed,count(*) filter(where state='cancelled')::int as cancelled from support_visits where created_at>$1::timestamptz - interval '30 days'`,
    [now],
  );
  const events = await db.query(
    `select kind,count(*)::int as n,sum(value)::int as value from support_experience_events where at>$1::timestamptz - interval '30 days' group by kind`,
    [now],
  );
  const [response] = await db.query(
    `select (percentile_cont(.5) within group(order by extract(epoch from (accepted_at-created_at))) filter(where accepted_at is not null))::int as "medianAcceptSec",(percentile_cont(.5) within group(order by extract(epoch from (arrived_at-accepted_at))) filter(where arrived_at is not null))::int as "medianArrivalSec" from request_work_ledger where created_at>$1::timestamptz - interval '30 days'`,
    [now],
  );
  return ok({ visits, events, response, simulation: true });
}
