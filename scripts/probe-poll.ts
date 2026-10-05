/**
 * 운항 API 실측 (명세 10장).
 *
 * 5분마다 출발편을 받아 out/probe-YYYYMMDD.jsonl 에 한 줄씩 남긴다.
 * 하루 돌린 뒤 이 파일로 세 가지를 확인한다.
 *   - 하루 호출 횟수가 인증키 한도 안에 드는가 (pages 합계)
 *   - 탑승구 변경, 출발 시각 변경, 상태 문구가 실제로 들어오는가
 *   - 실패하거나 늦는 비율은 얼마인가
 *
 * 사용법 (디코딩 키):
 *   ICN_API_KEY="..." npx tsx scripts/probe-poll.ts
 *   ICN_API_KEY="..." npx tsx scripts/probe-poll.ts --once
 */
import fs from "node:fs";
import path from "node:path";
import { fetchDepartures } from "../src/lib/flights/fetch";
import { kstDate, normalizeRow, type FlightRow } from "../src/lib/flights/normalize";

const INTERVAL_MS = 5 * 60 * 1000;
const key = process.env.ICN_API_KEY ?? "";
const once = process.argv.includes("--once");

if (!key) {
  console.error("ICN_API_KEY 환경 변수에 공공데이터포털 디코딩 키를 넣고 다시 실행하세요.");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

let prev = new Map<string, FlightRow>();

async function tick() {
  const now = new Date();
  const started = Date.now();
  const today = kstDate(now);
  const line: Record<string, unknown> = { at: now.toISOString() };
  try {
    const { rows: raw, pages } = await fetchDepartures(key, now);
    const rows = raw.map(normalizeRow).filter((r): r is FlightRow => r !== null);
    const todayRows = rows.filter((r) => r.flightDate === today);
    const cur = new Map(todayRows.map((r) => [r.flightNo, r]));

    const gateChanges: string[] = [];
    const timeChanges: string[] = [];
    for (const [no, r] of cur) {
      const p = prev.get(no);
      if (!p) continue;
      if (p.gate !== null && r.gate !== null && p.gate !== r.gate) gateChanges.push(`${no}:${p.gate}>${r.gate}`);
      if ((p.estAt?.getTime() ?? 0) !== (r.estAt?.getTime() ?? 0)) timeChanges.push(no);
    }
    const statuses: Record<string, number> = {};
    for (const r of todayRows) statuses[r.status || "(빈 값)"] = (statuses[r.status || "(빈 값)"] ?? 0) + 1;

    Object.assign(line, {
      ok: true,
      pages,
      rows: rows.length,
      todayRows: todayRows.length,
      todayWithGate: todayRows.filter((r) => r.gate !== null).length,
      todayDelayed: todayRows.filter((r) => r.estAt && r.estAt.getTime() > r.schedAt.getTime()).length,
      gateChanges,
      timeChanges: timeChanges.length,
      statuses,
    });
    prev = cur;
  } catch (e) {
    Object.assign(line, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  line.durationMs = Date.now() - started;

  const file = path.join(outDir, `probe-${today.replaceAll("-", "")}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
  console.log(JSON.stringify(line));
}

(async () => {
  await tick();
  if (!once) setInterval(tick, INTERVAL_MS);
})();
