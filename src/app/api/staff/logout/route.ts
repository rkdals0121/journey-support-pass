import { clearSessionCookie, json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return json({ status: 200, body: { ok: true } });
}
