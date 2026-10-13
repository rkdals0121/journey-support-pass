import type { Db } from "../db";
import { cityEn, codesByCity } from "../dest-en";
import { addDays, kstDate, normalizeFlightNo } from "./normalize";

export interface FlightChoice {
  flightDate: string;
  flightNo: string;
  masterNo: string;
  airline: string;
  destCode: string;
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
  dest_code: string;
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
const COLUMNS = `flight_date::text as flight_date, flight_no, master_no, airline, dest_code, dest_name, terminal,
  gate, prev_gate, gate_changed_at, sched_at, est_at, status`;

function toChoice(r: Row): FlightChoice {
  return {
    flightDate: r.flight_date,
    flightNo: r.flight_no,
    masterNo: r.master_no,
    airline: r.airline,
    destCode: r.dest_code,
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

const SUGGEST_LIMIT = 8;
// 도착지로 찾으면 같은 곳으로 가는 편이 여럿이다(도쿄는 이틀에 백 편이 넘는다). 화면이 출발 시간대로 나눠 보여 주므로 넉넉히 준다.
const DEST_LIMIT = 200;

/**
 * 편명을 치는 동안 보여줄 후보. 두 글자 이상이면 그 글자로 시작하는 편을 찾는다.
 * 정확히 같은 편명을 맨 위에, 나머지는 출발 시각 순으로 놓는다.
 *
 * 편명을 모르는 여객도 찾을 수 있게 세 가지를 더 받는다.
 *  - 도착지 이름: "도쿄" (한글이 들어 있으면 도착지 이름에서 찾는다)
 *  - 영어 도시 이름이나 공항 코드: "tokyo", "NRT"
 *  - 편명의 숫자만: "501" → KE501, OZ501 …
 */
export async function suggestFlights(db: Db, input: string, now: Date): Promise<FlightChoice[]> {
  const today = kstDate(now);
  const open = `flight_date in ($2, $3) and coalesce(est_at, sched_at) > $4 and position('출발' in status) = 0`;

  const name = input.trim().replace(/\s+/g, " ");
  if (/[가-힣]/.test(name)) {
    if (name.replace(/[^가-힣]/g, "").length < 2 || name.length > 16) return [];
    const rows = await db.query<Row>(
      `select ${COLUMNS} from flights
       where position($1 in dest_name) > 0 and ${open}
       order by sched_at, flight_no
       limit ${DEST_LIMIT}`,
      [name, today, addDays(today, 1), now],
    );
    return rows.map(toChoice);
  }

  const prefix = normalizeFlightNo(input);
  if (!/^[A-Z0-9]{2,16}$/.test(prefix)) return [];

  // 숫자만 넣었으면 편명의 숫자 부분(항공사 두 글자 뒤)에서 찾는다. 앞의 0 은 있어도 없어도 같게 본다.
  if (/^[0-9]+$/.test(prefix)) {
    const digits = prefix.replace(/^0+/, "");
    if (!digits) return [];
    const rows = await db.query<Row>(
      `select ${COLUMNS} from flights
       where left(ltrim(substr(flight_no, 3), '0'), $5) = $1 and ${open}
       order by (ltrim(substr(flight_no, 3), '0') = $1) desc, sched_at, flight_no
       limit ${DEST_LIMIT}`,
      [digits, today, addDays(today, 1), now, digits.length],
    );
    return rows.map(toChoice);
  }

  // 글자만 넣었고 편명으로는 없으면 공항 코드나 영어 도시 이름으로 본다.
  const codes = /^[A-Z]{3,16}$/.test(prefix) ? [...new Set([prefix.length === 3 ? prefix : "", ...codesByCity(prefix)].filter(Boolean))] : [];
  const rows = await db.query<Row>(
    `select ${COLUMNS} from flights
     where left(flight_no, $5) = $1 and flight_date in ($2, $3)
       and coalesce(est_at, sched_at) > $4
       and position('출발' in status) = 0
     order by (flight_no = $1) desc, sched_at, flight_no
     limit ${SUGGEST_LIMIT}`,
    [prefix, today, addDays(today, 1), now, prefix.length],
  );
  if (rows.length > 0 || codes.length === 0) return rows.map(toChoice);

  const byDest = await db.query<Row>(
    `select ${COLUMNS} from flights
     where dest_code = any($1) and ${open}
     order by sched_at, flight_no
     limit ${DEST_LIMIT}`,
    [codes, today, addDays(today, 1), now],
  );
  return byDest.map(toChoice);
}

export interface Destination {
  /** 도시 이름. 운항 정보의 "도쿄/나리타" 에서 "/" 앞부분. 이 값으로 다시 찾는다. */
  city: string;
  /** 영어 도시 이름. 모르는 공항이면 공항 코드. */
  en: string;
  /** 오늘과 내일 남은 편 수. */
  count: number;
}

/** 오늘과 내일 떠날 편이 있는 도착 도시. 편명을 모르는 여객이 도시를 눌러 고르게 하는 데 쓴다. */
export async function listDestinations(db: Db, now: Date): Promise<Destination[]> {
  const today = kstDate(now);
  const rows = await db.query<{ dest_name: string; dest_code: string; n: number }>(
    `select dest_name, dest_code, count(*)::int as n from flights
     where flight_date in ($1, $2) and coalesce(est_at, sched_at) > $3 and position('출발' in status) = 0
       and dest_name <> ''
     group by dest_name, dest_code`,
    [today, addDays(today, 1), now],
  );
  const byCity = new Map<string, { count: number; top: number; code: string }>();
  for (const r of rows) {
    const city = r.dest_name.split("/")[0].trim();
    if (!city) continue;
    const cur = byCity.get(city) ?? { count: 0, top: 0, code: "" };
    cur.count += r.n;
    // 그 도시에서 편이 가장 많은 공항의 코드로 영어 이름을 정한다.
    if (r.n > cur.top) {
      cur.top = r.n;
      cur.code = r.dest_code;
    }
    byCity.set(city, cur);
  }
  return [...byCity.entries()]
    .map(([city, v]) => ({ city, en: cityEn(v.code) || v.code || city, count: v.count }))
    .sort((a, b) => a.city.localeCompare(b.city, "ko"));
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
