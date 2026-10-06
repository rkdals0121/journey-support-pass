import { switchZoneHandler, zonesHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, setSessionCookie } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 공통 직원 코드로 들어온 사람이 근무 구역을 고르거나 바꾼다.
export async function GET() {
  return json(await zonesHandler(await getDb(), await currentSession()));
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const { token, ...result } = await switchZoneHandler(await getDb(), await currentSession(), body);
  if (token) await setSessionCookie(token);
  return json(result);
}
