import { config } from "@/lib/config";
import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { runPoll } from "@/lib/flights/poll";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runPoll(await getDb(), config.icnApiKey, new Date());
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
