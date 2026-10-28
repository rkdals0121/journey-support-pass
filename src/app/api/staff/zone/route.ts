import { createHash } from "node:crypto";
import { crewKey } from "@/lib/support-crew-cookie";
import { switchZoneHandler, zonesHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import {
  currentSession,
  json,
  readBody,
  setSessionCookie,
} from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 공통 직원 코드로 들어온 사람이 근무 구역을 고르거나 바꾼다.
export async function GET() {
  return json(await zonesHandler(await getDb(), await currentSession()));
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const db = await getDb(),
    session = await currentSession(),
    key = await crewKey();
  const crewHash = createHash("sha256").update(key).digest("hex");
  if (session && !session.isKiosk && key && body.zoneId !== session.zoneId) {
    const active = await db.query(
      "select r.id from service_requests r join support_crew c on c.id=r.assigned_crew where c.session_hash=$1 and r.state in ('received','assigned','en_route','arrived','serving') and r.planned_at is null limit 1",
      [crewHash],
    );
    if (active.length)
      return Response.json(
        {
          error:
            "담당 중인 지원을 완료하거나 다른 직원에게 인계한 뒤 근무 구역을 바꿔 주세요.",
        },
        { status: 409 },
      );
  }
  const { token, ...result } = await switchZoneHandler(db, session, body);
  if (token && key)
    await db.query("update support_crew set zone_id=$2 where session_hash=$1", [
      crewHash,
      body.zoneId,
    ]);
  if (token) await setSessionCookie(token);
  return json(result);
}
