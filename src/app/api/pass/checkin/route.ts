import { checkinHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 모의 체크인. 체크인하면서 전자토큰을 탑승권에 저장한 것으로 적는다. QR 값을 아는 사람(여객 본인)만 할 수 있다. */
export async function POST(request: Request) {
  return json(await checkinHandler(await getDb(), await readBody(request), await requestDeviceKey(), new Date()));
}
