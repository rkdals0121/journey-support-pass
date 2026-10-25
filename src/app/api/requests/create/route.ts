import { createServiceRequest } from "@/lib/service-requests";
import { getDb } from "@/lib/db";
import { after } from "next/server";
import { processAlertQueue } from "@/lib/request-alerts";
import {
  currentSession,
  json,
  readBody,
  requestDeviceKey,
} from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  const db = await getDb();
  const result = await createServiceRequest(
    db,
    await currentSession(now),
    body,
    await requestDeviceKey(),
    now,
  );
  if (result.status === 200)
    after(async () => {
      try {
        await processAlertQueue(db, new Date(), {
          requestId: (result.body.request as { id: string }).id,
        });
      } catch {
        /* A persisted lease can be retried by the worker. */
      }
    });
  return json(result);
}
