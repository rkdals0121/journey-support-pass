import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { login } from "@/lib/auth";
import { migrate, openPglite, type Db } from "@/lib/db";
import { findFlights, getFlight } from "@/lib/flights/search";
import { lastSuccessfulPoll } from "@/lib/flights/ingest";
import { mockFlights, runSetup } from "@/lib/setup";
import { readSeedZones } from "@/lib/zones";
import { kst } from "./helpers/db";

const now = kst("2026-10-05 12:00");
const seed = readSeedZones();
const activeIds = seed.filter((z) => z.active).map((z) => z.id);
const allCodes = Object.fromEntries(activeIds.map((id, i) => [id, String(900000 + i)]));
// 접속 코드 해시(scrypt)는 일부러 느리게 만든 계산이다. 컴퓨터가 바쁠 때도 시간 초과가 나지 않게 넉넉히 둔다.
const SLOW = 400_000;

describe("모의 운항", () => {
  it("편명이 겹치지 않고 모두 모의 항공사 코드(MK·MC·MQ·MZ)로 시작한다", () => {
    const rows = mockFlights(now);
    expect(new Set(rows.map((r) => r.flightNo)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.flightNo).toMatch(/^M[KCQZ]\d+$/);
      expect(r.airline.startsWith("모의")).toBe(true);
      expect(r.schedAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("제안서 예시 장면의 편이 있다. 탑승동 127번 탑승구다", () => {
    const f = mockFlights(now).find((r) => r.flightNo === "MK127");
    expect(f).toMatchObject({ terminal: "CONCOURSE", gate: 127, destName: "프랑크푸르트", destCode: "FRA", status: "" });
    expect(f?.schedAt).toEqual(kst("2026-10-05 14:40"));
  });

  it("초 단위는 버리고, 늘리는 배수를 주면 출발까지 남은 시간이 그만큼 늘어난다", () => {
    const at = new Date(now.getTime() + 42_000);
    const of = (stretch?: number) => mockFlights(at, stretch).find((r) => r.flightNo === "MK127")!.schedAt;
    expect(of()).toEqual(kst("2026-10-05 14:40"));
    expect(of(4)).toEqual(kst("2026-10-05 22:40"));
  });

  it("도착지마다 공항 코드가 있다", () => {
    for (const r of mockFlights(now)) expect(r.destCode, r.flightNo).toMatch(/^[A-Z]{3}$/);
  });
});

describe("초기 설정", () => {
  // 내장 DB 를 띄우는 데 오래 걸린다. 첫 검사만 정말 빈 DB 로 하고, 나머지는 DB 하나를 비워 가며 쓴다.
  let db: Db;
  beforeAll(async () => {
    db = await openPglite();
    await migrate(db);
  });
  beforeEach(async () => {
    await db.exec("truncate table zones, flights, flight_polls, access_logs restart identity");
  });

  it("빈 DB 에 테이블, 구역, 모의 운항을 채운다. 패스는 미리 만들지 않는다", async () => {
    const db = await openPglite();
    const res = await runSetup(db, { codes: allCodes, requireAllCodes: true, mockFlights: true }, now);
    expect(res).toMatchObject({ ok: true, zones: seed.length });
    expect(res).not.toHaveProperty("idlePasses");
    expect(res).not.toHaveProperty("newPasses");
    expect(await db.query("select 1 from passes")).toHaveLength(0);

    expect(res.mockFlights).toEqual(mockFlights(now).map((f) => f.flightNo));
    expect(res.mockFlights).toContain("MK127");
    expect(await findFlights(db, "MK101", now)).toHaveLength(1);
    expect(await getFlight(db, "2026-10-05", "MK127")).toMatchObject({ terminal: "CONCOURSE", gate: 127 });
    // 모의 운항을 넣은 시각이 운항 정보 기준 시각이 된다.
    expect(await lastSuccessfulPoll(db)).toEqual(now);

    // 넘겨준 코드로 로그인되고, 저장소에 공개된 코드로는 안 된다.
    expect((await login(db, allCodes["cc-end"], "d1", now)).ok).toBe(true);
    expect((await login(db, "201132", "d2", now)).ok).toBe(false);
  }, SLOW);

  it("키오스크 자리가 구역 표에 키오스크로 들어간다", async () => {
    await runSetup(db, { codes: allCodes, requireAllCodes: true, mockFlights: false }, now);
    const rows = await db.query<{ id: string }>("select id from zones where is_kiosk");
    expect(rows.map((r) => r.id)).toEqual(["kiosk"]);
    expect(await db.query("select 1 from flights")).toHaveLength(0);
    // 키오스크 설치 코드도 넘겨준 값으로 바뀐다. 저장소에 공개된 코드로는 설치할 수 없다.
    expect((await login(db, allCodes["kiosk"], "d3", now, { placeId: "cc-train" })).ok).toBe(true);
    expect((await login(db, "300300", "d4", now, { placeId: "cc-train" })).ok).toBe(false);
  }, SLOW);

  it("켜진 구역의 코드가 하나라도 빠지면 아무 구역도 넣지 않는다. 키오스크 코드도 빠지면 안 된다", async () => {
    for (const id of ["cc-end", "kiosk"]) {
      const partial = { ...allCodes };
      delete partial[id];
      const res = await runSetup(db, { codes: partial, requireAllCodes: true, mockFlights: false }, now);
      expect(res.ok).toBe(false);
      expect(res.error).toContain(id);
      expect(await db.query("select 1 from zones")).toHaveLength(0);
    }
  });

  it("코드 없이 부르면 구역은 그대로 두고 모의 운항만 다시 맞춘다", async () => {
    await runSetup(db, { codes: allCodes, requireAllCodes: true, mockFlights: true }, now);
    const later = kst("2026-10-05 18:00");
    const res = await runSetup(db, { codes: null, requireAllCodes: true, mockFlights: true }, later);
    expect(res).toMatchObject({ ok: true });
    expect(res.zones).toBeUndefined();
    expect(await findFlights(db, "MK101", later)).toHaveLength(1);
    expect((await login(db, allCodes["cc-end"], "d1", later)).ok).toBe(true);
    const flights = await db.query("select 1 from flights");
    expect(flights).toHaveLength(res.mockFlights!.length);
  }, SLOW);

  it("모의 운항을 지우라고 하면 모의 편만 지운다", async () => {
    await runSetup(db, { codes: allCodes, requireAllCodes: true, mockFlights: true }, now);
    await db.query(
      `insert into flights (flight_date, flight_no, airline, sched_at, updated_at)
       values ('2026-10-05', 'KE123', '대한항공', $1, $1)`,
      [kst("2026-10-05 14:30")],
    );
    const res = await runSetup(db, { codes: null, requireAllCodes: false, mockFlights: false, clearMockFlights: true }, now);
    expect(res).toMatchObject({ ok: true, clearedMockFlights: mockFlights(now).length });
    const left = await db.query<{ flight_no: string }>("select flight_no from flights");
    expect(left.map((f) => f.flight_no)).toEqual(["KE123"]);
  });

  it("구역이 없는 DB 에 코드 없이 부르면 거부한다", async () => {
    const res = await runSetup(db, { codes: null, requireAllCodes: true, mockFlights: false }, now);
    expect(res.ok).toBe(false);
  });
});
