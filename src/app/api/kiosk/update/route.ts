import { updateNeedsHandler } from "@/lib/api/kiosk";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 안내 키오스크: 탑승권으로 연 등록의 고른 항목을 고친다. */
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await updateNeedsHandler(await getDb(), await currentSession(now), body, await requestDeviceKey(), now));
}
