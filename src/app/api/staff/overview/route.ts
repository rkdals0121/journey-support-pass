import { getDb } from "@/lib/db";
import { currentSession, json } from "@/lib/session-server";
import { businessOverviewHandler } from "@/lib/business-overview";
export const dynamic = "force-dynamic";
export async function GET() {
  const now = new Date();
  return json(
    await businessOverviewHandler(
      await getDb(),
      await currentSession(now),
      now,
    ),
  );
}
