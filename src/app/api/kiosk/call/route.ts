import { callHandler } from "@/lib/api/kiosk";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const now = new Date();
  return json(await callHandler(await getDb(), await currentSession(now), await readBody(request), now));
}
