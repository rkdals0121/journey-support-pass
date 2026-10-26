import { expireServiceRequests } from "./request-retention";
import type { Db } from "./db";
import type { Session } from "./auth";
import { ok, fail } from "./api/dto";
import { closeStale } from "./calls";
import { closeStaleAssist } from "./assist";
import { isUuid } from "./registrations";
import { attentionPredicate } from "./request-queue";
import type { OperationalSummary } from "./service-request-model";

export async function operationalSummary(
  db: Db,
  since: Date,
  now: Date,
): Promise<OperationalSummary> {
  await expireServiceRequests(db, now);
  await closeStale(db, now);
  await closeStaleAssist(db, now);
  const [summary] = await db.query<OperationalSummary>(
    `select count(*)::int as total,
 count(*) filter(where registration_linked)::int as linked,
 count(*) filter(where state='received')::int as received,
 count(*) filter(where state in ('received','assigned','en_route','arrived','serving'))::int as active,
 count(*) filter(where state='done')::int as done,
 count(*) filter(where state='cancelled')::int as cancelled,
 count(*) filter(where state='unavailable')::int as unavailable,
 count(*) filter(where state='expired')::int as expired,
 count(*) filter(where ${attentionPredicate("$2")})::int as "awaitingAttention",
 (percentile_cont(.5) within group(order by extract(epoch from (accepted_at-created_at))) filter(where accepted_at is not null))::int as "medianAcceptSec",
 (percentile_cont(.5) within group(order by extract(epoch from (arrived_at-accepted_at))) filter(where arrived_at is not null and accepted_at is not null))::int as "medianArrivalSec"
 from request_work_ledger where created_at >= $1`,
    [since, now],
  );
  const grouped = await db.query<{
    service: string;
    queue: string;
    source: string;
    n: number;
  }>(
    "select service,queue,source,count(*)::int as n from request_work_ledger where created_at >= $1 group by service,queue,source",
    [since],
  );
  summary.byService = { guidance: 0, robot: 0, mobility: 0 };
  summary.byQueue = { integrated: 0, call: 0, assist: 0 };
  summary.bySource = {};
  for (const row of grouped) {
    summary.byService[row.service as keyof typeof summary.byService] += row.n;
    summary.byQueue[row.queue as keyof typeof summary.byQueue] += row.n;
    summary.bySource[row.source] = (summary.bySource[row.source] ?? 0) + row.n;
  }
  return summary;
}
export async function legacyRequestHistory(
  db: Db,
  s: Session,
  id: string,
  now: Date,
) {
  if (s.isKiosk || s.needsZone || s.exp <= now.getTime())
    return fail(401, "직원 로그인이 필요합니다");
  const match = /^(call|assist):(.+)$/.exec(id);
  if (!match || !isUuid(match[2]))
    return fail(400, "요청 번호를 확인해 주세요");
  await expireServiceRequests(db, now);
  const table = match[1] === "call" ? "calls" : "assist_requests";
  const [row] = await db.query<{
    ended_at: Date | null;
    operator_actor_zone: string | null;
    operator_reason: string;
    operator_closed_version: number | null;
  }>(
    `select ended_at,operator_actor_zone,operator_reason,operator_closed_version from ${table} where id=$1`,
    [match[2]],
  );
  if (!row) return fail(404, "요청을 찾을 수 없습니다");
  return ok({
    history:
      row.ended_at &&
      row.operator_actor_zone &&
      row.operator_closed_version !== null
        ? [
            {
              version: Number(row.operator_closed_version),
              at: row.ended_at.toISOString(),
              action: "operator_cancel",
              state: "cancelled",
              actorZone: row.operator_actor_zone,
              assignedZone: null,
              reason: row.operator_reason,
            },
          ]
        : [],
  });
}
export async function legacyWorkAction(
  db: Db,
  s: Session,
  id: string,
  body: Record<string, unknown>,
  now: Date,
) {
  if (s.exp <= now.getTime()) return fail(401, "직원 로그인이 필요합니다");
  const match = /^(call|assist):(.+)$/.exec(id);
  if (!match || !isUuid(match[2]))
    return fail(400, "요청 번호를 확인해 주세요");
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0)
    return fail(400, "요청 버전을 확인해 주세요");
  await closeStale(db, now);
  await closeStaleAssist(db, now);
  const [row] = await db.query<{
    version: number;
    assigned_zone: string | null;
    state: string;
  }>(
    "select version,assigned_zone,state from request_work_ledger where id=$1",
    [id],
  );
  if (!row) return fail(404, "요청을 찾을 수 없습니다");
  if (row.version !== body.version)
    return fail(409, "요청이 바뀌었습니다. 새로 확인해 주세요");
  if (body.action === "operator_cancel") {
    if (!s.isDesk) return fail(403, "운영자 종료는 안내데스크에서 확인합니다");
    if (body.confirmed !== true)
      return fail(400, "실제 지원 여부를 현장에서 확인한 뒤 종료해 주세요");
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 120
    )
      return fail(400, "종료 사유를 120자 이내로 적어 주세요");
    const sql =
      match[1] === "call"
        ? `update calls set ended_at=$3,end_kind='cancelled',operator_reason=$4,operator_actor_zone=$5,operator_closed_version=work_version+1
       where id=$1 and work_version=$2 and ended_at is null returning id`
        : `update assist_requests set state='cancelled',end_kind='cancelled',ended_at=$3,operator_reason=$4,operator_actor_zone=$5,operator_closed_version=work_version+1
       where id=$1 and work_version=$2 and state in ('received','assigned','moving') returning id`;
    const changed = await db.query(sql, [
      match[2],
      body.version,
      now,
      body.reason.trim(),
      s.zoneId,
    ]);
    return changed.length
      ? ok()
      : fail(409, "다른 직원이 처리했거나 이미 끝난 요청입니다");
  }
  if (body.action !== "assign" && row.assigned_zone !== s.zoneId)
    return fail(403, "담당 구역에서 처리해 주세요");
  let sql: string;
  if (match[1] === "call") {
    if (body.action === "assign")
      sql = `update calls set accepted_at=$3,accepted_zone=$2
      where id=$1 and work_version=$4 and accepted_at is null and ended_at is null returning id`;
    else if (body.action === "complete")
      sql = `update calls set ended_at=$3,end_kind='done'
      where id=$1 and work_version=$4 and accepted_zone=$2 and accepted_at is not null and ended_at is null returning id`;
    else return fail(400, "이전 호출은 담당 수락과 완료로 처리합니다");
  } else {
    if (body.action === "assign")
      sql = `update assist_requests set state='assigned',assigned_zone=$2,assigned_at=$3
      where id=$1 and work_version=$4 and state='received' returning id`;
    else if (body.action === "travel")
      sql = `update assist_requests set state='moving'
      where id=$1 and work_version=$4 and state='assigned' and assigned_zone=$2 and $3::timestamptz is not null returning id`;
    else if (body.action === "complete")
      sql = `update assist_requests set state='done',end_kind='done',ended_at=$3
      where id=$1 and work_version=$4 and state in ('assigned','moving') and assigned_zone=$2 returning id`;
    else return fail(400, "이전 이동지원의 처리 단계를 확인해 주세요");
  }
  const changed = await db.query(sql, [match[2], s.zoneId, now, body.version]);
  return changed.length
    ? ok()
    : fail(409, "다른 구역이 처리했거나 이미 끝난 요청입니다");
}
