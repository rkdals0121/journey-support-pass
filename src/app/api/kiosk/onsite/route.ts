import { onsiteRegisterHandler } from "@/lib/api/entry";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 공항 입구 키오스크: 등록하지 않은 여객을 그 자리에서 등록하고 탑승권에 잇는다. */
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await onsiteRegisterHandler(await getDb(), await currentSession(now), body, await requestDeviceKey(), now));
}
