import type { Db } from "../db";
import { addDays, kstDate, normalizeFlightNo } from "./normalize";

export interface FlightChoice {
  flightDate: string;
  flightNo: string;
  masterNo: string;
  airline: string;
  destName: string;
  terminal: string;
  gate: number | null;
  prevGate: number | null;
  gateChangedAt: Date | null;
  schedAt: Date;
  estAt: Date | null;
  status: string;
}

interface Row {
  flight_date: string;
  flight_no: string;
  master_no: string;
  airline: string;
  dest_name: string;
  terminal: string;
  gate: number | null;
  prev_gate: number | null;
  gate_changed_at: Date | null;
  sched_at: Date;
  est_at: Date | null;
  status: string;
}

// flight_date 는 드라이버마다 Date 로 바뀌는 방식이 달라 글자로 받는다.
const COLUMNS = `flight_date::text as flight_date, flight_no, master_no, airline, dest_name, terminal,
  gate, prev_gate, gate_changed_at, sched_at, est_at, status`;

function toChoice(r: Row): FlightChoice {
  return {
    flightDate: r.flight_date,
    flightNo: r.flight_no,
    masterNo: r.master_no,
    airline: r.airline,
    destName: r.dest_name,
    terminal: r.terminal,
    gate: r.gate,
    prevGate: r.prev_gate,
    gateChangedAt: r.gate_changed_at,
    schedAt: r.sched_at,
    estAt: r.est_at,
    status: r.status,
  };
}

/** 오늘과 내일(한국 날짜)의 해당 편. 이미 떠난 편은 빼고 예정 시각 순으로. */
export async function findFlights(db: Db, input: string, now: Date): Promise<FlightChoice[]> {
  const flightNo = normalizeFlightNo(input);
  if (!/^[A-Z0-9]{3,8}$/.test(flightNo)) return [];
  const today = kstDate(now);
  const rows = await db.query<Row>(
    `select ${COLUMNS} from flights
     where flight_no = $1 and flight_date in ($2, $3)
       and coalesce(est_at, sched_at) > $4
       and position('출발' in status) = 0
     order by sched_at`,
    [flightNo, today, addDays(today, 1), now],
  );
  return rows.map(toChoice);
}

export async function getFlight(db: Db, flightDate: string, flightNo: string): Promise<FlightChoice | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) return null;
  const [row] = await db.query<Row>(
    `select ${COLUMNS} from flights where flight_date = $1 and flight_no = $2`,
    [flightDate, normalizeFlightNo(flightNo)],
  );
  return row ? toChoice(row) : null;
}

/**
 * 공동운항이면 실제 운항 편. 탑승구와 시각은 이 값을 화면에 쓴다.
 * 운항 편이 테이블에 없으면 받은 편을 그대로 돌려준다.
 */
export async function operatingFlight(db: Db, f: FlightChoice): Promise<FlightChoice> {
  if (!f.masterNo || f.masterNo === f.flightNo) return f;
  return (await getFlight(db, f.flightDate, f.masterNo)) ?? f;
}
