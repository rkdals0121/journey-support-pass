import type { Db } from "./db";
import { placeOf } from "./airport";
import {
  DEFAULT_RULE,
  SERVICE_HUBS,
  hubOf,
  type HubRule,
  type VisitService,
} from "./service-hubs";
import { fail, type ApiResult } from "./api/dto";

export async function hubRules(db: Db): Promise<HubRule[]> {
  const saved = await db.query<HubRule>(
    `select hub_id as "hubId",service,open_hour as "openHour",close_hour as "closeHour",capacity,state,battery,available_after as "availableAfter",reason,version from support_hub_rules`,
  );
  return SERVICE_HUBS.flatMap((h) =>
    (["robot", "mobility"] as VisitService[]).map(
      (service) =>
        saved.find((r) => r.hubId === h.id && r.service === service) ?? {
          ...DEFAULT_RULE,
          hubId: h.id,
          service,
        },
    ),
  );
}

export function operatingHub(placeId: string) {
  const exact = SERVICE_HUBS.find((h) => h.placeId === placeId);
  if (exact) return exact;
  const p = placeOf(placeId);
  return p
    ? SERVICE_HUBS.find((h) => {
        const hp = placeOf(h.placeId)!;
        return hp.area === p.area && hp.landside === p.landside;
      })
    : undefined;
}

export async function operatingBlock(
  db: Db,
  placeId: string,
  service: string,
  now: Date,
  arrivalOnly = false,
): Promise<ApiResult | null> {
  if (service !== "robot" && service !== "mobility") return null;
  const hub = operatingHub(placeId);
  if (!hub) return null;
  const rule = (await hubRules(db)).find(
    (r) => r.hubId === hub.id && r.service === service,
  )!;
  const minute = ((now.getUTCHours() + 9) % 24) * 60 + now.getUTCMinutes();
  let reason = "";
  if (
    !arrivalOnly &&
    (minute < rule.openHour * 60 || minute >= rule.closeHour * 60)
  )
    reason = `운영시간은 한국시간 ${rule.openHour}:00~${rule.closeHour}:00입니다. 예약하거나 직원 안내를 이용해 주세요`;
  if (rule.capacity === 0)
    reason =
      "현재 이용 가능한 장비가 없습니다. 다른 시간 또는 직원 안내를 선택해 주세요";
  if (
    rule.state !== "ready" ||
    rule.battery < 20 ||
    (rule.availableAfter && Date.parse(rule.availableAfter) > now.getTime())
  )
    reason =
      rule.reason ||
      "장비 준비·충전 확인 중입니다. 시간 변경 또는 직원 안내를 선택해 주세요";
  if (!reason && !arrivalOnly) {
    const [pool] = await db.query<{ total: number; ready: number }>(
      `select count(*)::int as total,count(*) filter(where d.status='ready' and z.active and not exists(select 1 from support_resource_holds h where h.resource_id=d.id and (h.active or h.release_at>$3)) and not exists(select 1 from service_requests r where r.resource_id=d.id and r.state in ('received','assigned','en_route','arrived','serving')))::int as ready from dispatch_resources d join zones z on z.id=d.zone_id where d.hub_id=$1 and d.kind=$2`,
      [hub.id, service, now],
    );
    if (pool.total && !pool.ready)
      reason =
        "장비가 응대·복귀 또는 점검 중입니다. 예약 시간을 바꾸거나 직원 안내를 선택해 주세요";
  }
  if (!reason) return null;
  return {
    ...fail(409, reason, "support_unavailable"),
    body: {
      error: reason,
      code: "support_unavailable",
      errorEn:
        "This assistance is not available now. Choose another appointment time or request staff guidance.",
      alternativeHref: `/visits?hub=${hub.id}`,
      staffHref: `/help?topic=guidance&place=${hub.placeId}&fresh=1`,
    },
  };
}

/** Explicitly labelled prototype units in the existing inventory, never real hardware discovery. */
export async function ensureHubUnits(
  db: Db,
  hubId: string,
  service: VisitService,
  capacity: number,
  now: Date,
) {
  const hub = hubOf(hubId)!;
  const place = placeOf(hub.placeId)!;
  for (let n = 1; n <= capacity; n++) {
    await db.query(
      `insert into dispatch_resources(label,kind,zone_id,hub_id,unit_no,created_at,updated_at)
      select $1,$2,$3,$4,$5,$6,$6 where exists(select 1 from zones where id=$3)
      and (select count(*) from dispatch_resources where hub_id=$4 and kind=$2)<$5::int
      on conflict do nothing`,
      [
        `시연 ${hub.code} ${service === "robot" ? "로봇" : "이동"} ${n}`,
        service,
        place.zoneId,
        hub.id,
        n,
        now,
      ],
    );
  }
}

export async function claimHubResource(
  db: Db,
  visitId: string,
  hubId: string,
  service: VisitService,
  capacity: number,
  now: Date,
) {
  await db.query(
    `insert into support_hub_rules(hub_id,service) values($1,$2) on conflict do nothing`,
    [hubId, service],
  );
  await db.query(
    `select capacity from support_hub_rules where hub_id=$1 and service=$2 for update`,
    [hubId, service],
  );
  await ensureHubUnits(db, hubId, service, capacity, now);
  const candidates = await db.query<{ id: string }>(
    `select d.id from dispatch_resources d join zones z on z.id=d.zone_id
    where d.hub_id=$1 and d.kind=$2 and d.status='ready' and z.active
    and d.id in (select id from dispatch_resources where hub_id=$1 and kind=$2 order by (status='ready') desc,unit_no nulls last,id limit $5)
    and not exists(select 1 from service_requests r where r.resource_id=d.id and r.id<>$3 and r.state in ('received','assigned','en_route','arrived','serving'))
    and not exists(select 1 from support_resource_holds h where h.resource_id=d.id and h.visit_id<>$3 and (h.active or h.release_at>$4))
    order by d.unit_no nulls last,d.id for update of d skip locked limit $5`,
    [hubId, service, visitId, now, capacity],
  );
  for (const gear of candidates) {
    const held = await db.query(
      `insert into support_resource_holds(resource_id,visit_id,active,updated_at)
      values($1,$2,true,$3) on conflict(resource_id) do update set visit_id=$2,active=true,release_at=null,updated_at=$3
      where support_resource_holds.visit_id=$2 or (not support_resource_holds.active and support_resource_holds.release_at<=$3)
      returning resource_id`,
      [gear.id, visitId, now],
    );
    if (held.length) return gear.id;
  }
  return null;
}

/** A partial equipment outage reduces bookable capacity; active work only affects immediate dispatch. */
export async function availableHubRule(
  db: Db,
  rule: HubRule,
): Promise<HubRule> {
  const [pool] = await db.query<{ total: number; ready: number }>(
    `select count(*)::int as total,count(*) filter(where d.status='ready' and z.active)::int as ready from dispatch_resources d join zones z on z.id=d.zone_id where d.hub_id=$1 and d.kind=$2`,
    [rule.hubId, rule.service],
  );
  return {
    ...rule,
    capacity: pool.total ? Math.min(rule.capacity, pool.ready) : rule.capacity,
  };
}
