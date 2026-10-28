import { createHash } from "node:crypto";
import { crewKey, clearCrewKey } from "@/lib/support-crew-cookie";
import { expireVisits } from "@/lib/support-maintenance";
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
  if (session && !session.isKiosk) {
    const db = await getDb(),
      key = await crewKey(),
      now = new Date();
    if (key) {
      await db.query(
        "update support_crew set expires_at=$2,state='away' where session_hash=$1",
        [createHash("sha256").update(key).digest("hex"), now],
      );
      await expireVisits(db, now);
    }
  }
  await clearCrewKey();
  await clearSessionCookie();
  return json({ status: 200, body: { ok: true } });
}
