import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { collectMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

// 시범 측정값 내려받기. CRON_SECRET 을 아는 사람만 부를 수 있다. ?days=14
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const asked = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_DAYS) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 3_600_000);
  return Response.json({ since, days, ...(await collectMetrics(await getDb(), since)) });
}
