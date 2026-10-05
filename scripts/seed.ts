/**
 * 구역·패스·(선택) 모의 운항을 적재한다.
 *
 *   npm run seed                      구역과 패스만
 *   npm run seed -- --mock-flights    지금 시각 기준의 모의 운항까지
 *
 * 개발 서버가 떠 있으면 먼저 끄고 실행한다. 로컬 내장 DB 는 한 번에 한 프로세스만 연다.
 * 여러 번 실행해도 안전하다. 모의 운항은 실행할 때마다 지금 시각 기준으로 다시 맞춘다.
 */
import { hashCode } from "../src/lib/auth";
import { getDb, migrate } from "../src/lib/db";
import { ingestFlights, recordPoll } from "../src/lib/flights/ingest";
import { kstDate, type FlightRow } from "../src/lib/flights/normalize";
import { generatePasses } from "../src/lib/passes";
import { readSeedZones, seedZones } from "../src/lib/zones";

const PASS_COUNT = 30;
const MIN = 60_000;

function mockFlights(now: Date): FlightRow[] {
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
  ];
}

(async () => {
  const db = await getDb();
  await migrate(db);

  const zones = await seedZones(db, hashCode);
  console.log(`구역 ${zones}곳 적재`);

  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from passes");
  if (n === 0) {
    await generatePasses(db, PASS_COUNT);
    console.log(`패스 ${PASS_COUNT}장 생성`);
  } else {
    console.log(`패스 ${n}장이 이미 있어 새로 만들지 않음`);
  }

  if (process.argv.includes("--mock-flights")) {
    const now = new Date();
    await db.query("delete from flights where airline like '모의%'");
    const rows = mockFlights(now);
    await ingestFlights(db, rows, now);
    await recordPoll(db, { at: now, ok: true, rowCount: rows.length, durationMs: 0, gateChanges: 0 });
    console.log(`모의 운항 ${rows.length}편 적재: ${rows.map((r) => r.flightNo).join(", ")}`);
  }

  console.log("\n시범용 접속 코드 (모의 데이터 전용)");
  for (const z of readSeedZones().filter((z) => z.active)) console.log(`  ${z.code}  ${z.label}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
