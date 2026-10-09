import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { kstDate } from "@/lib/flights/normalize";
import { pollMetrics, summarize } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

// 시범 측정값 내려받기. CRON_SECRET 을 아는 사람만 부를 수 있다. ?days=14
// 건수와 가운데값뿐이다. 항공편이나 고른 항목처럼 여객을 짐작할 수 있는 값은 없다.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const asked = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_DAYS) : DEFAULT_DAYS;
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 3_600_000);
  const db = await getDb();
  return Response.json({
    since,
    days,
    summary: await summarize(db, since, kstDate(now)),
    polls: await pollMetrics(db, since),
  });
}
