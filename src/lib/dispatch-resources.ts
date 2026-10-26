import type { Db } from "./db";
import type { Session } from "./auth";
import { fail, ok, type ApiResult } from "./api/dto";
import { isUuid } from "./registrations";
import { expireServiceRequests } from "./request-retention";
import type { DispatchResource } from "./resource-model";

function denied(s: Session | null) {
  if (!s || s.isKiosk) return fail(401, "직원 로그인이 필요합니다");
  if (s.needsZone) return fail(409, "근무 구역을 먼저 골라 주세요");
  return null;
}
export async function resourceSnapshot(db: Db): Promise<DispatchResource[]> {
  return db.query<DispatchResource>(`
    select d.id,d.label,d.kind,d.zone_id as "zoneId",z.label as zone,
     case when z.active then d.status else 'offline' end as status,d.version,
     r.id as "requestId"
    from dispatch_resources d join zones z on z.id=d.zone_id
    left join service_requests r on r.resource_id=d.id
     and r.state in ('received','assigned','en_route','arrived','serving')
    order by d.kind,d.label
  `);
}
export async function listResources(
  db: Db,
  s: Session | null,
  now: Date,
): Promise<ApiResult> {
  const auth = denied(s);
  if (auth) return auth;
  await expireServiceRequests(db, now);
  return ok({
    resources: await resourceSnapshot(db),
    zones: await db.query(
      "select id,label from zones where active and not is_kiosk and not is_common order by label",
    ),
    isDesk: s!.isDesk,
  });
}
const errors: Record<string, [number, string]> = {
  resource_missing: [404, "장비를 찾을 수 없습니다"],
  request_missing: [404, "요청을 찾을 수 없거나 보관 기간이 끝났습니다"],
  not_ready: [409, "점검 중이거나 운영 중지된 장비입니다"],
  stale: [409, "다른 직원이 변경했습니다. 최신 내용을 확인해 주세요"],
  forbidden: [403, "담당 구역 또는 안내데스크에서 배차해 주세요"],
  stage: [409, "담당 배정 후 출발하기 전에 장비를 배차하거나 해제해 주세요"],
  location_pending: [
    409,
    "여객의 위치 변경 요청을 확인한 뒤 장비를 배차해 주세요",
  ],
  kind: [400, "요청 서비스와 같은 종류의 장비를 선택해 주세요"],
  busy: [
    409,
    "이미 배차된 장비입니다. 요청이 종료되거나 배차를 해제한 뒤 변경해 주세요",
  ],
  status: [400, "장비 상태를 확인해 주세요"],
};
export async function mutateResource(
  db: Db,
  s: Session | null,
  body: Record<string, unknown>,
  now: Date,
): Promise<ApiResult> {
  const auth = denied(s);
  if (auth) return auth;
  await expireServiceRequests(db, now);
  if (body.action === "create") {
    if (!s!.isDesk) return fail(403, "장비 등록은 안내데스크에서 처리합니다");
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (
      !label ||
      label.length > 40 ||
      !["robot", "mobility"].includes(String(body.kind))
    )
      return fail(400, "장비 이름(40자 이내)과 종류를 확인해 주세요");
    if (typeof body.zoneId !== "string")
      return fail(400, "장비의 기준 구역을 선택해 주세요");
    const [zone] = await db.query(
      "select id from zones where id=$1 and active and not is_kiosk and not is_common",
      [body.zoneId],
    );
    if (!zone) return fail(400, "장비의 기준 구역을 확인해 주세요");
    const rows = await db.query(
      "insert into dispatch_resources(label,kind,zone_id,created_at,updated_at) values($1,$2,$3,$4,$4) on conflict(label) do nothing returning id",
      [label, body.kind, body.zoneId, now],
    );
    return rows.length
      ? ok({ id: rows[0].id })
      : fail(409, "같은 이름의 장비가 있습니다");
  }
  if (body.action === "allocate") {
    if (
      !isUuid(body.requestId) ||
      !Number.isInteger(body.version) ||
      (body.resourceId !== null && !isUuid(body.resourceId))
    )
      return fail(400, "요청과 배차할 장비를 다시 확인해 주세요");
    const [result] = await db.query<{ result: string }>(
      "select allocate_dispatch_resource($1,$2,$3,$4,$5,$6) as result",
      [
        body.requestId,
        body.version,
        body.resourceId,
        s!.zoneId,
        s!.isDesk,
        now,
      ],
    );
    if (["ok", "unchanged"].includes(result.result)) return ok();
    const error = errors[result.result];
    return error ? fail(...error) : fail(409, "배차 내용을 다시 확인해 주세요");
  }
  if (body.action === "status") {
    if (!s!.isDesk)
      return fail(403, "장비 상태 변경은 안내데스크에서 처리합니다");
    if (
      !isUuid(body.id) ||
      !Number.isInteger(body.version) ||
      !["ready", "maintenance", "offline"].includes(String(body.status))
    )
      return fail(400, "장비 상태를 다시 확인해 주세요");
    const [result] = await db.query<{ result: string }>(
      "select change_dispatch_resource_status($1,$2,$3,$4) as result",
      [body.id, body.version, body.status, now],
    );
    if (result.result === "ok") return ok();
    const error = errors[result.result];
    return error ? fail(...error) : fail(409, "장비 내용을 다시 확인해 주세요");
  }
  return fail(400, "장비 작업을 확인해 주세요");
}
