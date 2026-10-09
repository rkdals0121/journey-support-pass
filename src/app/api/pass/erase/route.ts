import { eraseHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return json(await eraseHandler(await getDb(), await readBody(request), await requestDeviceKey(), new Date()));
}
