import { clearSessionCookie, currentSession, json } from "@/lib/session-server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await currentSession();
  if (session && !session.isKiosk) {
    await (
      await getDb()
    ).query(
      "delete from request_push_subscriptions where zone_id=$1 and expires_at=$2",
      [session.zoneId, new Date(session.exp)],
    );
  }
  await clearSessionCookie();
  return json({ status: 200, body: { ok: true } });
}
