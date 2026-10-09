import { kioskLoginHandler } from "@/lib/api/kiosk";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { json, readBody, requestDeviceKey, setSessionCookie } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  const { token, ...result } = await kioskLoginHandler(await getDb(), body, await requestDeviceKey(), new Date());
  if (token) await setSessionCookie(token, config.kioskSessionDays * 24);
  return json(result);
}
