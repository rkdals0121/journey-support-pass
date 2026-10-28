import { getDb } from "@/lib/db";
import { readBody, requestDeviceKey } from "@/lib/session-server";
import { experienceEvent } from "@/lib/support-visits";
export async function POST(request: Request) {
  const b = await readBody(request);
  if (!["stamp_start", "stamp_finish", "stamp_share"].includes(String(b.kind))) return Response.json({ error: "기록 유형을 확인해 주세요" }, { status: 400 });
  await experienceEvent(await getDb(), await requestDeviceKey(), String(b.kind), 1, new Date());
  return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
}
