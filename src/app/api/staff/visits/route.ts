import { recordStudy, studySummary } from "@/lib/support-study";
import { getDb } from "@/lib/db";
import { staffVisits, staffVisitAction, updateHubRule, crewShift, staffDenied, experienceSummary, experienceEvent } from "@/lib/support-visits";
import { crewKey } from "@/lib/support-crew-cookie";
import { currentSession, json, readBody } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const now = new Date(), session = await currentSession(now), db = await getDb();
  if (new URL(request.url).searchParams.get("study") === "1") {
    if (staffDenied(session, now) || !session!.isDesk) return Response.json({error:"안내데스크 로그인이 필요합니다"},{status:403});
    return Response.json({rows:await studySummary(db)});
  }
  return json(new URL(request.url).searchParams.get("summary") === "1" ? await experienceSummary(db, session, now) : await staffVisits(db, session, await crewKey(), now));
}
export async function POST(request: Request) {
  const body = await readBody(request), now = new Date(), s = await currentSession(now), db = await getDb();
  if (staffDenied(s, now)) return Response.json({ error: "직원 로그인이 필요합니다" }, { status: 401 });
  if (body.action === "study") return json(await recordStudy(db,s,body,now));
  if (body.action === "rule") return json(await updateHubRule(db, s, body, now));
  if (body.action === "shift") return json(await crewShift(db, s, await crewKey(true), body, now));
  if (body.action === "paper") {
    if (!s!.isDesk || !Number.isInteger(body.value) || Number(body.value) < 0 || Number(body.value) > 1000) return Response.json({ error: "확인된 인쇄물 대체 수량을 적어 주세요" }, { status: 400 });
    await experienceEvent(db, await crewKey(), "paper_replaced", Number(body.value), now);
    return json({ status: 200, body: { saved: true } });
  }
  return json(await staffVisitAction(db, s, await crewKey(), body, now));
}
