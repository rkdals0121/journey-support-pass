import { listHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  return json(await listHandler(await getDb(), await currentSession(now), now));
}
