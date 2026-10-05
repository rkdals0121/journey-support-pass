import { supportGroups } from "./catalog";
import { config } from "./config";
import type { Db } from "./db";
import { loadActiveCases, type CaseView } from "./encounters";
import { addDays, kstDate } from "./flights/normalize";
import { departureAt, isDeparted } from "./timing";

const MIN = 60_000;
const HOUR = 60 * MIN;
// 운항 정보가 테이블에서 사라진 등록을 잡는 마지막 안전장치.
const ORPHAN_HOURS = 48;
const FLIGHT_RETENTION_DAYS = 3;

/** 결항 편은 예정 출발일 다음 날 04:00(한국 시각)에 지운다. 여객이 공항에 머물 수 있어서다. */
function cancelledPurgeAt(schedAt: Date): Date {
  return new Date(`${addDays(kstDate(schedAt), 1)}T04:00:00+09:00`);
}

function shouldPurge(c: CaseView, now: Date): boolean {
  const t = now.getTime();
  if (!c.schedAt) return t >= c.submittedAt.getTime() + ORPHAN_HOURS * HOUR;

  if (t >= c.schedAt.getTime() + config.purgeSafetyHours * HOUR) return true;
  const times = { schedAt: c.schedAt, estAt: c.estAt, status: c.status };
  if (c.cancelled) return t >= cancelledPurgeAt(c.schedAt).getTime();
  if (isDeparted(times)) return true;
  return t >= departureAt(times).getTime() + config.purgeAfterDepartureMin * MIN;
}

/**
 * 한 등록에서 사람을 알 수 있는 값을 지운다.
 *
 * 지우는 것: 이름, 항공편, 필요한 도움, 접수 번호. 패스·응대 기록·조회 기록과 등록 사이의 연결.
 * 남기는 것: 교통약자 구분, 등록 경로, 등록·연결 시각 (등록 행). 구역, 응대 시각, 지원 종류(묶음 단위),
 *           탑승구 위치 구분 (응대 기록). 모두 누구의 것인지 알 수 없는 상태로 남는다.
 * 패스는 일회용이므로 expired 로 끝내고 다시 쓰지 않는다.
 */
async function purgeOne(db: Db, id: string, needs: string[], categories: string[], gateBand: string | null, now: Date) {
  await db.query(
    `update encounters set support_groups = $2, categories = $3, gate_band = $4, registration_id = null
     where registration_id = $1`,
    [id, supportGroups(needs), categories, gateBand],
  );
  await db.query(
    `update passes set state = 'expired', registration_id = null, linked_at = null
     where registration_id = $1 and state = 'active'`,
    [id],
  );
  await db.query("update passes set registration_id = null where registration_id = $1", [id]);
  await db.query("update access_logs set registration_id = null where registration_id = $1", [id]);
  await db.query(
    `update registrations set name = null, flight_date = null, flight_no = null, needs = '{}',
       receipt_no = null, status = 'expired', purged_at = $2
     where id = $1`,
    [id, now],
  );
}

export async function purge(
  db: Db,
  now: Date,
): Promise<{ purged: number; unlinkedPurged: number; logsDeleted: number }> {
  let purged = 0;
  for (const c of await loadActiveCases(db, now)) {
    if (!shouldPurge(c, now)) continue;
    await purgeOne(db, c.registrationId, c.needs, c.categories, c.gateBand, now);
    purged += 1;
  }

  // 패스를 받아 가지 않은 등록.
  const stale = await db.query<{ id: string; needs: string[]; categories: string[] }>(
    "select id, needs, categories from registrations where status = 'pending' and submitted_at <= $1",
    [new Date(now.getTime() - config.unlinkedPurgeHours * HOUR)],
  );
  for (const r of stale) await purgeOne(db, r.id, r.needs, r.categories, null, now);

  const logCutoff = new Date(now.getTime() - config.logRetentionDays * 24 * HOUR);
  const logs = await db.query("delete from access_logs where at < $1 returning id", [logCutoff]);
  await db.query("delete from flight_polls where polled_at < $1", [logCutoff]);
  await db.query("delete from flights where sched_at < $1", [
    new Date(now.getTime() - FLIGHT_RETENTION_DAYS * 24 * HOUR),
  ]);

  return { purged, unlinkedPurged: stale.length, logsDeleted: logs.length };
}
