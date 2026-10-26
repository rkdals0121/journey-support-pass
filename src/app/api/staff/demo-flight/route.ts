import { getDb } from "@/lib/db";
import { currentSession, json } from "@/lib/session-server";
import { config } from "@/lib/config";
import { prepareDemoFlight } from "@/lib/demo-flight";
export const dynamic = "force-dynamic";
export async function POST() {
  const now = new Date();
  return json(
    await prepareDemoFlight(
      await getDb(),
      await currentSession(now),
      now,
      config.dataMode,
    ),
  );
}
