import { registerHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  return json(await registerHandler(await getDb(), body, await requestDeviceKey(), new Date()));
}
