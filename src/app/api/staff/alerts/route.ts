import { getDb } from "@/lib/db";
import { json, readBody, currentSession } from "@/lib/session-server";
import {
  acknowledgeAlert,
  alertOverview,
  retryAlerts,
} from "@/lib/request-alerts";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  return json(
    await alertOverview(await getDb(), await currentSession(), new Date()),
  );
}
export async function POST(request: Request) {
  const body = await readBody(request),
    db = await getDb(),
    session = await currentSession(),
    now = new Date();
  if (body.action === "retry") return json(await retryAlerts(db, session, now));
  return json(await acknowledgeAlert(db, session, body.requestId, now));
}
