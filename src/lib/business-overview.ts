import type { Db } from "./db";
import type { Session } from "./auth";
import { ok, fail, type ApiResult } from "./api/dto";
import { BUSINESS_AREAS } from "./operating-profile";
import { kstDate } from "./flights/normalize";
import { expireServiceRequests } from "./request-retention";
import { closeStale } from "./calls";
import { closeStaleAssist } from "./assist";
import { attentionPredicate } from "./request-queue";
import {
  UNCLASSIFIED_BUSINESS,
  type BusinessOverview,
  type BusinessLoad,
} from "./business-overview-model";
type Aggregate = {
  business_id: string | null;
  today_intake: number;
  active: number;
  waiting: number;
  attention: number;
  oldest_waiting_sec: number | null;
  today_linked: number;
  today_completed: number;
  today_other_closed: number;
  advice: number;
  referral: number;
  handoff: number;
  resolved: number;
  unrecorded: number;
  median_accept_sec: number | null;
  median_completion_sec: number | null;
};
// A single grouped query gives totals and business rows from one database snapshot.
export async function businessOverview(
  db: Db,
  now: Date,
): Promise<BusinessOverview> {
  await expireServiceRequests(db, now);
  await closeStale(db, now);
  await closeStaleAssist(db, now);
  const date = kstDate(now),
    since = new Date(date + "T00:00:00+09:00");
  const active =
    "state in ('received','assigned','en_route','arrived','serving') and expires_at>$2";
  const done = "state='done' and ended_at>=$1 and ended_at<=$2";
  const rows = await db.query<Aggregate>(
    `with work as (
   select *,case when business_id=any($3::text[]) then business_id else '${UNCLASSIFIED_BUSINESS}' end as bucket
   from request_work_ledger where created_at<=$2 and (created_at>=$1 or (${active}) or ended_at>=$1 or accepted_at>=$1)
 ) select case when grouping(bucket)=1 then null else bucket end as business_id,
 count(*) filter(where created_at>=$1)::int as today_intake,
 count(*) filter(where ${active})::int as active,
 count(*) filter(where state='received' and expires_at>$2)::int as waiting,
 count(*) filter(where ${active} and ${attentionPredicate("$2")})::int as attention,
 max(extract(epoch from ($2::timestamptz-created_at))) filter(where state='received' and expires_at>$2)::int as oldest_waiting_sec,
 count(*) filter(where created_at>=$1 and registration_linked)::int as today_linked,
 count(*) filter(where ${done})::int as today_completed,
 count(*) filter(where state in ('cancelled','unavailable','expired') and ended_at>=$1 and ended_at<=$2)::int as today_other_closed,
 count(*) filter(where ${done} and resolution_kind='advice')::int as advice,
 count(*) filter(where ${done} and resolution_kind='referral')::int as referral,
 count(*) filter(where ${done} and resolution_kind='handoff')::int as handoff,
 count(*) filter(where ${done} and resolution_kind='resolved')::int as resolved,
 count(*) filter(where ${done} and resolution_kind is null)::int as unrecorded,
 (percentile_cont(.5) within group(order by extract(epoch from (accepted_at-created_at))) filter(where accepted_at>=$1 and accepted_at<=$2 and accepted_at>=created_at))::int as median_accept_sec,
 (percentile_cont(.5) within group(order by extract(epoch from (ended_at-created_at))) filter(where ${done} and ended_at>=created_at))::int as median_completion_sec
 from work group by grouping sets ((bucket),())`,
    [since, now, BUSINESS_AREAS.map((b) => b.id)],
  );
  const total = rows.find((r) => r.business_id === null)!;
  const loads = new Map(
    rows.filter((r) => r.business_id !== null).map((r) => [r.business_id, r]),
  );
  const load = (r?: Aggregate) => ({
    todayIntake: r?.today_intake ?? 0,
    active: r?.active ?? 0,
    waiting: r?.waiting ?? 0,
    attention: r?.attention ?? 0,
    oldestWaitingSec: r?.oldest_waiting_sec ?? null,
  });
  const businesses: BusinessLoad[] = [
    ...BUSINESS_AREAS.map((b) => ({
      businessId: b.id,
      label: b.label,
      group: b.group,
      ...load(loads.get(b.id)),
    })),
    {
      businessId: UNCLASSIFIED_BUSINESS,
      label: "미분류·이전 요청",
      group: "unclassified",
      ...load(loads.get(UNCLASSIFIED_BUSINESS)),
    },
  ];
  return {
    asOf: now.toISOString(),
    date,
    totals: {
      ...load(total),
      todayLinked: total.today_linked,
      todayCompleted: total.today_completed,
      todayOtherClosed: total.today_other_closed,
      medianAcceptSec: total.median_accept_sec,
      medianCompletionSec: total.median_completion_sec,
    },
    businesses,
    results: {
      advice: total.advice,
      referral: total.referral,
      handoff: total.handoff,
      resolved: total.resolved,
      unrecorded: total.unrecorded,
    },
  };
}
export async function businessOverviewHandler(
  db: Db,
  s: Session | null,
  now: Date,
): Promise<ApiResult> {
  if (!s || s.isKiosk || s.exp <= now.getTime())
    return fail(401, "직원 로그인이 필요합니다");
  if (s.needsZone) return fail(409, "근무 구역을 먼저 골라 주세요");
  if (!s.isDesk) return fail(403, "안내데스크 권한이 필요합니다");
  return ok({ ...(await businessOverview(db, now)) });
}
