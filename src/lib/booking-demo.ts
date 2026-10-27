import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import type { Db } from "./db";
import { addDays, kstDate } from "./flights/normalize";
import { fail, ok, type ApiResult } from "./api/dto";
import type { BookingHandoff } from "./booking-model";

const TTL = 30 * 60_000;
const PURPOSE = "demo-booking-registration-v1";
const AIRLINE = "시연 항공";
interface Context { purpose: string; date: string; issued: number; expires: number }
function signature(value: string) {
  return createHmac("sha256", config.sessionSecret).update(PURPOSE + ":" + value).digest();
}
function encode(payload: Context) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return value + "." + signature(value).toString("base64url");
}
function decode(token: unknown, now: Date): Context | null {
  if (typeof token !== "string" || token.length > 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) return null;
  const [value, signed] = token.split(".");
  const actual = Buffer.from(signed, "base64url"), expected = signature(value);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(value, "base64url").toString()) as Context;
    if (p.purpose !== PURPOSE || !Number.isSafeInteger(p.issued) || !Number.isSafeInteger(p.expires)
      || p.issued > now.getTime() || p.expires <= now.getTime() || p.expires - p.issued !== TTL
      || p.date !== addDays(kstDate(new Date(p.issued)), 1)) return null;
    return p;
  } catch { return null; }
}

/** Stateless fixture lookup: no airline calls, database writes, or names in the response. */
export function lookupDemoBooking(body: Record<string, unknown>, now: Date, mode = config.dataMode): ApiResult {
  if (mode !== "mock") return fail(403, "시연 모드에서만 이용할 수 있습니다", "demo_disabled");
  if (body.airline !== "demo") return fail(400, "시연 항공을 선택해 주세요", "airline");
  const ref = typeof body.reference === "string" ? body.reference.trim().toUpperCase() : "";
  const name = typeof body.surname === "string" ? body.surname.trim().toUpperCase() : "";
  if (ref === "DEMO02" && name === "LEE") return fail(409, "취소된 시연 예약입니다. 항공편을 직접 선택해 주세요", "cancelled");
  if (ref !== "DEMO01" || name !== "KIM") return fail(404, "시연 예약을 찾지 못했습니다. DEMO01 / KIM을 확인해 주세요", "not_found");
  const date = addDays(kstDate(now), 1);
  const expires = now.getTime() + TTL;
  const handoff: BookingHandoff = {
    mode: "demo",
    flight: { flightDate: date, flightNo: "DX9001", airline: AIRLINE, destName: "도쿄", destCode: "NRT", day: "tomorrow", time: "18:00", cancelled: false },
    context: encode({ purpose: PURPOSE, date, issued: now.getTime(), expires }),
    expiresAt: new Date(expires).toISOString(),
  };
  return ok({ handoff });
}

/** Called only on consented registration. Never overwrites another flight. */
export async function prepareBookingFlight(db: Db, token: unknown, date: unknown, number: unknown, now: Date, mode = config.dataMode): Promise<ApiResult | null> {
  const p = mode === "mock" ? decode(token, now) : null;
  if (!p || date !== p.date || number !== "DX9001") return fail(400, "예약 조회 정보가 만료되었거나 변경되었습니다. 다시 조회해 주세요", "booking_context");
  const departure = new Date(p.date + "T18:00:00+09:00");
  await db.query(`insert into flights(flight_date,flight_no,master_no,airline,dest_code,dest_name,terminal,gate,sched_at,est_at,status,updated_at)
    values($1,'DX9001','',$2,'NRT','도쿄','CONCOURSE',130,$3,null,'',$4)
    on conflict(flight_date,flight_no) do nothing`, [p.date, AIRLINE, departure, now]);
  const [row] = await db.query<{ airline: string; sched_at: Date; terminal: string; gate: number; dest_code: string; status: string; est_at: Date | null }>(
    "select airline,sched_at,terminal,gate,dest_code,status,est_at from flights where flight_date=$1 and flight_no='DX9001'", [p.date]);
  if (!row || row.airline !== AIRLINE || new Date(row.sched_at).getTime() !== departure.getTime()
    || row.terminal !== "CONCOURSE" || row.gate !== 130 || row.dest_code !== "NRT" || row.status || row.est_at)
    return fail(409, "시연 항공편과 기존 운항 정보가 겹칩니다. 항공편을 직접 선택해 주세요", "booking_conflict");
  return null;
}
