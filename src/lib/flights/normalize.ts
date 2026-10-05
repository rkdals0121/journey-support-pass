// 공공데이터포털 '여객기 운항 현황 상세 조회 서비스' 응답을 우리 형식으로 바꾼다.
// 항목 이름 후보는 운항 조회 웹 scripts/collect.py 의 FIELD_MAP 을 그대로 옮긴 것이다.
// API 가 항목 이름을 바꾸면 여기 FIELD_MAP 만 고친다.

export type Terminal = "T1" | "CONCOURSE" | "T2" | "";

export interface FlightRow {
  flightDate: string; // 예정 출발의 한국 날짜 YYYY-MM-DD
  flightNo: string;
  masterNo: string; // 공동운항이면 실제 운항 편명
  airline: string;
  destCode: string;
  destName: string;
  terminal: Terminal;
  gate: number | null;
  schedAt: Date;
  estAt: Date | null;
  status: string;
}

const FIELD_MAP = {
  flight: ["flightId", "flightid", "airFln", "fnumber"],
  master: ["masterflightid", "masterFlightId", "masterflight", "masterFln"],
  airline: ["airline", "airlineKorean", "airlineNameKo"],
  gate: ["gatenumber", "gateNumber", "gate"],
  terminal: ["terminalid", "terminalId", "terminal"],
  scheduled: ["scheduleDateTime", "scheduledDateTime", "std"],
  estimated: ["estimatedDateTime", "etd"],
  airportCode: ["airportCode", "p1code", "cityCode"],
  airportName: ["airport", "airportKorean", "airportName1"],
  status: ["remark", "stattxt", "status"],
} as const;

const TERMINAL_CODE: Record<string, Terminal> = {
  P01: "T1",
  P1: "T1",
  T1: "T1",
  P02: "CONCOURSE",
  P2: "CONCOURSE",
  탑승동: "CONCOURSE",
  P03: "T2",
  P3: "T2",
  T2: "T2",
};

function pick(row: Record<string, unknown>, key: keyof typeof FIELD_MAP): string {
  for (const cand of FIELD_MAP[key]) {
    const v = row[cand];
    if (v !== null && v !== undefined && v !== "") return String(v).trim();
  }
  return "";
}

/** "202609231430" 을 한국 시각으로 읽는다. */
export function parseKst(s: string): Date | null {
  if (!/^\d{12}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date 의 한국 날짜 "YYYY-MM-DD" */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 한국 날짜에 days 를 더한 날짜 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseResponse(text: string): Record<string, unknown>[] {
  const data = JSON.parse(text);
  const body = data?.response?.body ?? data?.body ?? data;
  let items = body?.items ?? [];
  if (items && !Array.isArray(items) && typeof items === "object") items = items.item ?? [];
  if (items && !Array.isArray(items) && typeof items === "object") items = [items];
  return Array.isArray(items) ? items : [];
}

export function normalizeFlightNo(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizeRow(raw: Record<string, unknown>): FlightRow | null {
  const flightNo = normalizeFlightNo(pick(raw, "flight"));
  const schedAt = parseKst(pick(raw, "scheduled"));
  if (!flightNo || !schedAt) return null;

  const gate = pick(raw, "gate");
  const term = pick(raw, "terminal").toUpperCase();
  return {
    flightDate: kstDate(schedAt),
    flightNo,
    masterNo: normalizeFlightNo(pick(raw, "master")),
    airline: pick(raw, "airline"),
    destCode: pick(raw, "airportCode").toUpperCase(),
    destName: pick(raw, "airportName"),
    terminal: TERMINAL_CODE[term] ?? "",
    gate: /^\d+$/.test(gate) ? Number(gate) : null,
    schedAt,
    estAt: parseKst(pick(raw, "estimated")),
    status: pick(raw, "status"),
  };
}
