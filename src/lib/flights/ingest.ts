import type { Db } from "../db";
import type { FlightRow } from "./normalize";

// 받은 값으로 덮어쓰되, 탑승구가 실제로 바뀐 경우에만 이전 탑승구와 변경 시각을 남긴다.
// 응답에서 탑승구가 비어 온 경우에는 알고 있던 값을 유지한다.
const UPSERT = `
  insert into flights
    (flight_date, flight_no, master_no, airline, dest_code, dest_name, terminal, gate,
     sched_at, est_at, status, updated_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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

  let gateChanges = 0;
  for (const r of unique.values()) {
    const [res] = await db.query<{ changed: boolean }>(UPSERT, [
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
    if (res?.changed) gateChanges += 1;
  }
  return { upserted: unique.size, gateChanges };
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

export async function lastSuccessfulPoll(db: Db): Promise<Date | null> {
  const [row] = await db.query<{ at: Date | null }>("select max(polled_at) as at from flight_polls where ok");
  return row?.at ?? null;
}
