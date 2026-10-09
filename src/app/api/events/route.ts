import { eventHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await eventHandler(await getDb(), body, await currentSession(now), await requestDeviceKey(), now));
}
