import { config } from "../config";
import type { Db } from "../db";
import type { FlightRow } from "./normalize";

// 받은 값으로 덮어쓰되, 탑승구가 실제로 바뀐 경우에만 이전 탑승구와 변경 시각을 남긴다.
// 응답에서 탑승구가 비어 온 경우에는 알고 있던 값을 유지한다.
const COLS = 12;
const BATCH = 200;

// 한 편씩 넣으면 하루 2천여 편에 30초 넘게 걸린다. 여러 편을 한 문장으로 넣는다.
const upsertSql = (n: number) => `
  insert into flights
    (flight_date, flight_no, master_no, airline, dest_code, dest_name, terminal, gate,
     sched_at, est_at, status, updated_at)
  values ${Array.from(
    { length: n },
    (_, i) => `(${Array.from({ length: COLS }, (_, c) => `$${i * COLS + c + 1}`).join(", ")})`,
  ).join(", ")}
  on conflict (flight_date, flight_no) do update set
    master_no = excluded.master_no,
    airline = excluded.airline,
    dest_code = excluded.dest_code,
    dest_name = excluded.dest_name,
    terminal = excluded.terminal,
    prev_gate = case
      when flights.gate is not null and excluded.gate is not null and flights.gate <> excluded.gate
      then flights.gate else flights.prev_gate end,
    gate_changed_at = case
      when flights.gate is not null and excluded.gate is not null and flights.gate <> excluded.gate
      then excluded.updated_at else flights.gate_changed_at end,
    gate = coalesce(excluded.gate, flights.gate),
    sched_at = excluded.sched_at,
    est_at = excluded.est_at,
    status = excluded.status,
    updated_at = excluded.updated_at
  returning (gate_changed_at is not null and gate_changed_at = updated_at) as changed`;

export async function ingestFlights(
  db: Db,
  rows: FlightRow[],
  now: Date,
): Promise<{ upserted: number; gateChanges: number }> {
  // 같은 편이 한 응답에 두 번 들어오면 마지막 것만 쓴다.
  const unique = new Map<string, FlightRow>();
  for (const r of rows) unique.set(`${r.flightDate}|${r.flightNo}`, r);

  const all = [...unique.values()];
  let gateChanges = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH);
    const params = chunk.flatMap((r) => [
      r.flightDate,
      r.flightNo,
      r.masterNo,
      r.airline,
      r.destCode,
      r.destName,
      r.terminal,
      r.gate,
      r.schedAt,
      r.estAt,
      r.status,
      now,
    ]);
    const res = await db.query<{ changed: boolean }>(upsertSql(chunk.length), params);
    gateChanges += res.filter((x) => x.changed).length;
  }
  return { upserted: all.length, gateChanges };
}

export interface PollRecord {
  at: Date;
  ok: boolean;
  rowCount: number;
  durationMs: number;
  gateChanges: number;
  error?: string;
}

export async function recordPoll(db: Db, p: PollRecord): Promise<void> {
  await db.query(
    `insert into flight_polls (polled_at, ok, row_count, duration_ms, gate_changes, error)
     values ($1, $2, $3, $4, $5, $6)`,
    [p.at, p.ok, p.rowCount, p.durationMs, p.gateChanges, p.error ?? null],
  );
}

/**
 * 모의 운항을 넣을 때(설치, 시연용 패스) 남기는 수집 기록의 error 값. 실제 수집이 아니라는 표시다.
 * 이 표시가 없으면 실제 수집이 멈춘 동안 시연용 패스를 만들 때마다 "방금 수집함"으로 보여
 * 실제 편의 옛 탑승구와 시각이 "운항 정보가 늦어지고 있습니다" 경고 없이 나간다.
 */
export const SEED_POLL = "seed";

/**
 * 마지막으로 수집에 성공한 시각. 모의 운항을 넣은 기록(SEED_POLL)은 운항 정보 키가 없고(실제 수집을 하지 않는 곳)
 * 실제 수집 성공도 한 번도 없을 때만 쓴다. 키 없이 모의 운항만 쓰는 개발·점검 환경에서 "운항 정보 없음"이 뜨지 않게 하기 위해서다.
 * 키가 있는데 수집이 한 번도 성공하지 못했으면(아직 쓸 수 없는 새 키, 잘못 넣은 키) 넣은 기록으로 가리지 않는다.
 * 가리면 실제 편의 옛 탑승구와 시각이 "운항 정보가 늦어지고 있습니다" 경고 없이 나간다.
 */
export async function lastSuccessfulPoll(db: Db, useSeed = !config.icnApiKey): Promise<Date | null> {
  const [row] = await db.query<{ at: Date | null }>(
    `select coalesce(
       (select max(polled_at) from flight_polls where ok and error is distinct from $1),
       case when $2::boolean then (select max(polled_at) from flight_polls where ok and error = $1) end
     ) as at`,
    [SEED_POLL, useSeed],
  );
  return row?.at ?? null;
}
