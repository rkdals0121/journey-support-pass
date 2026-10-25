import { serviceRequestStatus } from "@/lib/service-requests";
import { getDb } from "@/lib/db";
import { json, readBody } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await serviceRequestStatus(await getDb(), body.receipt, now));
}
