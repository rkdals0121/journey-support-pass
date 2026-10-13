import { destinationsHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 오늘과 내일 떠날 편이 있는 도착 도시. 편명을 모르는 여객이 도시를 눌러 고를 때 쓴다.
export async function GET() {
  return json(await destinationsHandler(await getDb(), new Date()));
}
