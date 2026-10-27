import { lookupDemoBooking } from "@/lib/booking-demo";
import { fail } from "@/lib/api/dto";
import { json } from "@/lib/session-server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return json(fail(400, "입력값을 확인해 주세요"));
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return json(fail(413, "입력값이 너무 깁니다")); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(fail(400, "입력값을 확인해 주세요"));
    return json(lookupDemoBooking(body, new Date()));
  } catch { return json(fail(400, "입력값을 확인해 주세요")); }
}
