import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import type { Db } from "./db";
import type { Session } from "./auth";
import { config } from "./config";
import { isUuid } from "./registrations";
import { fail, ok } from "./api/dto";
import { pushConfig, validSubscription } from "./staff-push";
import type { RequestAlert } from "./request-alert-model";
import { kstDate } from "./flights/normalize";

export async function alertOverview(db: Db, s: Session | null, now: Date) {
  if (!authorized(s, now)) return fail(401, "직원 로그인이 필요합니다");
  if (!s!.isDesk)
    return fail(403, "알림 운영 현황은 안내데스크에서 확인합니다");
  await maintainAlertQueue(db, now);
  const since = new Date(kstDate(now) + "T00:00:00+09:00");
  const [events] = await db.query<{
    total: number;
    acknowledged: number;
    unconfirmed: number;
  }>(
    `
    select count(*)::int as total,count(*) filter(where a.acknowledged_at is not null)::int as acknowledged,
     count(*) filter(where a.acknowledged_at is null and r.state='received' and r.expires_at>$2)::int as unconfirmed
    from request_alerts a join service_requests r on r.id=a.request_id where a.created_at >=$1`,
    [since, now],
  );
  const [delivery] = await db.query<{
    queued: number;
    accepted: number;
    received: number;
    failed: number;
    stopped: number;
  }>(
    `
    select count(*) filter(where d.state in ('queued','sending','retry') and d.received_at is null)::int as queued,
     count(*) filter(where d.accepted_at is not null)::int as accepted,
     count(*) filter(where d.received_at is not null)::int as received,
     count(*) filter(where d.state='failed' and d.received_at is null)::int as failed,
     count(*) filter(where d.state in ('cancelled','expired') and d.received_at is null)::int as stopped
    from request_alert_deliveries d join request_alerts a on a.request_id=d.request_id where a.created_at >=$1`,
    [since],
  );
  const [subscriptions] = await db.query<{ devices: number }>(
    "select count(*)::int as devices from request_push_subscriptions where expires_at>$1",
    [now],
  );
  return ok({
    enabled: pushConfig().enabled,
    ...events,
    ...delivery,
    ...subscriptions,
    date: kstDate(now),
  });
}

export async function retryAlerts(db: Db, s: Session | null, now: Date) {
  if (!authorized(s, now)) return fail(401, "직원 로그인이 필요합니다");
  if (!s!.isDesk)
    return fail(403, "알림 재시도 처리는 안내데스크에서 실행합니다");
  return ok(await processAlertQueue(db, now, { limit: 20 }));
}

function authorized(s: Session | null, now: Date) {
  return !!s && !s.isKiosk && !s.needsZone && s.exp > now.getTime();
}
export function alertReceipt(id: string) {
  return (
    id +
    "." +
    createHmac("sha256", config.sessionSecret)
      .update("push-received:" + id)
      .digest("hex")
  );
}
export async function recordAlertReceipt(db: Db, token: unknown, now: Date) {
  if (
    typeof token !== "string" ||
    !/^([a-f0-9-]{36})\.([a-f0-9]{64})$/i.test(token)
  )
    return fail(400, "알림 확인값을 확인해 주세요");
  const [id] = token.split(".");
  if (!isUuid(id)) return fail(400, "알림 확인값을 확인해 주세요");
  const expected = alertReceipt(id);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(token)))
    return fail(403, "알림 확인값이 올바르지 않습니다");
  const rows = await db.query(
    `
    update request_alert_deliveries d set received_at=coalesce(d.received_at,$2)
    from request_alerts a where d.id=$1 and a.request_id=d.request_id
     and a.expires_at>$2 and d.attempts>0 and d.state not in ('cancelled','expired')
    returning d.id`,
    [id, now],
  );
  return rows.length ? ok() : fail(410, "알림 확인 기간이 끝났습니다");
}
export async function acknowledgeAlert(
  db: Db,
  s: Session | null,
  id: unknown,
  now: Date,
) {
  if (!authorized(s, now))
    return fail(401, "직원 로그인과 근무 구역 선택이 필요합니다");
  if (!isUuid(id)) return fail(400, "통합 요청 번호를 확인해 주세요");
  const rows = await db.query(
    `
    update request_alerts a set acknowledged_at=coalesce(a.acknowledged_at,$2),
     acknowledged_zone=coalesce(a.acknowledged_zone,$3)
    from service_requests r where a.request_id=$1 and r.id=a.request_id and r.expires_at>$2
     and r.state in ('received','assigned','en_route','arrived','serving') returning a.request_id`,
    [id, now, s!.zoneId],
  );
  return rows.length ? ok() : fail(404, "현재 확인할 접수가 없습니다");
}
export async function alertSnapshots(
  db: Db,
  ids: string[],
): Promise<Record<string, RequestAlert>> {
  if (!ids.length) return {};
  const rows = await db.query<{
    request_id: string;
    acknowledged_at: Date | null;
    acknowledged_zone: string | null;
    queued: number;
    accepted: number;
    received: number;
    failed: number;
    stopped: number;
    targets: number;
  }>(
    `
    select a.request_id,a.acknowledged_at,a.acknowledged_zone,
     count(d.id) filter(where d.state in ('queued','sending','retry') and d.received_at is null)::int as queued,
     count(d.id) filter(where d.accepted_at is not null)::int as accepted,
     count(d.id) filter(where d.received_at is not null)::int as received,
     count(d.id) filter(where d.state='failed' and d.received_at is null)::int as failed,
     count(d.id) filter(where d.state in ('expired','cancelled') and d.received_at is null)::int as stopped,
     count(d.id)::int as targets
    from request_alerts a left join request_alert_deliveries d on d.request_id=a.request_id
    where a.request_id=any($1::uuid[]) group by a.request_id`,
    [ids],
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.request_id,
      {
        acknowledgedAt: r.acknowledged_at?.toISOString() ?? null,
        acknowledgedZone: r.acknowledged_zone,
        queued: r.queued,
        accepted: r.accepted,
        received: r.received,
        failed: r.failed,
        stopped: r.stopped,
        targets: r.targets,
      },
    ]),
  );
}
export async function maintainAlertQueue(db: Db, now: Date) {
  await db.query(
    "delete from request_push_subscriptions where expires_at <= $1",
    [now],
  );
  await db.query(
    `
    update request_alert_deliveries d set state=case when a.expires_at<=$1 then 'expired' else 'cancelled' end,
     lease_token=null,lease_until=null
    from request_alerts a join service_requests r on r.id=a.request_id
    where d.request_id=a.request_id and d.state in ('queued','sending','retry')
     and (a.expires_at<=$1 or a.acknowledged_at is not null or r.state<>'received' or r.expires_at<=$1)`,
    [now],
  );
  await db.query(
    "update request_alert_deliveries set state='failed',error_code='worker_timeout',lease_token=null,lease_until=null where state='sending' and lease_until<=$1 and attempts>=4",
    [now],
  );
  await db.query(
    "delete from request_alert_deliveries where request_id in (select request_id from request_alerts where created_at < $1)",
    [new Date(now.getTime() - 86400000)],
  );
}
export async function processAlertQueue(
  db: Db,
  now: Date,
  options: { requestId?: string; limit?: number } = {},
) {
  await maintainAlertQueue(db, now);
  const settings = pushConfig();
  if (!settings.enabled) return { enabled: false, attempted: 0 };
  const limit = Math.max(1, Math.min(20, options.limit ?? 10)),
    lease = randomUUID();
  const jobs = await db.query<{
    id: string;
    request_id: string;
    subscription_id: string;
    zone_id: string;
    attempts: number;
  }>(
    `
    with due as (
     select d.id from request_alert_deliveries d join request_alerts a on a.request_id=d.request_id
     join service_requests r on r.id=a.request_id
     where (d.state in ('queued','retry') or (d.state='sending' and d.lease_until<=$1))
      and d.next_attempt_at<=$1 and d.received_at is null and a.expires_at>$1
      and d.attempts<4
      and a.acknowledged_at is null and r.state='received' and r.expires_at>$1
      and ($4::uuid is null or a.request_id=$4)
     order by d.next_attempt_at,d.id for update of d skip locked limit $2
    )
    update request_alert_deliveries d set state='sending',attempts=attempts+1,
     lease_token=$3,lease_until=$1::timestamptz+interval '30 seconds'
    from due where d.id=due.id returning d.id,d.request_id,d.subscription_id,d.zone_id,d.attempts`,
    [now, limit, lease, options.requestId ?? null],
  );
  for (let i = 0; i < jobs.length; i += 5)
    await Promise.all(
      jobs.slice(i, i + 5).map(async (job) => {
        const [sub] = await db.query<{ subscription: PushSubscription }>(
          `
      select s.subscription from request_push_subscriptions s
      join request_alerts a on a.request_id=$4 join service_requests r on r.id=a.request_id
      where s.id=$1 and s.zone_id=$2 and s.expires_at>$3 and a.expires_at>$3
       and a.acknowledged_at is null and r.state='received' and r.expires_at>$3`,
          [job.subscription_id, job.zone_id, now, job.request_id],
        );
        let state = "sent",
          error = "";
        if (!sub || !validSubscription(sub.subscription)) {
          state = "cancelled";
          error = "subscription_unavailable";
        } else
          try {
            await webpush.sendNotification(
              sub.subscription,
              JSON.stringify({
                title: "새 도움 요청",
                body: "통합 요청 화면에서 접수 내용을 확인해 주세요.",
                tag: "request-" + job.request_id,
                receivedToken: alertReceipt(job.id),
              }),
              {
                TTL: 60,
                timeout: 3000,
                vapidDetails: {
                  subject: settings.subject,
                  publicKey: settings.publicKey,
                  privateKey: settings.privateKey,
                },
              },
            );
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            error = typeof status === "number" ? "http_" + status : "network";
            if (status === 404 || status === 410) {
              await db.query(
                "delete from request_push_subscriptions where id=$1",
                [job.subscription_id],
              );
              state = "failed";
            } else
              state =
                job.attempts >= 4 ||
                (typeof status === "number" &&
                  status >= 400 &&
                  status < 500 &&
                  status !== 429)
                  ? "failed"
                  : "retry";
          }
        await db.query(
          `
      update request_alert_deliveries set state=$3,error_code=$4,lease_token=null,lease_until=null,
       accepted_at=case when $3='sent' then coalesce(accepted_at,$5) else accepted_at end,
       next_attempt_at=$6 where id=$1 and lease_token=$2 and state='sending'`,
          [
            job.id,
            lease,
            state,
            error,
            now,
            new Date(
              now.getTime() + Math.min(300000, 15000 * 2 ** (job.attempts - 1)),
            ),
          ],
        );
      }),
    );
  return { enabled: true, attempted: jobs.length };
}
