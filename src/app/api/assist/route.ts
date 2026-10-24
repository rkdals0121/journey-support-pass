import { assistRequestHandler } from "@/lib/api/entry";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 이동지원(전동차) 요청. QR 값(token)을 아는 쪽(여객 휴대전화, 그 여객의 탑승권을 찍은 키오스크)만 청한다. */
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await assistRequestHandler(await getDb(), await currentSession(now), body, now));
}
