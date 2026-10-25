import { createHash } from "node:crypto";
import type { PushSubscription } from "web-push";
import type { Session } from "./auth";
import type { Db } from "./db";
import { fail, ok } from "./api/dto";

export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY ?? "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY ?? "";
  const subject = process.env.WEB_PUSH_SUBJECT ?? "";
  return {
    publicKey,
    privateKey,
    subject,
    enabled: !!(
      publicKey &&
      privateKey &&
      /^(mailto:|https:\/\/)/.test(subject)
    ),
  };
}
const keyOf = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");
function staff(session: Session | null, now: Date): session is Session {
  return (
    !!session &&
    !session.isKiosk &&
    !session.needsZone &&
    session.exp > now.getTime()
  );
}
export function validSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<PushSubscription>;
  if (typeof s.endpoint !== "string" || s.endpoint.length > 2048) return false;
  try {
    const u = new URL(s.endpoint);
    // Server-side requests can only reach the browser vendors' push services.
    const hosts = [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ];
    if (
      u.protocol !== "https:" ||
      u.port ||
      u.username ||
      u.password ||
      !hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h))
    )
      return false;
  } catch {
    return false;
  }
  return (
    !!s.keys &&
    typeof s.keys.p256dh === "string" &&
    typeof s.keys.auth === "string" &&
    /^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh) &&
    /^[A-Za-z0-9_-]{22}$/.test(s.keys.auth)
  );
}
export async function configurePush(
  db: Db,
  session: Session | null,
  value: unknown,
  now: Date,
  remove = false,
) {
  if (!staff(session, now))
    return fail(401, "직원 로그인과 근무 구역 선택이 필요합니다");
  if (!validSubscription(value))
    return fail(400, "알림 기기 정보가 올바르지 않습니다");
  const id = keyOf(value.endpoint);
  if (remove) {
    await db.query(
      "delete from request_push_subscriptions where id=$1 and zone_id=$2",
      [id, session.zoneId],
    );
    return ok();
  }
  if (!pushConfig().enabled)
    return fail(503, "운영자가 브라우저 알림을 아직 설정하지 않았습니다");
  await db.query(
    "delete from request_push_subscriptions where expires_at <= $1",
    [now],
  );
  const count = await db.query<{ n: number }>(
    "select count(*)::int as n from request_push_subscriptions where zone_id=$1",
    [session.zoneId],
  );
  if (
    count[0].n >= 20 &&
    !(
      await db.query("select id from request_push_subscriptions where id=$1", [
        id,
      ])
    ).length
  )
    return fail(429, "이 구역의 알림 기기 수가 많습니다");
  await db.query(
    `insert into request_push_subscriptions(id,zone_id,subscription,expires_at) values($1,$2,$3::jsonb,$4)
    on conflict(id) do update set zone_id=excluded.zone_id,subscription=excluded.subscription,expires_at=excluded.expires_at`,
    [
      id,
      session.zoneId,
      JSON.stringify({ endpoint: value.endpoint, keys: value.keys }),
      new Date(session.exp),
    ],
  );
  return ok();
}
export async function notifyNewRequest(db: Db, requestId: string, now: Date) {
  if (!/^[a-f0-9-]{36}$/i.test(requestId)) return;
  const { processAlertQueue } = await import("./request-alerts");
  await processAlertQueue(db, now, { requestId });
}
