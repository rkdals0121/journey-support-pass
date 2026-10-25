import { cancelServiceRequest } from "@/lib/service-requests";
import { getDb } from "@/lib/db";
import { json, readBody } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(await cancelServiceRequest(await getDb(), body.receipt, now));
}
