import { getDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron";
import { processAlertQueue } from "@/lib/request-alerts";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  if (!isCronAuthorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    await processAlertQueue(await getDb(), new Date(), { limit: 20 }),
  );
}
