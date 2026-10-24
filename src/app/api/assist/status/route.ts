import { assistStatusHandler } from "@/lib/api/entry";
import { getDb } from "@/lib/db";
import { json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

/** 이동지원 요청의 접수 상태. QR 값은 주소에 싣지 않도록 본문으로 받는다. */
export async function POST(request: Request) {
  return json(await assistStatusHandler(await getDb(), await readBody(request), new Date()));
}
