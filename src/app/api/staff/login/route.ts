import { crewKey } from "@/lib/support-crew-cookie";
import { loginHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import {
  json,
  readBody,
  requestDeviceKey,
  setSessionCookie,
} from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  const { token, ...result } = await loginHandler(
    await getDb(),
    body,
    await requestDeviceKey(),
    new Date(),
  );
  if (token) {
    await setSessionCookie(token);
    await crewKey(true);
  }
  return json(result);
}
