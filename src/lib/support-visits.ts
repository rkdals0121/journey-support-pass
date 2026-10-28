import { createHash } from "node:crypto";
import type { Db } from "./db";
import type { Session } from "./auth";
import { fail, ok, type ApiResult } from "./api/dto";
import { knownCodes } from "./catalog";
import { lookupPass } from "./api/public";
import { placeOf } from "./airport";
import { createServiceRequest, cancelServiceRequest } from "./service-requests";
import { DEFAULT_RULE, SERVICE_HUBS, hubOf, ruleBlock, VISIT_MINUTES, type HubRule, type VisitService, type VisitView } from "./service-hubs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const validReceipt = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const columns = `id,hub_id as "hubId",service,start_at as "startAt",state,task,choices,party,recognition,destination_id as "destinationId",request_id as "requestId",assigned_crew as "assignedCrew",version,created_at as "createdAt",notice`;
export const staffDenied = (s: Session | null, now: Date) => !s || s.isKiosk || s.needsZone || s.exp <= now.getTime();
export async function hubRules(db: Db): Promise<HubRule[]> {
  const saved = await db.query<HubRule>(`select hub_id as "hubId",service,open_hour as "openHour",close_hour as "closeHour",capacity,state,battery,available_after as "availableAfter",reason,version from support_hub_rules`);
  return SERVICE_HUBS.flatMap(h => (["robot", "mobility"] as VisitService[]).map(service => saved.find(r => r.hubId === h.id && r.service === service) ?? { ...DEFAULT_RULE, hubId: h.id, service }));
}
export async function expireVisits(db: Db, now: Date) {
  await db.query(`delete from support_visits where ended_at < $1::timestamptz - interval '30 days'`, [now]);
  await db.query(`update support_visits set recognition='',choices='{}',device_key='' where ended_at < $1::timestamptz - interval '24 hours' and (recognition<>'' or cardinality(choices)>0 or device_key<>'')`, [now]);
  await db.query(`delete from support_experience_events where at < $1::timestamptz - interval '30 days'`, [now]);
  await db.query(`delete from support_studies where at < $1::timestamptz - interval '90 days'`, [now]);
  await db.query(`delete from support_crew c where expires_at < $1::timestamptz - interval '1 day' and not exists(select 1 from support_visits v where v.assigned_crew=c.id and v.state in ('checked_in','responding','handed_over'))`, [now]);
  await db.query(`update support_visits set state='cancelled',ended_at=$1,updated_at=$1,version=version+1 where start_at < $1::timestamptz - interval '1 day' and (state in ('checked_in','responding') or (state='handed_over' and request_id is null))`, [now]);
  await db.query(`update support_visits set state='missed',ended_at=$1,updated_at=$1,version=version+1 where state='booked' and start_at + interval '30 minutes' <= $1`, [now]);
  await db.query(`update support_visits v set state='done',ended_at=$1,updated_at=$1,version=v.version+1 from service_requests r where v.request_id=r.id and v.state='handed_over' and r.state='done'`, [now]);
  await db.query(`update support_visits v set state='cancelled',ended_at=$1,updated_at=$1,version=v.version+1 from service_requests r where v.request_id=r.id and v.state='handed_over' and r.state in ('cancelled','unavailable','expired')`, [now]);
}
export async function visitSlots(db: Db, hubId: unknown, service: unknown, day: unknown, now: Date): Promise<ApiResult> {
  const hub = hubOf(hubId);
  if (!hub || !["robot", "mobility"].includes(String(service)) || typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, "거점·날짜·서비스를 확인해 주세요");
  const date = new Date(day + "T12:00:00+09:00");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return fail(400, "날짜를 확인해 주세요");
  await expireVisits(db, now);
  const rule = (await hubRules(db)).find(r => r.hubId === hub.id && r.service === service)!;
  const used = await db.query<{ startAt: Date; n: number }>(`select start_at as "startAt",count(*)::int as n from support_visits where hub_id=$1 and service=$2 and start_at >= $3 and start_at < $3::timestamptz + interval '1 day' and state in ('booked','checked_in','responding','handed_over') group by start_at`, [hub.id, service, day + "T00:00:00+09:00"]);
  const slots = [];
  for (let minute = rule.openHour * 60; minute + VISIT_MINUTES <= rule.closeHour * 60; minute += VISIT_MINUTES) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const start = new Date(`${day}T${label}:00+09:00`);
    const reason = ruleBlock(rule, start, now);
    const remaining = reason ? 0 : Math.max(0, rule.capacity - (used.find(x => new Date(x.startAt).getTime() === start.getTime())?.n ?? 0));
    slots.push({ startAt: start.toISOString(), label, remaining, reason: reason ?? (remaining ? "" : "예약 정원이 찼습니다") });
  }
  return ok({ hub, rule, slots, simulation: true });
}
async function ownVisit(db: Db, receipt: string) { return (await db.query<VisitView>(`select ${columns} from support_visits where receipt_hash=$1`, [hash(receipt)]))[0]; }
export async function visitStatus(db: Db, receipt: unknown, now: Date): Promise<ApiResult> {
  if (!validReceipt(receipt)) return fail(400, "예약 확인값을 확인해 주세요");
  await expireVisits(db, now);
  const visit = await ownVisit(db, receipt);
  if (!visit) return fail(404, "예약을 찾지 못했습니다");
  const history = await db.query(`select version,action,actor,at,reason from support_visit_history where visit_id=$1 order by version`, [visit.id]);
  return ok({ visit, hub: hubOf(visit.hubId), history, simulation: true });
}
export async function bookVisit(db: Db, body: Record<string, unknown>, device: string, now: Date): Promise<ApiResult> {
  if (!validReceipt(body.receipt) || body.consent !== true) return fail(400, "예약 확인과 정보 전달 동의가 필요합니다");
  await expireVisits(db, now);
  const old = await ownVisit(db, body.receipt);
  if (old) return ok({ visit: old, simulation: true });
  const hub = hubOf(body.hubId);
  const service = body.service as VisitService;
  const start = new Date(typeof body.startAt === "string" ? body.startAt : "");
  if (!hub || !["robot", "mobility"].includes(service) || !Number.isFinite(start.getTime())) return fail(400, "거점·서비스·시간대를 확인해 주세요");
  const rule = (await hubRules(db)).find(r => r.hubId === hub.id && r.service === service)!;
  const reason = ruleBlock(rule, start, now);
  if (reason) return fail(409, reason);
  if (!Number.isInteger(body.party) || Number(body.party) < 1 || Number(body.party) > 20 || !["directions", "wheelchair", "escort"].includes(String(body.task))) return fail(400, "인원과 필요한 도움을 확인해 주세요");
  if ((service === "robot" && body.task !== "directions") || (service === "mobility" && body.task === "directions")) return fail(400, "응대 방식과 필요한 도움을 확인해 주세요");
  const recognition = typeof body.recognition === "string" ? body.recognition.trim() : "";
  if (recognition.length > 100) return fail(400, "인상착의는 100자 이내로 적어 주세요");
  let choices = knownCodes(Array.isArray(body.choices) ? body.choices.filter((c): c is string => typeof c === "string") : []);
  if (body.registrationToken) {
    const found = await lookupPass(db, String(body.registrationToken), now);
    if (found.kind !== "ok") return fail(410, "사전등록을 다시 확인해 주세요");
    choices = found.journey.choices;
  }
  const [limit] = await db.query<{ n: number }>(`select count(*)::int as n from support_visits where device_key=$1 and created_at>$2::timestamptz - interval '24 hours'`, [device, now]);
  if (limit.n >= 10) return fail(429, "이 기기의 예약 한도를 넘었습니다. 직원에게 문의해 주세요");
  for (let seat = 1; seat <= rule.capacity; seat++) {
    const rows = await db.query<VisitView>(`with booked as (insert into support_visits(receipt_hash,hub_id,service,start_at,seat,task,choices,party,recognition,created_at,updated_at,device_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) on conflict do nothing returning *), logged as (insert into support_visit_history(visit_id,version,action,actor,at) select id,version,'book','passenger',$10 from booked on conflict do nothing) select ${columns} from booked`, [hash(body.receipt), hub.id, service, start, seat, body.task, choices, body.party, recognition, now, device]);
    if (rows[0]) return ok({ visit: rows[0], simulation: true });
    const retry = await ownVisit(db, body.receipt);
    if (retry) return ok({ visit: retry, simulation: true });
  }
  return fail(409, "방금 예약이 마감됐습니다. 다른 시간대를 골라 주세요");
}
export async function changeVisit(db: Db, body: Record<string, unknown>, device: string, now: Date): Promise<ApiResult> {
  if (!validReceipt(body.receipt)) return fail(400, "예약 확인값을 확인해 주세요");
  await expireVisits(db, now);
  const v = await ownVisit(db, body.receipt);
  if (!v) return fail(404, "예약을 찾지 못했습니다");
  if (v.version !== body.version) return fail(409, "예약 상태가 바뀌었습니다. 새로 확인해 주세요");
  const action = String(body.action);
  if (action === "reschedule") {
    if (v.state !== "booked") return fail(409, "방문 전 예약만 변경할 수 있습니다");
    const hub = hubOf(body.hubId), start = new Date(String(body.startAt));
    if (!hub || !Number.isFinite(start.getTime())) return fail(400, "거점과 시간을 확인해 주세요");
    const rule = (await hubRules(db)).find(r => r.hubId === hub.id && r.service === v.service)!;
    const blocked = ruleBlock(rule, start, now);
    if (blocked) return fail(409, blocked);
    for (let seat = 1; seat <= rule.capacity; seat++) {
      try {
        const changed = await db.query(`update support_visits set hub_id=$3,start_at=$4,seat=$5,updated_at=$6,version=version+1 where id=$1 and version=$2 and state='booked' returning id`, [v.id, v.version, hub.id, start, seat, now]);
        if (!changed.length) return fail(409, "다른 변경이 먼저 적용됐습니다");
        await logVisit(db, v.id, v.version + 1, action, "passenger", now);
        return visitStatus(db, body.receipt, now);
      } catch (e) { if ((e as { code?: string }).code !== "23505") throw e; }
    }
    return fail(409, "해당 시간대 정원이 찼습니다. 기존 예약은 유지됩니다");
  }
  let next: string;
  if (action === "cancel" && !["done", "cancelled", "missed"].includes(v.state)) {
    if (v.requestId) {
      const cancelled = await cancelServiceRequest(db, body.receipt, now);
      if (cancelled.status !== 200) return cancelled;
    }
    next = "cancelled";
  } else if (action === "checkin" && v.state === "booked") {
    if (Math.abs(new Date(v.startAt).getTime() - now.getTime()) > 15 * 60000) return fail(409, "예약 시간 15분 전부터 도착을 알릴 수 있습니다");
    const rule = (await hubRules(db)).find(r => r.hubId === v.hubId && r.service === v.service)!;
    if (rule.state !== "ready" || rule.battery < 20 || (rule.availableAfter && Date.parse(rule.availableAfter) > now.getTime())) return fail(409, "지금은 장비가 준비되지 않았습니다. 시간 변경 또는 현장 직원 도움을 선택해 주세요");
    next = "checked_in";
  } else if (action === "respond" && v.state === "checked_in" && v.service === "robot") next = "responding";
  else if (action === "complete" && v.state === "responding" && body.confirmed === true) next = "done";
  else if (action === "handover" && (["checked_in", "responding"].includes(v.state) || (v.state === "handed_over" && !v.requestId))) {
    const hub = hubOf(v.hubId)!;
    const claiming = await db.query(`update support_visits set state='handed_over',updated_at=$3,version=version+1 where id=$1 and version=$2 returning version`, [v.id, v.version, now]);
    if (!claiming.length) return fail(409, "다른 변경이 먼저 적용됐습니다");
    const request = await createServiceRequest(db, null, { receipt: body.receipt, service: v.service === "mobility" ? "mobility" : "guidance", topicId: v.service === "mobility" ? "mobility" : "guidance", placeId: hub.placeId, choices: v.choices, party: v.party, note: `거점 예약 인계 · ${v.task}${v.recognition ? " · " + v.recognition : ""}`.slice(0, 200), lang: "ko", consent: true, serviceDetails: v.service === "mobility" ? { task: v.task === "wheelchair" ? "mobility-wheelchair" : "mobility-escort", fields: {} } : { task: "guidance-person", fields: { purpose: "로봇 안내에서 직원에게 인계" } } }, device, now);
    if (request.status !== 200) {
      await db.query(`update support_visits set state=$3,updated_at=$4,version=version+1 where id=$1 and version=$2 and request_id is null`, [v.id, v.version + 1, v.state === "handed_over" ? "checked_in" : v.state, now]);
      return request;
    }
    const requestId = (request.body.request as { id: string }).id;
    const linked = await db.query(`update support_visits set request_id=$3,updated_at=$4,version=version+1 where id=$1 and version=$2 and state='handed_over' returning id`, [v.id, v.version + 1, requestId, now]);
    if (!linked.length) {
      await cancelServiceRequest(db, body.receipt, now);
      return fail(409, "예약이 변경되어 인계하지 않았습니다. 상태를 다시 확인해 주세요");
    }
    await logVisit(db, v.id, v.version + 2, "handover", "passenger", now);
    await experienceEvent(db, device, "handover", 1, now);
    return visitStatus(db, body.receipt, now);
  } else return fail(409, "현재 상태에서는 이 동작을 할 수 없습니다");
  const updated = await db.query(`update support_visits set state=$3,updated_at=$4::timestamptz,version=version+1,ended_at=case when $3 in ('done','cancelled') then $4::timestamptz else null end where id=$1 and version=$2 returning id`, [v.id, v.version, next, now]);
  if (!updated.length) return fail(409, "다른 변경이 먼저 적용됐습니다");
  await logVisit(db, v.id, v.version + 1, action, "passenger", now);
  if (action === "complete") await experienceEvent(db, device, "robot_complete", 1, now);
  return visitStatus(db, body.receipt, now);
}
async function logVisit(db: Db, id: string, version: number, action: string, actor: string, now: Date, reason = "") { await db.query(`insert into support_visit_history(visit_id,version,action,actor,at,reason) values($1,$2,$3,$4,$5,$6) on conflict(visit_id,version) do update set action=excluded.action,actor=excluded.actor,reason=excluded.reason`, [id, version, action, actor, now, reason]); }
export async function experienceEvent(db: Db, device: string, kind: string, value: number, now: Date) {
  if (!["stamp_start", "stamp_finish", "stamp_share", "robot_complete", "handover", "delay", "paper_replaced"].includes(kind) || !Number.isInteger(value) || value < 0 || value > 1000) return;
  const [count] = await db.query<{ n: number }>(`select count(*)::int as n from support_experience_events where device_key=$1 and at>$2::timestamptz - interval '1 hour'`, [device, now]);
  if (count.n < 50) await db.query(`insert into support_experience_events(at,device_key,kind,value) values($1,$2,$3,$4)`, [now, device, kind, value]);
}

export async function updateHubRule(db: Db, s: Session | null, body: Record<string, unknown>, now: Date): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  if (!s!.isDesk) return fail(403, "운영 기준 변경은 안내데스크에서 처리합니다");
  const hub = hubOf(body.hubId);
  if (!hub || !["robot", "mobility"].includes(String(body.service)) || ![body.openHour, body.closeHour, body.capacity, body.battery, body.version].every(Number.isInteger) || Number(body.openHour) < 0 || Number(body.closeHour) > 24 || Number(body.closeHour) <= Number(body.openHour) || Number(body.capacity) < 0 || Number(body.capacity) > 4 || Number(body.battery) < 0 || Number(body.battery) > 100 || !["ready", "paused", "charging"].includes(String(body.state))) return fail(400, "운영시간·정원·장비 준비 상태를 확인해 주세요");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > 150 || (body.state !== "ready" && !reason)) return fail(400, "운영 중지·충전 사유를 150자 이내로 적어 주세요");
  const available = body.availableAfter ? new Date(String(body.availableAfter)) : null;
  if (available && !Number.isFinite(available.getTime())) return fail(400, "운영 재개 예상 시각을 확인해 주세요");
  const rows = await db.query(`insert into support_hub_rules(hub_id,service,open_hour,close_hour,capacity,state,battery,available_after,reason,version) select $1,$2,$3,$4,$5,$6,$7,$8,$9,1 where $10::int=0 on conflict(hub_id,service) do update set open_hour=$3,close_hour=$4,capacity=$5,state=$6,battery=$7,available_after=$8,reason=$9,version=support_hub_rules.version+1 where support_hub_rules.version=$10 returning version`, [hub.id, body.service, body.openHour, body.closeHour, body.capacity, body.state, body.battery, available, reason, body.version]);
  if (!rows.length && Number(body.version) > 0) {
    const updated = await db.query(`update support_hub_rules set open_hour=$3,close_hour=$4,capacity=$5,state=$6,battery=$7,available_after=$8,reason=$9,version=version+1 where hub_id=$1 and service=$2 and version=$10 returning version`, [hub.id, body.service, body.openHour, body.closeHour, body.capacity, body.state, body.battery, available, reason, body.version]);
    if (!updated.length) return fail(409, "다른 직원이 변경했습니다. 최신 기준을 다시 불러와 주세요");
  } else if (!rows.length) return fail(409, "다른 직원이 변경했습니다. 최신 기준을 다시 불러와 주세요");
  return ok({ rules: await hubRules(db) });
}

export async function crewShift(db: Db, s: Session | null, key: string, body: Record<string, unknown>, now: Date): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 30 || !["available", "busy", "away"].includes(String(body.state))) return fail(400, "근무 표시 이름과 상태를 확인해 주세요");
  const [existing] = await db.query<{ id: string; zone: string }>(`select id,zone_id as zone from support_crew where session_hash=$1`, [hash(key)]);
  if (existing && (body.state === "away" || existing.zone !== s!.zoneId)) {
    const active = await db.query(`select id from support_visits where assigned_crew=$1 and state in ('checked_in','responding','handed_over')`, [existing.id]);
    if (active.length) return fail(409, "담당 중인 예약을 다른 직원에게 인계한 뒤 근무를 변경해 주세요");
  }
  const [crew] = await db.query(`insert into support_crew(session_hash,zone_id,label,state,expires_at) values($1,$2,$3,$4,$5) on conflict(session_hash) do update set zone_id=$2,label=$3,state=$4,expires_at=$5,version=support_crew.version+1 returning id,label,state,zone_id as "zoneId",version`, [hash(key), s!.zoneId, label, body.state, new Date(Math.min(s!.exp, now.getTime() + 4 * 3600000))]);
  return ok({ crew });
}
export async function staffVisits(db: Db, s: Session | null, key: string, now: Date): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  await expireVisits(db, now);
  const hubs = SERVICE_HUBS.filter(h => s!.isDesk || placeOf(h.placeId)?.zoneId === s!.zoneId).map(h => h.id);
  const visits = await db.query<VisitView>(`select ${columns} from support_visits where hub_id=any($1::text[]) and start_at>$2::timestamptz - interval '1 day' order by start_at,id limit 150`, [hubs, now]);
  const crew = await db.query(`select c.id,c.label,c.zone_id as "zoneId",case when exists(select 1 from support_visits v where v.assigned_crew=c.id and v.state in ('checked_in','responding','handed_over')) then 'busy' else c.state end as state,c.expires_at as "expiresAt",c.session_hash=$2 as mine,c.version from support_crew c where c.expires_at>$1 and ($3::boolean or c.zone_id=$4) order by c.label`, [now, hash(key), s!.isDesk, s!.zoneId]);
  return ok({ visits, crew, rules: await hubRules(db), simulation: true });
}
export async function staffVisitAction(db: Db, s: Session | null, key: string, body: Record<string, unknown>, now: Date): Promise<ApiResult> {
  if (staffDenied(s, now)) return fail(401, "직원 로그인이 필요합니다");
  await expireVisits(db, now);
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id) || !Number.isInteger(body.version)) return fail(400, "예약 상태를 확인해 주세요");
  const [v] = await db.query<VisitView>(`select ${columns} from support_visits where id=$1`, [body.id]);
  if (!v) return fail(404, "예약을 찾지 못했습니다");
  if (!s!.isDesk && placeOf(hubOf(v.hubId)?.placeId)?.zoneId !== s!.zoneId) return fail(403, "담당 구역에서 처리해 주세요");
  if (v.version !== body.version) return fail(409, "다른 직원이 먼저 변경했습니다");
  if (["done", "cancelled", "missed"].includes(v.state)) return fail(409, "종료된 예약입니다");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 150) : "";
  if (body.action === "claim" || body.action === "transfer") {
    if (v.state === "booked") return fail(409, "도착 확인 후 현장 담당자가 수락해 주세요");
    const [mine] = await db.query<{ id: string }>(`select id from support_crew where session_hash=$1 and expires_at>$2 and state='available'`, [hash(key), now]);
    const target = body.action === "claim" ? mine?.id : body.target;
    if (typeof target !== "string" || !/^[a-f0-9-]{36}$/i.test(target)) return fail(400, "가용 근무자를 선택해 주세요");
    if (body.action === "claim" && v.assignedCrew) return fail(409, "이미 현장 담당자가 있습니다. 인계를 이용해 주세요");
    if (body.action === "transfer" && (!reason || (!s!.isDesk && v.assignedCrew !== mine?.id))) return fail(403, "본인 담당 예약에서 인계 사유를 적어 주세요");
    try {
      const rows = await db.query(`update support_visits set assigned_crew=$3,version=version+1,updated_at=$4 where id=$1 and version=$2 and exists(select 1 from support_crew c where c.id=$3 and c.state='available' and c.expires_at>$4 and ($5::boolean or c.zone_id=$6)) and not exists(select 1 from support_visits other where other.id<>$1 and other.assigned_crew=$3 and other.state in ('checked_in','responding','handed_over')) returning id`, [v.id, v.version, target, now, s!.isDesk, s!.zoneId]);
      if (!rows.length) return fail(409, "근무자가 처리 중이거나 예약이 변경됐습니다");
    } catch (e) { if ((e as { code?: string }).code === "23505") return fail(409, "이 근무자는 다른 예약을 처리 중입니다"); throw e; }
  } else if (body.action === "delay") {
    if (!reason) return fail(400, "여객에게 보낼 지연·대체 안내를 적어 주세요");
    const changed = await db.query(`update support_visits set notice=$3,updated_at=$4,version=version+1 where id=$1 and version=$2 returning id`, [v.id, v.version, reason, now]);
    if (!changed.length) return fail(409, "다른 변경이 먼저 적용됐습니다");
    await experienceEvent(db, hash(key), "delay", 1, now);
  } else if (body.action === "missed") {
    if (v.state !== "booked" || now.getTime() < new Date(v.startAt).getTime() + 15 * 60000) return fail(409, "예약 시각 15분 이후 미도착 예약만 종료할 수 있습니다");
    await db.query(`update support_visits set state='missed',ended_at=$3,updated_at=$3,version=version+1 where id=$1 and version=$2`, [v.id, v.version, now]);
  } else return fail(400, "지원하지 않는 작업입니다");
  await logVisit(db, v.id, v.version + 1, String(body.action), s!.zoneId, now, reason);
  return ok({ changed: true });
}

export async function experienceSummary(db: Db, s: Session | null, now: Date): Promise<ApiResult> {
  if (staffDenied(s, now) || !s!.isDesk) return fail(403, "안내데스크에서 확인해 주세요");
  await expireVisits(db, now);
  const [visits] = await db.query(`select count(*)::int as total,count(*) filter(where state='done' and request_id is null)::int as "robotResolved",count(*) filter(where request_id is not null)::int as handovers,count(*) filter(where state='missed')::int as missed,count(*) filter(where state='cancelled')::int as cancelled from support_visits where created_at>$1::timestamptz - interval '30 days'`, [now]);
  const events = await db.query(`select kind,count(*)::int as n,sum(value)::int as value from support_experience_events where at>$1::timestamptz - interval '30 days' group by kind`, [now]);
  const [response] = await db.query(`select (percentile_cont(.5) within group(order by extract(epoch from (accepted_at-created_at))) filter(where accepted_at is not null))::int as "medianAcceptSec",(percentile_cont(.5) within group(order by extract(epoch from (arrived_at-accepted_at))) filter(where arrived_at is not null))::int as "medianArrivalSec" from request_work_ledger where created_at>$1::timestamptz - interval '30 days'`, [now]);
  return ok({ visits, events, response, simulation: true });
}
