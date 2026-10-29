import { boardingFlightHandler } from "@/lib/api/public";
import { fail } from "@/lib/api/dto";
import { getDb } from "@/lib/db";
import { json } from "@/lib/session-server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (text.length > 8192) return json(fail(413, "입력값이 너무 깁니다"));
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(fail(400, "입력값을 확인해 주세요"));
    return json(await boardingFlightHandler(await getDb(), body.scanned, new Date()));
  } catch { return json(fail(400, "입력값을 확인해 주세요")); }
}
