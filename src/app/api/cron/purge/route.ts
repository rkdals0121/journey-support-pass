import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { purge } from "@/lib/purge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await purge(await getDb(), new Date()));
}
