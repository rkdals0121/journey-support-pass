import { entryScanHandler } from "@/lib/api/entry";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 공항 입구 키오스크: 찍은 탑승권으로 등록한 여객인지 본다. */
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await entryScanHandler(await getDb(), await currentSession(now), body, await requestDeviceKey(), now));
}
