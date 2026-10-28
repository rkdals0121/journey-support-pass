import { getDb } from "@/lib/db";
import { bookVisit, changeVisit, visitSlots, visitStatus } from "@/lib/support-visits";
import { json, readBody, requestDeviceKey } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  return json(await visitSlots(await getDb(), q.get("hub"), q.get("service"), q.get("day"), new Date()));
}
export async function POST(request: Request) {
  const body = await readBody(request), db = await getDb(), now = new Date();
  if (body.action === "status") return json(await visitStatus(db, body.receipt, now));
  const device = await requestDeviceKey();
  return json(body.action === "book" ? await bookVisit(db, body, device, now) : await changeVisit(db, body, device, now));
}
