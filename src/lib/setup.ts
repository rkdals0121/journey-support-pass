import { hashCode } from "./auth";
import { migrate, type Db } from "./db";
import { ingestFlights, recordPoll, SEED_POLL } from "./flights/ingest";
import { kstDate, type FlightRow } from "./flights/normalize";
import { readSeedZones, seedZones } from "./zones";

const MIN = 60_000;

// 영어 화면은 도착지 이름 대신 공항 코드를 보여준다.
const MOCK_DEST_CODE: Record<string, string> = {
  호찌민: "SGN",
  괌: "GUM",
  "오사카/간사이": "KIX",
  방콕: "BKK",
  타이베이: "TPE",
  마닐라: "MNL",
  뉴욕: "JFK",
  파리: "CDG",
  다낭: "DAD",
  하노이: "HAN",
  오사카: "KIX",
  후쿠오카: "FUK",
  싱가포르: "SIN",
  도쿄: "NRT",
  프랑크푸르트: "FRA",
};

/** 지금 시각 기준으로 곧 출발하는 모의 운항. 실제 편명과 겹치지 않게 MK·MC·MQ·MZ 로 시작한다. 항공사 이름은 모두 "모의"로 시작한다. */
export function mockFlights(now: Date, stretch = 1): FlightRow[] {
  // 초 단위를 버려 화면의 남은 시간이 깔끔하게 보이게 한다.
  const base = Math.floor(now.getTime() / MIN) * MIN;
  // stretch 를 키우면 출발까지 남은 시간이 그만큼 늘어난다. 시연용 여객이 금방 사라지지 않게 할 때 쓴다.
  const at = (minutes: number) => new Date(base + minutes * MIN * stretch);
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
      destCode: MOCK_DEST_CODE[destName] ?? "",
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
    f("MK127", 160, "CONCOURSE", 127, "프랑크푸르트"), // 제안서의 예시 장면 (탑승동 키오스크 → 127번 탑승구)
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
    f("MK601", 210, "CONCOURSE", 119, "괌"), // 이름이 한 글자인 도시. 도시에서 고를 때도 찾아져야 한다
    // 같은 곳으로 가는 편이 많은 경우. 도착 도시로 찾으면 출발 시간대를 먼저 고르게 되는 장면을 확인한다.
    // 항공사도 셋으로 나눠, 시간대를 골라도 편이 많을 때 항공사를 한 번 더 묻는 장면까지 볼 수 있게 한다.
    ...[60, 140, 220, 330, 450, 570, 690, 810, 930, 1050, 1230, 1410].map((min, i) => {
      const [code, airline] = [
        ["MK", "모의항공"],
        ["MQ", "모의저비용항공"],
        ["MZ", "모의국제항공"],
      ][i % 3];
      return f(`${code}7${String(i + 1).padStart(2, "0")}`, min, "CONCOURSE", 106 + i * 2, "오사카/간사이", { airline });
    }),
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
  /** true 면 "여러 번 틀려서 잠김"을 푼다. 코드나 번호를 틀린 기록만 지운다. 운영자가 잠긴 키오스크를 풀 때와 화면 점검을 연달아 돌릴 때 쓴다. */
  clearLocks?: boolean;
}

export interface SetupResult {
  ok: boolean;
  error?: string;
  zones?: number;
  mockFlights?: string[];
  clearedMockFlights?: number;
  clearedLocks?: number;
}

/** 테이블을 만들고 구역·(선택) 모의 운항을 채운다. 여러 번 실행해도 안전하다. 패스는 등록할 때 만들어지므로 미리 만들지 않는다. */
export async function runSetup(db: Db, opts: SetupOptions, now: Date): Promise<SetupResult> {
  await migrate(db);

  let zones: number | undefined;
  if (opts.codes) {
    // 짧은 코드는 맞힐 때까지 넣어 보기 쉽다. 여섯 자리보다 짧은 코드는 받지 않는다.
    const short = Object.entries(opts.codes).filter(([, c]) => typeof c !== "string" || c.trim().length < 6);
    if (short.length > 0) return { ok: false, error: `여섯 자리보다 짧은 접속 코드: ${short.map(([id]) => id).join(", ")}` };
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

  let clearedLocks: number | undefined;
  if (opts.clearLocks) {
    clearedLocks = (await db.query("delete from access_logs where action in ('login_fail', 'number_fail') returning id")).length;
  }

  let cleared: number | undefined;
  if (opts.clearMockFlights && !opts.mockFlights) {
    cleared = (await db.query("delete from flights where airline like '모의%' returning flight_no")).length;
  }

  let flights: string[] | undefined;
  if (opts.mockFlights) {
    await db.query("delete from flights where airline like '모의%'");
    const rows = mockFlights(now);
    await ingestFlights(db, rows, now);
    // 실제 수집이 아니라는 표시(SEED_POLL)를 남긴다. 실제 수집이 멈춘 것을 가리지 않게 한다.
    await recordPoll(db, { at: now, ok: true, rowCount: rows.length, durationMs: 0, gateChanges: 0, error: SEED_POLL });
    flights = rows.map((r) => r.flightNo);
  }

  return {
    ok: true,
    zones,
    mockFlights: flights,
    clearedMockFlights: cleared,
    clearedLocks,
  };
}
