import { randomInt } from "node:crypto";
import type { Db } from "./db";
import type { Session } from "./auth";
import { kstDate } from "./flights/normalize";
import { ok, fail, type ApiResult } from "./api/dto";
export interface DemoFlight {
  flightNo: string;
  flightDate: string;
  departure: string;
  gate: number;
}
const AIRLINE = "모의 DX 시연";
function denied(s: Session | null, now: Date, mode: "mock" | "live") {
  if (!s || s.isKiosk || s.exp <= now.getTime())
    return fail(401, "직원 로그인이 필요합니다");
  if (s.needsZone) return fail(409, "근무 구역을 먼저 골라 주세요");
  if (!s.isDesk) return fail(403, "안내데스크 권한이 필요합니다");
  if (mode !== "mock")
    return fail(403, "모의 데이터 모드에서만 시연 항공편을 준비할 수 있습니다");
  return null;
}
export async function availableDemoFlight(
  db: Db,
  now: Date,
): Promise<DemoFlight | null> {
  const [row] = await db.query<{
    flight_no: string;
    flight_date: string;
    sched_at: Date;
    gate: number;
  }>(
    "select flight_no,flight_date::text,sched_at,gate from flights where airline=$1 and terminal='CONCOURSE' and gate=130 and sched_at>$2 and sched_at<=$3 and coalesce(status,'')='' order by sched_at limit 1",
    [
      AIRLINE,
      new Date(now.getTime() + 60 * 60000),
      new Date(now.getTime() + 24 * 3600000),
    ],
  );
  return row
    ? {
        flightNo: row.flight_no,
        flightDate: row.flight_date,
        departure: row.sched_at.toISOString(),
        gate: row.gate,
      }
    : null;
}
export async function prepareDemoFlight(
  db: Db,
  s: Session | null,
  now: Date,
  mode: "mock" | "live",
): Promise<ApiResult> {
  const auth = denied(s, now, mode);
  if (auth) return auth;
  const existing = await availableDemoFlight(db, now);
  if (existing) return ok({ flight: existing, reused: true });
  const departure = new Date(
      Math.floor(now.getTime() / 60000) * 60000 + 3 * 3600000,
    ),
    date = kstDate(departure);
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = "DX" + randomInt(1000, 10000);
    const inserted = await db.query(
      `insert into flights(flight_date,flight_no,master_no,airline,dest_code,dest_name,terminal,gate,sched_at,est_at,status,updated_at)
   values($1,$2,'',$3,'NRT','도쿄','CONCOURSE',130,$4,null,'',$5) on conflict(flight_date,flight_no) do nothing returning flight_no`,
      [date, number, AIRLINE, departure, now],
    );
    if (inserted.length)
      return ok({
        flight: {
          flightNo: number,
          flightDate: date,
          departure: departure.toISOString(),
          gate: 130,
        },
        reused: false,
      });
  }
  return fail(
    409,
    "시연 항공편을 준비하지 못했습니다. 잠시 후 다시 확인해 주세요",
  );
}
