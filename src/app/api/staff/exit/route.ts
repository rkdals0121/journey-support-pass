import { exitCheckHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 우대출구에서 탑승권의 전자토큰을 읽는다. 대상 여부와 필요한 지원만 돌려준다. */
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await exitCheckHandler(await getDb(), await currentSession(now), body, await requestDeviceKey(), now));
}
