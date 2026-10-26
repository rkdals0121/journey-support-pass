import { getDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron";
import { processIntegrationJobs } from "@/lib/external-integrations";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!isCronAuthorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await processIntegrationJobs(await getDb(), new Date()));
}
