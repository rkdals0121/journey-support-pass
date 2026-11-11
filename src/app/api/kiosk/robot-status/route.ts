import { robotStatusHandler } from "@/lib/api/kiosk";
import { getDb } from "@/lib/db";
import { currentSession, json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 안내 키오스크가 「안내로봇을 바로 부를 수 있는지」 묻는다(운영 시간·가용 로봇).
export async function GET() {
  const now = new Date();
  return json(await robotStatusHandler(await getDb(), await currentSession(now), now));
}
