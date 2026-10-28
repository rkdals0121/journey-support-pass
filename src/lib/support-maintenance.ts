import type { Db } from "./db";
export async function expireVisits(db: Db, now: Date) {
  await db.query(
    `delete from support_visits where ended_at<$1::timestamptz-interval '30 days'`,
    [now],
  );
  await db.query(
    `update support_visits set recognition='',notice='',choices='{}',device_key='',registration_id=null,flight_no=null,flight_date=null where ended_at<$1::timestamptz-interval '24 hours' and (recognition<>'' or notice<>'' or cardinality(choices)>0 or device_key<>'' or registration_id is not null)`,
    [now],
  );
  await db.query(
    "update support_visit_history set reason='' where reason<>'' and visit_id in(select id from support_visits where ended_at<$1::timestamptz-interval '24 hours')",
    [now],
  );
  await db.query(
    `delete from support_experience_events where at<$1::timestamptz-interval '30 days'`,
    [now],
  );
  await db.query(
    `delete from support_studies where at<$1::timestamptz-interval '90 days'`,
    [now],
  );
  await db.query(
    `update support_visits set state='missed',ended_at=$1,updated_at=$1,version=version+1 where state='booked' and start_at+interval '30 minutes'<=$1`,
    [now],
  );
  await db.query(
    `update service_requests r set state='cancelled',ended_at=$1,updated_at=$1,planned_at=null,version=r.version+1,last_action='missed',pending_place_id=null,pending_place_at=null from support_visits v where r.visit_id=v.id and v.state='missed' and r.state='received'`,
    [now],
  );
  await db.query(
    `update service_requests r set state='cancelled',ended_at=$1,updated_at=$1,planned_at=null,version=r.version+1,last_action='expired',pending_place_id=null,pending_place_at=null from support_visits v where r.visit_id=v.id and v.start_at<$1::timestamptz-interval '1 day' and v.state in ('checked_in','responding') and v.handed_over_at is null and r.state not in ('done','cancelled','expired','unavailable')`,
    [now],
  );
  // A vanished shift never silently keeps work owned. Keep the work visible and queue a fresh alert.
  await db.query(
    `update service_requests r set assigned_crew=null,assigned_zone=null,state='received',resource_id=null,accepted_at=null,arrived_at=null,started_at=null,updated_at=$1,version=r.version+1,last_action='handover',last_action_reason='담당 근무 만료 · 재수락 필요',pending_place_id=null,pending_place_at=null from support_visits v where r.visit_id=v.id and r.assigned_crew is not null and r.state in ('received','assigned','en_route','arrived','serving') and not exists(select 1 from support_crew c where c.id=r.assigned_crew and c.expires_at>$1 and c.state<>'away')`,
    [now],
  );
  await db.query(
    `update support_resource_holds h set active=false,release_at=$1::timestamptz+interval '5 minutes',updated_at=$1 from support_visits v join service_requests r on r.visit_id=v.id where h.visit_id=v.id and h.active and r.resource_id is null and (r.state in ('done','cancelled','expired','unavailable') or (v.handed_over_at is not null and r.assigned_crew is null))`,
    [now],
  );
  await db.query(
    `delete from support_crew c where expires_at<$1::timestamptz-interval '1 day' and not exists(select 1 from support_visits v where v.assigned_crew=c.id and v.state in ('checked_in','responding','handed_over'))`,
    [now],
  );
  await db.query(
    `delete from support_resource_holds where not active and release_at<=$1`,
    [now],
  );
}
