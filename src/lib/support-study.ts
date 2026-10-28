import type { Db } from "./db";
import type { Session } from "./auth";
import { fail, ok } from "./api/dto";
import { staffDenied } from "./support-visits";
export async function recordStudy(db: Db, session: Session | null, body: Record<string, unknown>, now: Date) {
  if (staffDenied(session, now) || !session!.isDesk) return fail(403, "안내데스크에서 기록해 주세요");
  if (!["phone", "web"].includes(String(body.channel)) || !["guidance", "mobility", "facility"].includes(String(body.task)) ||
      !Number.isInteger(body.seconds) || Number(body.seconds) < 1 || Number(body.seconds) > 7200 ||
      !Number.isInteger(body.relays) || Number(body.relays) < 0 || Number(body.relays) > 50 ||
      !Number.isInteger(body.repeated) || Number(body.repeated) < 0 || Number(body.repeated) > 50 || typeof body.completed !== "boolean")
    return fail(400, "같은 과제의 측정값을 범위 안에서 기록해 주세요");
  await db.query("insert into support_studies(channel,task,seconds,relays,repeated,completed,at) values($1,$2,$3,$4,$5,$6,$7)", [body.channel,body.task,body.seconds,body.relays,body.repeated,body.completed,now]);
  return ok({ saved: true });
}
export async function studySummary(db: Db) {
  return db.query(`select channel,task,count(*)::int as n,(percentile_cont(.5) within group(order by seconds))::int as seconds,round(avg(relays),2)::float as relays,round(avg(repeated),2)::float as repeated,count(*) filter(where completed)::int as completed from support_studies group by channel,task order by task,channel`);
}
