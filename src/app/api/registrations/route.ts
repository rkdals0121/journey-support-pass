import { registerHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 여객의 등록. 휴대전화에서도 키오스크에서도 이 경로로 온다. 어느 쪽인지는 세션으로 가린다.
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await registerHandler(await getDb(), body, await currentSession(now), await requestDeviceKey(), now));
}
