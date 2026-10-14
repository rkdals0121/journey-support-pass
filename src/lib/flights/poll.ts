import type { Db } from "../db";
import { fetchDepartures } from "./fetch";
import { ingestFlights, recordPoll } from "./ingest";
import { addDays, kstDate, normalizeRow, type FlightRow } from "./normalize";

type Fetcher = (apiKey: string, now: Date) => Promise<{ rows: Record<string, unknown>[]; pages: number }>;

/** 한 회차에서 받은 자료의 모양. 수집 주기와 "실시간" 표현을 정할 때 본다. */
export interface PollStats {
  pages: number; // API 호출 횟수
  rawRows: number; // 받은 전체 행 (API 는 날짜 인자와 무관하게 여러 날 치를 준다)
  todayRows: number;
  todayWithGate: number;
  todayDelayed: number; // 변경 출발 시각이 예정보다 늦은 편
  statuses: Record<string, number>; // 오늘 편의 상태 문구별 편 수
  durationMs: number;
}

export interface PollResult {
  ok: boolean;
  rowCount: number;
  gateChanges: number;
  error?: string;
  stats?: PollStats;
}

/**
 * 한 번 수집한다. 어제부터 모레까지(한국 날짜) 출발편을 남긴다. 실패해도 수집 기록은 남긴다.
 * 화면은 오늘과 내일 편만 보여 준다. 모레 편을 미리 받아 두는 것은 자정이 지나 "내일"이 바뀌었을 때
 * 다음 수집(매시 7분)까지 새 "내일" 편이 하나도 없는 틈을 없애기 위해서다.
 * 어제 편도 계속 고쳐 쓴다. 어제 밤 23:50 편이 01:00 으로 늦어지면 그 편의 날짜는 여전히 어제다.
 * 자정에 어제 편을 버리면 그 편의 탑승구와 시각이 멈춰, 여객은 옛 탑승구를 보고 패스는 너무 일찍 끝나 지워진다.
 */
export async function runPoll(
  db: Db,
  apiKey: string,
  now: Date,
  fetcher: Fetcher = fetchDepartures,
  clock: () => number = Date.now,
): Promise<PollResult> {
  const started = clock();
  try {
    const { rows: raw, pages } = await fetcher(apiKey, now);
    const today = kstDate(now);
    const keep = new Set([addDays(today, -1), today, addDays(today, 1), addDays(today, 2)]);
    const rows = raw
      .map(normalizeRow)
      .filter((r): r is FlightRow => r !== null && keep.has(r.flightDate));
    // 정상 응답이면 하루 출발편이 천 편을 넘는다. 0건은 장애로 본다.
    if (rows.length === 0) throw new Error("받아 두는 날짜(어제~모레)의 출발편이 0건입니다");

    const todayRows = rows.filter((r) => r.flightDate === today);
    const statuses: Record<string, number> = {};
    for (const r of todayRows) {
      const key = r.status || "(빈 값)";
      statuses[key] = (statuses[key] ?? 0) + 1;
    }

    const { upserted, gateChanges } = await ingestFlights(db, rows, now);
    const durationMs = clock() - started;
    await recordPoll(db, { at: now, ok: true, rowCount: upserted, durationMs, gateChanges });
    return {
      ok: true,
      rowCount: upserted,
      gateChanges,
      stats: {
        pages,
        rawRows: raw.length,
        todayRows: todayRows.length,
        todayWithGate: todayRows.filter((r) => r.gate !== null).length,
        todayDelayed: todayRows.filter((r) => r.estAt !== null && r.estAt.getTime() > r.schedAt.getTime()).length,
        statuses,
        durationMs,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordPoll(db, { at: now, ok: false, rowCount: 0, durationMs: clock() - started, gateChanges: 0, error });
    return { ok: false, rowCount: 0, gateChanges: 0, error };
  }
}
