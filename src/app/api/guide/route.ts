import { guideHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 패스의 안내 내용. QR 값은 주소에 싣지 않고 본문으로 받는다. 주소는 서버 기록에 남기 때문이다.
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  const token = typeof body.token === "string" ? body.token : "";
  return json(await guideHandler(await getDb(), token, await currentSession(now), now));
}
