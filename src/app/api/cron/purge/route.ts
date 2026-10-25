import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { purge } from "@/lib/purge";
import { maintainAlertQueue } from "@/lib/request-alerts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb(),
    now = new Date();
  const result = await purge(db, now);
  await maintainAlertQueue(db, now);
  return Response.json(result);
}
