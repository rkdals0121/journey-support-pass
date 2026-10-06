import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { endEncounter, getCase, listForZone, recordScan, startEncounter } from "@/lib/encounters";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, registerWithPass } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");

let db: Db;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDb();
  // 접속 코드 해시는 이 검사와 무관하므로 빠른 값으로 대신한다.
  await seedZones(db, () => "x:y");
  await addFlights(
    db,
    [
      flightRow("END1", "2026-10-05 12:30", { gate: 101 }), // 마감 12:20, 20분 남음
      flightRow("END2", "2026-10-05 13:40", { gate: 130 }), // 마감 13:30, 90분 남음
      flightRow("ENDX", "2026-10-05 12:10", { gate: 102, status: "결항" }),
      flightRow("CTR1", "2026-10-05 13:00", { gate: 115 }),
      flightRow("NOGATE", "2026-10-05 15:00", { gate: null }),
      flightRow("T2A", "2026-10-05 15:00", { gate: 220, terminal: "T2" }),
      flightRow("OP1", "2026-10-05 14:00", { gate: 104, estAt: kst("2026-10-05 14:40") }),
      flightRow("CS1", "2026-10-05 14:00", { gate: null, masterNo: "OP1", airline: "공동운항사" }),
    ],
    kst("2026-10-05 11:00"),
  );
  await addFlights(db, [flightRow("CTR1", "2026-10-05 13:00", { gate: 118 })], kst("2026-10-05 11:30"));

  for (const no of ["END2", "END1", "ENDX", "CTR1", "NOGATE", "T2A", "CS1"]) {
    const { registration } = await registerWithPass(db, kst("2026-10-05 11:40"), { flightNo: no, name: `여객-${no}` });
    ids[no] = registration.id;
  }
});

describe("구역별 목록", () => {
  it("탑승구가 이 구역인 여객만, 마감이 가까운 순으로, 결항은 맨 뒤에", async () => {
    const { assigned, gateUnknown } = await listForZone(db, "cc-end", now);
    expect(assigned.map((c) => c.flightNo)).toEqual(["END1", "END2", "CS1", "ENDX"]);
    expect(gateUnknown.map((c) => c.flightNo)).toEqual(["NOGATE"]);
  });

  it("다른 터미널의 탑승구 미정 편은 보이지 않는다", async () => {
    const { assigned, gateUnknown } = await listForZone(db, "t2-wam", now);
    expect(assigned.map((c) => c.flightNo)).toEqual(["T2A"]);
    expect(gateUnknown).toHaveLength(0);
  });

  it("안내데스크는 전체를 본다", async () => {
    const { assigned } = await listForZone(db, "desk-t1", now);
    expect(assigned).toHaveLength(7);
  });

  it("출발하고 30분이 지난 여객은 삭제 작업이 돌기 전에도 목록에서 빠진다", async () => {
    // END1 은 12:30 출발. 12:59 까지는 보이고 13:00 부터 안 보인다.
    const at = async (t: string) => (await listForZone(db, "cc-end", kst(t))).assigned.map((c) => c.flightNo);
    expect(await at("2026-10-05 12:59")).toContain("END1");
    expect(await at("2026-10-05 13:00")).not.toContain("END1");
    // 결항 편은 다음 날 04시까지 남는다.
    expect(await at("2026-10-05 23:00")).toContain("ENDX");
    expect(await at("2026-10-06 04:00")).not.toContain("ENDX");
    // 등록 자체는 지워지지 않았다. 지우는 것은 삭제 작업이 한다.
    expect(await getCase(db, ids.END1, kst("2026-10-05 13:00"))).not.toBeNull();
  });

  it("없는 구역은 빈 목록", async () => {
    expect(await listForZone(db, "nope", now)).toEqual({ assigned: [], gateUnknown: [] });
  });
});

describe("여객 카드", () => {
  it("남은 시간과 임박 여부", async () => {
    const c = await getCase(db, ids.END1, now);
    expect(c).toMatchObject({
      name: "여객-END1",
      gate: 101,
      terminal: "CONCOURSE",
      minutesToClose: 20,
      urgent: true,
      cancelled: false,
      zoneId: "cc-end",
      gateBand: "끝단",
      categories: ["cat_senior"],
      needs: ["mov_no_stairs", "com_slow"],
    });
    expect((await getCase(db, ids.END2, now))?.urgent).toBe(false);
  });

  it("탑승구 변경을 보여준다", async () => {
    const c = await getCase(db, ids.CTR1, now);
    expect(c).toMatchObject({ gate: 118, prevGate: 115, zoneId: "cc-center" });
    expect(c?.gateChangedAt).toEqual(kst("2026-10-05 11:30"));
  });

  it("공동운항은 실제 운항 편의 탑승구와 시각을 쓴다", async () => {
    const c = await getCase(db, ids.CS1, now);
    expect(c).toMatchObject({ flightNo: "CS1", operatingNo: "OP1", gate: 104, delayed: true, minutesToClose: 150 });
  });

  it("결항이면 남은 시간을 계산하지 않는다", async () => {
    expect(await getCase(db, ids.ENDX, now)).toMatchObject({ cancelled: true, minutesToClose: null, urgent: false });
  });

  it("탑승구 미정", async () => {
    expect(await getCase(db, ids.NOGATE, now)).toMatchObject({ gate: null, zoneId: null, facilities: null });
  });

  it("패스가 연결되지 않았거나 만료된 등록은 열리지 않는다", async () => {
    const { registration } = await registerWithPass(db, kst("2026-10-05 11:40"), { flightNo: "END2" });
    await db.query("update registrations set status = 'expired' where id = $1", [registration.id]);
    expect(await getCase(db, registration.id, now)).toBeNull();
    expect(await getCase(db, "not-a-uuid", now)).toBeNull();
  });
});

describe("응대 기록", () => {
  it("같은 구역이 다시 열어도 기록은 하나", async () => {
    const a = await recordScan(db, ids.END1, "cc-end", now);
    const b = await recordScan(db, ids.END1, "cc-end", kst("2026-10-05 12:01"));
    expect(b).toEqual({ id: a.id, started: false });
  });

  it("다른 구역이 스캔하면 새 기록이 생긴다 (인계)", async () => {
    const a = await recordScan(db, ids.END1, "cc-end", now);
    const b = await recordScan(db, ids.END1, "cc-center", now);
    expect(b.id).not.toBe(a.id);
  });

  it("시작한 뒤에만 완료할 수 있다", async () => {
    const e = await recordScan(db, ids.END2, "cc-end", now);
    expect(await endEncounter(db, e.id, "cc-end", now)).toBe(false);
    expect(await startEncounter(db, e.id, "cc-end", kst("2026-10-05 12:01"))).toBe(true);
    expect(await startEncounter(db, e.id, "cc-end", kst("2026-10-05 12:02"))).toBe(false);
    expect(await recordScan(db, ids.END2, "cc-end", kst("2026-10-05 12:02"))).toEqual({ id: e.id, started: true });
    expect(await endEncounter(db, e.id, "cc-end", kst("2026-10-05 12:05"))).toBe(true);
    expect(await endEncounter(db, e.id, "cc-end", kst("2026-10-05 12:06"))).toBe(false);

    const [row] = await db.query<{ started_at: Date; ended_at: Date }>(
      "select started_at, ended_at from encounters where id = $1",
      [e.id],
    );
    expect(row.started_at).toEqual(kst("2026-10-05 12:01"));
    expect(row.ended_at).toEqual(kst("2026-10-05 12:05"));
  });

  it("완료한 뒤 다시 스캔하면 새 기록이 생긴다", async () => {
    const first = await recordScan(db, ids.CTR1, "cc-center", now);
    await startEncounter(db, first.id, "cc-center", now);
    await endEncounter(db, first.id, "cc-center", now);
    const again = await recordScan(db, ids.CTR1, "cc-center", now);
    expect(again.id).not.toBe(first.id);
    expect(again.started).toBe(false);
  });

  it("다른 구역의 기록은 건드릴 수 없다", async () => {
    const e = await recordScan(db, ids.T2A, "t2-wam", now);
    expect(await startEncounter(db, e.id, "cc-end", now)).toBe(false);
    expect(await startEncounter(db, "not-a-uuid", "t2-wam", now)).toBe(false);
  });
});
