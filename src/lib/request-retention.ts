import type { Db } from "./db";
export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export async function expireServiceRequests(db: Db, now: Date) {
  const legacyDetailsCutoff=new Date(now.getTime()-REQUEST_TTL_MS);
  await db.query("update calls set operator_reason='' where operator_reason<>'' and created_at<=$1",[legacyDetailsCutoff]);
  await db.query("update assist_requests set operator_reason='' where operator_reason<>'' and created_at<=$1",[legacyDetailsCutoff]);
  await db.query(
    "delete from request_push_subscriptions where expires_at <= $1",
    [now],
  );
  // A timeout is never a completed service. Pilot thresholds, not promised arrival times.
  await db.query(
    `update service_requests set state='expired',ended_at=$1,updated_at=$1,version=version+1,last_action='expired',last_actor_zone=null,last_action_reason='',pending_place_id=null,pending_place_at=null,
 reason='응답 대기 시간이 지나 종료되었습니다. 가까운 안내데스크에 문의하거나 새로 요청해 주세요 / Timed out. Contact the nearest information desk or make a new request.'
 where expires_at>$1 and ((state='received' and created_at<=$2) or
 (state in ('assigned','en_route','arrived','serving') and updated_at<=$3))`,
    [
      now,
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() - 3 * 60 * 60 * 1000),
    ],
  );
  // Erase contents at the separate retention deadline.
  await db.query(
    `update service_requests set state=case when state in ('received','assigned','en_route','arrived','serving') then 'expired' else state end,
 registration_id=null, choices='{}', note='', device_key='', reason='', place_id='', party=1,last_action='privacy_erased',last_actor_zone=null,last_action_reason='',pending_place_id=null,pending_place_at=null,
 ended_at=coalesce(ended_at,$1), updated_at=$1, version=version+1
 where expires_at <= $1 and (place_id<>'' or device_key<>'' or registration_id is not null or note<>'')`,
    [now],
  );
  await db.query(
    "update service_request_history set reason='' where reason<>'' and request_id in (select id from service_requests where expires_at <= $1)",
    [now],
  );
  await db.query("delete from service_request_limits where window_at < $1", [
    new Date(now.getTime() - REQUEST_TTL_MS),
  ]);
  await db.query("delete from service_requests where expires_at < $1", [
    new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
  ]);
}
