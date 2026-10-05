import type { Db } from "../db";
import { fetchDepartures } from "./fetch";
import { ingestFlights, recordPoll } from "./ingest";
import { addDays, kstDate, normalizeRow, type FlightRow } from "./normalize";

type Fetcher = (apiKey: string, now: Date) => Promise<{ rows: Record<string, unknown>[]; pages: number }>;

export interface PollResult {
  ok: boolean;
  rowCount: number;
  gateChanges: number;
  error?: string;
}

/** 한 번 수집한다. 오늘과 내일(한국 날짜) 출발편만 남긴다. 실패해도 수집 기록은 남긴다. */
export async function runPoll(
  db: Db,
  apiKey: string,
  now: Date,
  fetcher: Fetcher = fetchDepartures,
  clock: () => number = Date.now,
): Promise<PollResult> {
  const started = clock();
  try {
    const { rows: raw } = await fetcher(apiKey, now);
    const today = kstDate(now);
    const keep = new Set([today, addDays(today, 1)]);
    const rows = raw
      .map(normalizeRow)
      .filter((r): r is FlightRow => r !== null && keep.has(r.flightDate));
    // 정상 응답이면 하루 출발편이 천 편을 넘는다. 0건은 장애로 본다.
    if (rows.length === 0) throw new Error("오늘·내일 출발편이 0건입니다");

    const { upserted, gateChanges } = await ingestFlights(db, rows, now);
    await recordPoll(db, { at: now, ok: true, rowCount: upserted, durationMs: clock() - started, gateChanges });
    return { ok: true, rowCount: upserted, gateChanges };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordPoll(db, { at: now, ok: false, rowCount: 0, durationMs: clock() - started, gateChanges: 0, error });
    return { ok: false, rowCount: 0, gateChanges: 0, error };
  }
}
