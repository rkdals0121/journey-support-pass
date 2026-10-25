import { expireServiceRequests } from "./request-retention";
import type { Db } from "./db";
import type { Session } from "./auth";
import { ok, fail } from "./api/dto";
import { acceptCall, closeStale } from "./calls";
import { advanceAssist, closeStaleAssist } from "./assist";
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
 count(*) filter(where (state='received' and created_at <= $2::timestamptz-interval '10 minutes') or (state in ('assigned','en_route','arrived','serving') and updated_at <= $2::timestamptz-interval '30 minutes'))::int as "awaitingAttention",
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
export async function legacyWorkAction(
  db: Db,
  s: Session,
  id: string,
  body: Record<string, unknown>,
  now: Date,
) {
  const match = /^(call|assist):([a-f0-9-]{36})$/i.exec(id);
  if (!match) return fail(400, "요청 번호를 확인해 주세요");
  const [row] = await db.query<{
    version: number;
    assigned_zone: string | null;
  }>("select version,assigned_zone from request_work_ledger where id=$1", [id]);
  if (!row) return fail(404, "요청을 찾을 수 없습니다");
  if (row.version !== body.version)
    return fail(409, "요청이 바뀌었습니다. 새로 확인해 주세요");
  if (body.action !== "assign" && row.assigned_zone !== s.zoneId)
    return fail(403, "담당 구역에서 처리해 주세요");
  let changed = false;
  if (match[1] === "call") {
    if (body.action === "assign")
      changed = await acceptCall(db, match[2], s.zoneId, now);
    else if (body.action === "complete")
      changed =
        (
          await db.query(
            "update calls set ended_at=$3,end_kind='done' where id=$1 and accepted_zone=$2 and accepted_at is not null and ended_at is null returning id",
            [match[2], s.zoneId, now],
          )
        ).length === 1;
    else return fail(400, "이전 호출은 담당 수락과 완료로 처리합니다");
  } else {
    const action =
      body.action === "assign"
        ? "assign"
        : body.action === "travel"
          ? "move"
          : body.action === "complete"
            ? "done"
            : null;
    if (!action) return fail(400, "이전 이동지원의 처리 단계를 확인해 주세요");
    changed = await advanceAssist(db, match[2], s.zoneId, action, now);
  }
  return changed
    ? ok()
    : fail(409, "다른 구역이 처리했거나 이미 끝난 요청입니다");
}
