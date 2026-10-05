import { kstDate, parseResponse } from "./normalize";

const BASE = "https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerDeparturesDeOdp";
const ROWS = 1000;
const MAX_PAGES = 30;
const TIMEOUT_MS = 60_000;
const TRIES = 3;

async function fetchPage(apiKey: string, day: string, page: number): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams({
    serviceKey: apiKey, // 디코딩 키를 넣는다. URLSearchParams 가 인코딩한다.
    numOfRows: String(ROWS),
    pageNo: String(page),
    search_begin_dt: day,
    search_end_dt: day,
    type: "json",
    lang: "K",
  });
  let last: unknown;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}?${q}`, {
        headers: { "User-Agent": "journey-support-pass/0.1" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseResponse(await res.text());
    } catch (e) {
      last = e;
      if (attempt < TRIES) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw last;
}

/**
 * 출발편 원본 행을 받는다. 이 API 는 날짜 인자와 무관하게 D-3~D+6 전체를 돌려줄 수 있으므로
 * 호출한 쪽에서 필요한 날짜만 걸러 써야 한다.
 */
export async function fetchDepartures(
  apiKey: string,
  now: Date,
): Promise<{ rows: Record<string, unknown>[]; pages: number }> {
  if (!apiKey) throw new Error("ICN_API_KEY 가 없습니다");
  const day = kstDate(now).replaceAll("-", "");
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const items = await fetchPage(apiKey, day, page);
    rows.push(...items);
    if (items.length < ROWS) break;
  }
  return { rows, pages: Math.min(page, MAX_PAGES) };
}
