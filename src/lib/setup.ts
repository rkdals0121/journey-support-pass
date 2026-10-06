import { hashCode } from "./auth";
import { migrate, type Db } from "./db";
import { ingestFlights, recordPoll } from "./flights/ingest";
import { kstDate, type FlightRow } from "./flights/normalize";
import { generatePasses } from "./passes";
import { readSeedZones, seedZones } from "./zones";

export const DEFAULT_PASS_COUNT = 30;
const MAX_PASS_COUNT = 500;
const MIN = 60_000;

/** 지금 시각 기준으로 곧 출발하는 모의 운항. 실제 편명과 겹치지 않게 MK·MC 로 시작한다. */
export function mockFlights(now: Date): FlightRow[] {
  // 초 단위를 버려 화면의 남은 시간이 깔끔하게 보이게 한다.
  const base = Math.floor(now.getTime() / MIN) * MIN;
  const at = (minutes: number) => new Date(base + minutes * MIN);
  const f = (
    flightNo: string,
    afterMin: number,
    terminal: FlightRow["terminal"],
    gate: number | null,
    destName: string,
    over: Partial<FlightRow> = {},
  ): FlightRow => {
    const schedAt = at(afterMin);
    return {
      flightDate: kstDate(schedAt),
      flightNo,
      masterNo: "",
      airline: "모의항공",
      destCode: "",
      destName,
      terminal,
      gate,
      schedAt,
      estAt: null,
      status: "",
      ...over,
    };
  };
  return [
    f("MK101", 35, "CONCOURSE", 101, "호찌민"), // 끝단, 마감 임박
    f("MK102", 70, "CONCOURSE", 130, "방콕"), // 끝단
    f("MK111", 120, "CONCOURSE", 115, "타이베이"), // 중앙부
    f("MK112", 180, "CONCOURSE", 124, "마닐라"), // 중간
    f("MK221", 90, "T2", 220, "뉴욕"),
    f("MK250", 150, "T2", 250, "파리", { estAt: at(190), status: "지연" }),
    f("MK900", 200, "CONCOURSE", null, "다낭"), // 탑승구 미정
    f("MK300", 100, "CONCOURSE", 104, "하노이"), // 공동운항의 실제 운항 편
    f("MC830", 100, "CONCOURSE", null, "하노이", { masterNo: "MK300", airline: "모의공동운항" }),
    // 공공데이터가 실제로 주는 상태 문구를 화면에서 확인하기 위한 편
    f("MK401", 25, "CONCOURSE", 105, "오사카", { status: "탑승중" }),
    f("MK402", 12, "CONCOURSE", 128, "후쿠오카", { status: "탑승마감" }),
    f("MK403", 240, "CONCOURSE", 103, "싱가포르", { status: "결항" }),
    f("MK501", 110, "T1", 20, "도쿄"), // 제1여객터미널 중앙
  ];
}

export interface SetupOptions {
  /** 구역 접속 코드 ({ 구역 id: 코드 }). null 이면 구역을 건드리지 않는다. */
  codes: Record<string, string> | null;
  /** true 면 모든 켜진 구역의 코드가 codes 에 있어야 한다. 저장소에 공개된 코드가 배포 DB 에 들어가는 것을 막는다. */
  requireAllCodes: boolean;
  mockFlights: boolean;
  /** true 면 모의 운항을 지운다. 실제 운항 정보를 연결한 뒤에 쓴다. */
  clearMockFlights?: boolean;
  passCount?: number;
}

export interface SetupResult {
  ok: boolean;
  error?: string;
  zones?: number;
  idlePasses?: number;
  newPasses?: number;
  mockFlights?: string[];
  clearedMockFlights?: number;
}

/** 테이블을 만들고 구역·패스·(선택) 모의 운항을 채운다. 여러 번 실행해도 안전하다. */
export async function runSetup(db: Db, opts: SetupOptions, now: Date): Promise<SetupResult> {
  await migrate(db);

  let zones: number | undefined;
  if (opts.codes) {
    if (opts.requireAllCodes) {
      const missing = readSeedZones().filter((z) => z.active && !opts.codes?.[z.id]);
      if (missing.length > 0) {
        return { ok: false, error: `접속 코드가 없는 구역: ${missing.map((z) => z.id).join(", ")}` };
      }
    }
    zones = await seedZones(db, hashCode, opts.codes);
  } else {
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from zones");
    if (n === 0) return { ok: false, error: "구역이 없습니다. 접속 코드와 함께 다시 실행하세요" };
  }

  // 패스는 일회용이라 쓸수록 줄어든다. 미사용 패스가 정한 장수가 되도록 채운다.
  const want = Math.min(Math.max(opts.passCount ?? DEFAULT_PASS_COUNT, 0), MAX_PASS_COUNT);
  const [{ idle }] = await db.query<{ idle: number }>(
    "select count(*)::int as idle from passes where state = 'idle'",
  );
  const newPasses = Math.max(want - idle, 0);
  if (newPasses > 0) await generatePasses(db, newPasses);

  let cleared: number | undefined;
  if (opts.clearMockFlights && !opts.mockFlights) {
    cleared = (await db.query("delete from flights where airline like '모의%' returning flight_no")).length;
  }

  let flights: string[] | undefined;
  if (opts.mockFlights) {
    await db.query("delete from flights where airline like '모의%'");
    const rows = mockFlights(now);
    await ingestFlights(db, rows, now);
    await recordPoll(db, { at: now, ok: true, rowCount: rows.length, durationMs: 0, gateChanges: 0 });
    flights = rows.map((r) => r.flightNo);
  }

  return {
    ok: true,
    zones,
    idlePasses: Math.max(idle, want),
    newPasses,
    mockFlights: flights,
    clearedMockFlights: cleared,
  };
}
