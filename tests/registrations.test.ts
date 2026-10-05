import { describe, expect, it } from "vitest";
import { findFlights, getFlight, operatingFlight } from "@/lib/flights/search";
import {
  createRegistration,
  findActiveByNameAndFlight,
  findPendingByReceipt,
  getRegistration,
} from "@/lib/registrations";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, regInput, register, registerWithPass } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");

async function setup() {
  const db = await createTestDb();
  await addFlights(
    db,
    [
      flightRow("KE123", "2026-10-05 14:30"),
      flightRow("KE123", "2026-10-06 14:30"),
      flightRow("KE001", "2026-10-05 09:00"),
      flightRow("KE777", "2026-10-05 11:30", { estAt: kst("2026-10-05 13:00") }),
      flightRow("KE888", "2026-10-05 12:30", { status: "출발" }),
      flightRow("KE123", "2026-10-07 14:30"),
      flightRow("TK091", "2026-10-05 23:20", { gate: 118, terminal: "T1" }),
      flightRow("OZ6931", "2026-10-05 23:20", { masterNo: "TK091", gate: null, terminal: "T1" }),
      flightRow("AA1", "2026-10-05 20:00", { masterNo: "ZZ9" }),
    ],
    now,
  );
  return db;
}

describe("편명 검색", () => {
  it("오늘과 내일 편을 예정 시각 순으로 돌려준다", async () => {
    const db = await setup();
    const res = await findFlights(db, "ke 123", now);
    expect(res.map((f) => f.flightDate)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("이미 떠난 편은 빼고, 지연되어 아직 안 떠난 편은 남긴다", async () => {
    const db = await setup();
    expect(await findFlights(db, "KE001", now)).toHaveLength(0);
    expect(await findFlights(db, "KE888", now)).toHaveLength(0);
    expect(await findFlights(db, "KE777", now)).toHaveLength(1);
  });

  it("없는 편명과 이상한 입력은 빈 목록", async () => {
    const db = await setup();
    expect(await findFlights(db, "ZZ999", now)).toHaveLength(0);
    expect(await findFlights(db, "", now)).toHaveLength(0);
    expect(await findFlights(db, "'; drop table flights; --", now)).toHaveLength(0);
  });

  it("공동운항은 실제 운항 편의 탑승구를 쓴다", async () => {
    const db = await setup();
    const f = await getFlight(db, "2026-10-05", "OZ6931");
    expect(f?.gate).toBeNull();
    const op = await operatingFlight(db, f!);
    expect(op.flightNo).toBe("TK091");
    expect(op.gate).toBe(118);
  });

  it("운항 편이 테이블에 없으면 자기 자신", async () => {
    const db = await setup();
    const f = await getFlight(db, "2026-10-05", "AA1");
    expect((await operatingFlight(db, f!)).flightNo).toBe("AA1");
  });
});

describe("등록", () => {
  it("연결 대기 상태로 만들고 접수 번호 네 자리를 준다", async () => {
    const db = await setup();
    const res = await createRegistration(db, regInput({ name: "  홍길동  " }), now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.registration).toMatchObject({
      name: "홍길동",
      status: "pending",
      flightDate: "2026-10-05",
      flightNo: "KE123",
      categories: ["cat_senior"],
      needs: ["mov_no_stairs", "com_slow"],
      route: "web",
      submittedAt: now,
      linkedAt: null,
    });
    expect(res.registration.receiptNo).toMatch(/^\d{4}$/);
  });

  it("작성 시작 시각과 수정 횟수를 남긴다", async () => {
    const db = await setup();
    const reg = await register(db, now, { editCount: 2 });
    const [row] = await db.query<{ started_at: Date; edit_count: number; is_mock: boolean; consent_at: Date }>(
      "select started_at, edit_count, is_mock, consent_at from registrations where id = $1",
      [reg.id],
    );
    expect(row.started_at).toEqual(kst("2026-10-05 11:58"));
    expect(row.edit_count).toBe(2);
    expect(row.is_mock).toBe(true);
    expect(row.consent_at).toEqual(now);
  });

  it("미래의 시작 시각은 제출 시각으로 바꾼다", async () => {
    const db = await setup();
    const reg = await register(db, now, { startedAt: kst("2026-10-05 13:00") });
    const [row] = await db.query<{ started_at: Date }>("select started_at from registrations where id = $1", [reg.id]);
    expect(row.started_at).toEqual(now);
  });

  it("동의, 이름, 선택 항목, 편명을 검증한다", async () => {
    const db = await setup();
    const fail = async (over: Parameters<typeof regInput>[0]) =>
      (await createRegistration(db, regInput(over), now)).ok;
    expect(await fail({ consent: false })).toBe(false);
    expect(await fail({ name: "   " })).toBe(false);
    expect(await fail({ name: "가".repeat(41) })).toBe(false);
    expect(await fail({ categories: [] })).toBe(false);
    expect(await fail({ needs: ["nope"] })).toBe(false);
    expect(await fail({ flightNo: "ZZ999" })).toBe(false);
    expect(await fail({ route: "kiosk" as never })).toBe(false);
    expect(await db.query("select 1 from registrations")).toHaveLength(0);
  });

  it("필요한 도움을 고르지 않아도 등록된다", async () => {
    const db = await setup();
    expect((await createRegistration(db, regInput({ needs: [] }), now)).ok).toBe(true);
  });

  it("접수 번호로 연결 대기 건을 찾는다", async () => {
    const db = await setup();
    const reg = await register(db, now);
    expect((await findPendingByReceipt(db, reg.receiptNo!))?.id).toBe(reg.id);
    expect(await findPendingByReceipt(db, "abcd")).toBeNull();

    await db.query("update registrations set status = 'active' where id = $1", [reg.id]);
    expect(await findPendingByReceipt(db, reg.receiptNo!)).toBeNull();
  });

  it("연결 대기 중인 접수 번호는 서로 겹치지 않는다", async () => {
    const db = await setup();
    const numbers = new Set<string>();
    for (let i = 0; i < 50; i++) numbers.add((await register(db, now)).receiptNo!);
    expect(numbers.size).toBe(50);
  });

  it("id 로 찾는다", async () => {
    const db = await setup();
    const reg = await register(db, now);
    expect((await getRegistration(db, reg.id))?.name).toBe("홍길동");
    expect(await getRegistration(db, "not-a-uuid")).toBeNull();
  });

  it("재발급용으로 이름과 편명으로 찾는다. 패스가 연결된 건만", async () => {
    const db = await setup();
    await register(db, now);
    const { registration } = await registerWithPass(db, now);
    const found = await findActiveByNameAndFlight(db, " 홍길동 ", "ke 123");
    expect(found.map((r) => r.id)).toEqual([registration.id]);
  });
});
