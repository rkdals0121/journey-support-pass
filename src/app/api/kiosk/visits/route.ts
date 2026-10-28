import { after } from "next/server";
import { getDb } from "@/lib/db";
import {
  currentSession,
  json,
  readBody,
  requestDeviceKey,
} from "@/lib/session-server";
import { kioskVisitAction } from "@/lib/support-visits";
import { processAlertQueue } from "@/lib/request-alerts";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const db = await getDb(),
    now = new Date(),
    body = await readBody(request);
  const result = await kioskVisitAction(
    db,
    await currentSession(now),
    body,
    await requestDeviceKey(),
    now,
  );
  if (
    result.status === 200 &&
    ["checkin", "handover"].includes(String(body.action))
  )
    after(async () => {
      try {
        await processAlertQueue(db, new Date(), {
          requestId: (result.body.visit as { requestId: string }).requestId,
        });
      } catch {
        /* Durable queue retries. */
      }
    });
  return json(result);
}
