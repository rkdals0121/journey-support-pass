import { registerHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 안내데스크 직원이 여객 대신 입력한 등록. "직원이 대신 입력한 건수"로 따로 센다.
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await registerHandler(await getDb(), body, await currentSession(now), await requestDeviceKey(), now, true));
}
