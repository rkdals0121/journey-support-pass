import { visitDeviceKey } from "@/lib/visit-cookie";
import { after } from "next/server";
import { processAlertQueue } from "@/lib/request-alerts";
import { getDb } from "@/lib/db";
import {
  bookVisit,
  changeVisit,
  visitSlots,
  visitStatus,
} from "@/lib/support-visits";
import { json, readBody, currentSession } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  return json(
    await visitSlots(
      await getDb(),
      q.get("hub"),
      q.get("service"),
      q.get("day"),
      new Date(),
    ),
  );
}
export async function POST(request: Request) {
  const body = await readBody(request),
    db = await getDb(),
    now = new Date();
  if ((await currentSession(now))?.isKiosk)
    return json({
      status: 403,
      body: {
        error: "공용 기기의 예약 확인 화면을 이용해 주세요",
        code: "shared_device",
      },
    });
  if (body.action === "status")
    return json(await visitStatus(db, body.receipt, now));
  const device = await visitDeviceKey();
  const result =
    body.action === "book"
      ? await bookVisit(db, body, device, now)
      : await changeVisit(db, body, device, now);
  if (
    result.status === 200 &&
    ["book", "checkin", "handover"].includes(String(body.action))
  )
    after(async () => {
      try {
        await processAlertQueue(db, new Date(), {
          requestId: (result.body.visit as { requestId: string }).requestId,
        });
      } catch {
        /* Durable queue retries the same event. */
      }
    });
  return json(result);
}
