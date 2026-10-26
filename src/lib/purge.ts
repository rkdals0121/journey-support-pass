import { expireServiceRequests } from "./request-retention";
import { config } from "./config";
import type { Db } from "./db";
import { isJourneyOver, lastRealPoll, loadJourneys } from "./journey";

const HOUR = 3_600_000;
const FLIGHT_RETENTION_DAYS = 3;

/**
 * 한 등록에서 여객이 입력한 것을 모두 지운다.
 *
 * 지우는 것: 항공편, 고른 항목, 함께 가는 분의 수·유모차 수·더 하고 싶은 말씀, 고른 언어, 증빙 확인 값. 패스·직원 호출·조회 기록과 등록 사이의 연결.
 * 남기는 것: 등록 경로, 등록 시각 (등록 행). 호출한 키오스크와 시각 (호출 행). 누구의 것인지 알 수 없는 상태로 남는다.
 * 패스는 일회용이므로 끝내고 다시 쓰지 않는다. 출발해서 지워지면 expired, 여객이 지워 달라고 하면 revoked.
 */
export async function eraseRegistration(
  db: Db,
  id: string,
  now: Date,
  finalStatus: "expired" | "revoked" = "expired",
): Promise<void> {
  await db.query(
    `update passes set state = $2, registration_id = null, linked_at = null, boarding_ref = null
     where registration_id = $1 and state = 'active'`,
    [id, finalStatus],
  );
  await db.query("update passes set registration_id = null where registration_id = $1", [id]);
  await db.query("update service_request_history set reason='' where request_id in (select id from service_requests where registration_id=$1)",[id]);
  // Bound DX requests carry a snapshot. Explicit erasure/flight expiry must remove it too.
  await db.query(`update service_requests set state=case when state in ('received','assigned','en_route','arrived','serving') then 'cancelled' else state end,
    registration_id=null, choices='{}', note='', reason='', device_key='', place_id='',party=1,last_action='privacy_erased',last_actor_zone=null,last_action_reason='',pending_place_id=null,pending_place_at=null,
    ended_at=coalesce(ended_at,$2),expires_at=$2,updated_at=$2,version=version+1 where registration_id=$1`,[id,now]);
  // 여객이 떠났는데 끝나지 않은 호출은 닫는다.
  await db.query(
    "update calls set ended_at = $2, end_kind = 'cancelled' where registration_id = $1 and ended_at is null",
    [id, now],
  );
  await db.query("update calls set registration_id = null,operator_reason='' where registration_id = $1", [id]);
  // 끝나지 않은 이동지원 요청도 닫고 연결을 끊는다.
  await db.query(
    "update assist_requests set state = 'cancelled', ended_at = $2 where registration_id = $1 and state in ('received','assigned','moving')",
    [id, now],
  );
  await db.query("update assist_requests set registration_id = null,operator_reason='' where registration_id = $1", [id]);
  await db.query("update access_logs set registration_id = null where registration_id = $1", [id]);
  await db.query(
    `update registrations set name = null, flight_date = null, flight_no = null, needs = '{}', categories = '{}',
       party_size = null, stroller_count = null, note = null, lang = 'ko', receipt_no = null, proof_status = 'none', status = $3, purged_at = $2
     where id = $1`,
    [id, now, finalStatus],
  );
}

export async function purge(
  db: Db,
  now: Date,
): Promise<{ purged: number; unlinkedPurged: number; logsDeleted: number }> {
  await expireServiceRequests(db, now);
  let purged = 0;
  const lastPoll = await lastRealPoll(db);
  for (const j of await loadJourneys(db, now)) {
    if (!isJourneyOver(j, now, lastPoll)) continue;
    await eraseRegistration(db, j.registrationId, now);
    purged += 1;
  }

  // 패스를 만들다 실패해 남은 등록.
  const stale = await db.query<{ id: string }>(
    "select id from registrations where status = 'pending' and submitted_at <= $1",
    [new Date(now.getTime() - config.unlinkedPurgeHours * HOUR)],
  );
  for (const r of stale) await eraseRegistration(db, r.id, now);

  const logCutoff = new Date(now.getTime() - config.logRetentionDays * 24 * HOUR);
  const logs = await db.query("delete from access_logs where at < $1 returning id", [logCutoff]);
  await db.query("delete from events where at < $1", [logCutoff]);
  await db.query("delete from calls where created_at < $1", [logCutoff]);
  await db.query("delete from assist_requests where created_at<$1 and state in ('done','cancelled')",[logCutoff]);
  await db.query("delete from flight_polls where polled_at < $1", [logCutoff]);
  await db.query("delete from flights where sched_at < $1", [
    new Date(now.getTime() - FLIGHT_RETENTION_DAYS * 24 * HOUR),
  ]);

  return { purged, unlinkedPurged: stale.length, logsDeleted: logs.length };
}
