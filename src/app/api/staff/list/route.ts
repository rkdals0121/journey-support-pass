import { listHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const now = new Date();
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "zone";
  return json(
    await listHandler(await getDb(), await currentSession(now), scope, await requestDeviceKey(), now),
  );
}
