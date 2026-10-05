import { describe, expect, it } from "vitest";
import { logAccess } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { recordScan, startEncounter, endEncounter } from "@/lib/encounters";
import { generatePasses, idleTokenByPassNo, linkPass, reissue, resolveToken } from "@/lib/passes";
import { purge } from "@/lib/purge";
import { getRegistration } from "@/lib/registrations";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, register, registerWithPass } from "./helpers/fixtures";

const t0 = kst("2026-10-05 12:00");

async function setup(...flights: ReturnType<typeof flightRow>[]): Promise<Db> {
  const db = await createTestDb();
  await seedZones(db, () => "x:y");
  await addFlights(db, flights, t0);
  return db;
}

const statusOf = async (db: Db, id: string) => (await getRegistration(db, id))?.status;

describe("출발 후 삭제", () => {
  it("출발 30분 뒤에 지운다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30", { gate: 101 }));
    const { registration, pass } = await registerWithPass(db, t0);

    expect((await purge(db, kst("2026-10-05 14:59"))).purged).toBe(0);
    expect(await statusOf(db, registration.id)).toBe("active");

    expect((await purge(db, kst("2026-10-05 15:00"))).purged).toBe(1);
    const [row] = await db.query<Record<string, unknown>>(
      `select name, flight_date, flight_no, needs, receipt_no, status, purged_at, categories, route
       from registrations where id = $1`,
      [registration.id],
    );
    expect(row).toMatchObject({
      name: null,
      flight_date: null,
      flight_no: null,
      needs: [],
      receipt_no: null,
      status: "expired",
      categories: ["cat_senior"],
      route: "web",
    });
    expect(row.purged_at).toEqual(kst("2026-10-05 15:00"));

    // 패스는 일회용이다. 출발 후에는 끝난 패스가 되어 다시 열리지 않는다.
    expect(await resolveToken(db, pass.token)).toEqual({ kind: "unusable" });
    const [p] = await db.query<{ state: string; registration_id: string | null }>(
      "select state, registration_id from passes where token = $1",
      [pass.token],
    );
    expect(p).toEqual({ state: "expired", registration_id: null });
  });

  it("지연되면 변경된 출발 시각을 따른다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30", { estAt: kst("2026-10-05 16:30") }));
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 16:59"));
    expect(await statusOf(db, registration.id)).toBe("active");
    await purge(db, kst("2026-10-05 17:00"));
    expect(await statusOf(db, registration.id)).toBe("expired");
  });

  it("상태가 출발이면 시각과 무관하게 지운다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30", { status: "출발" }));
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 12:10"));
    expect(await statusOf(db, registration.id)).toBe("expired");
  });

  it("결항은 다음 날 04시에 지운다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30", { status: "결항" }));
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 23:59"));
    expect(await statusOf(db, registration.id)).toBe("active");
    await purge(db, kst("2026-10-06 04:00"));
    expect(await statusOf(db, registration.id)).toBe("expired");
  });

  it("공동운항은 실제 운항 편의 시각으로 판정한다", async () => {
    const db = await setup(
      flightRow("OP1", "2026-10-05 14:30", { estAt: kst("2026-10-05 16:30") }),
      flightRow("CS1", "2026-10-05 14:30", { masterNo: "OP1", gate: null }),
    );
    const { registration } = await registerWithPass(db, t0, { flightNo: "CS1" });
    await purge(db, kst("2026-10-05 15:30"));
    expect(await statusOf(db, registration.id)).toBe("active");
    await purge(db, kst("2026-10-05 17:00"));
    expect(await statusOf(db, registration.id)).toBe("expired");
  });

  it("아무리 지연돼도 예정 출발 24시간 뒤에는 지운다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30", { estAt: kst("2026-10-07 09:00") }));
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-06 14:29"));
    expect(await statusOf(db, registration.id)).toBe("active");
    await purge(db, kst("2026-10-06 14:30"));
    expect(await statusOf(db, registration.id)).toBe("expired");
  });

  it("운항 정보가 사라진 등록은 48시간 뒤에 지운다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30"));
    const { registration } = await registerWithPass(db, t0);
    await db.query("delete from flights");
    await purge(db, kst("2026-10-07 11:59"));
    expect(await statusOf(db, registration.id)).toBe("active");
    await purge(db, kst("2026-10-07 12:00"));
    expect(await statusOf(db, registration.id)).toBe("expired");
  });

  it("두 번 돌려도 두 번째는 할 일이 없다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30"));
    await registerWithPass(db, t0);
    const at = kst("2026-10-05 15:00");
    expect((await purge(db, at)).purged).toBe(1);
    expect((await purge(db, at)).purged).toBe(0);
  });
});

describe("삭제 뒤에 남는 것", () => {
  it("응대 기록에는 지원 종류와 탑승구 위치 구분만 남는다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30", { gate: 101 }));
    const { registration } = await registerWithPass(db, t0, {
      needs: ["mov_no_stairs", "mov_escort", "com_slow"],
      categories: ["cat_senior", "cat_disability"],
    });
    const e = await recordScan(db, registration.id, "cc-end", kst("2026-10-05 13:00"));
    await startEncounter(db, e.id, "cc-end", kst("2026-10-05 13:01"));
    await endEncounter(db, e.id, "cc-end", kst("2026-10-05 13:06"));
    await logAccess(db, { at: t0, zoneId: "cc-end", action: "scan_view", registrationId: registration.id });

    await purge(db, kst("2026-10-05 15:00"));

    const [row] = await db.query<Record<string, unknown>>(
      "select registration_id, zone_id, support_groups, gate_band, categories, started_at, ended_at from encounters",
    );
    expect(row).toMatchObject({
      registration_id: null,
      zone_id: "cc-end",
      support_groups: ["이동", "감각·소통"],
      gate_band: "끝단",
      categories: ["cat_senior", "cat_disability"],
    });
    expect(row.started_at).toEqual(kst("2026-10-05 13:01"));
    expect(row.ended_at).toEqual(kst("2026-10-05 13:06"));

    const [log] = await db.query<{ registration_id: string | null }>("select registration_id from access_logs");
    expect(log.registration_id).toBeNull();
  });

  it("재발급으로 폐기된 패스는 폐기 상태로 남는다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30"));
    const { registration, pass: oldPass } = await registerWithPass(db, t0);
    const [newPass] = await generatePasses(db, 1);
    await reissue(db, registration.id, newPass.token, t0);

    await purge(db, kst("2026-10-05 15:00"));
    expect(await resolveToken(db, oldPass.token)).toEqual({ kind: "unusable" });
    expect(await resolveToken(db, newPass.token)).toEqual({ kind: "unusable" });
    const states = await db.query<{ state: string }>("select state from passes order by state");
    expect(states.map((s) => s.state)).toEqual(["expired", "revoked"]);
    const rows = await db.query("select 1 from passes where registration_id is not null");
    expect(rows).toHaveLength(0);
  });

  it("끝난 패스는 다른 여객에게 다시 연결할 수 없다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30"), flightRow("KE999", "2026-10-05 20:00"));
    const { pass } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 15:00"));

    const next = await register(db, kst("2026-10-05 15:10"), { flightNo: "KE999", name: "다음 여객" });
    expect(await linkPass(db, pass.token, next.id, kst("2026-10-05 15:11"))).toEqual({
      ok: false,
      error: "pass_revoked",
    });
    expect(await idleTokenByPassNo(db, pass.passNo)).toBeNull();
  });

  it("끝난 패스의 번호는 새 패스가 다시 쓸 수 있다. 살아 있는 패스의 번호는 못 쓴다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-05 14:30"));
    const { pass } = await registerWithPass(db, t0);
    const [idle] = await generatePasses(db, 1);
    await purge(db, kst("2026-10-05 15:00"));

    const insert = "insert into passes (token, pass_no) values ($1, $2)";
    await expect(db.query(insert, ["a".repeat(24), pass.passNo])).resolves.toBeDefined();
    await expect(db.query(insert, ["b".repeat(24), idle.passNo])).rejects.toThrow();
    expect(await idleTokenByPassNo(db, pass.passNo)).toBe("a".repeat(24));
  });
});

describe("그 밖의 정리", () => {
  it("패스를 받아 가지 않은 등록은 24시간 뒤에 지운다", async () => {
    const db = await setup(flightRow("KE123", "2026-10-06 14:30"));
    const reg = await register(db, t0, { flightDate: "2026-10-06" });
    expect((await purge(db, kst("2026-10-06 11:59"))).unlinkedPurged).toBe(0);
    expect((await purge(db, kst("2026-10-06 12:00"))).unlinkedPurged).toBe(1);
    const [row] = await db.query<{ name: string | null; status: string }>(
      "select name, status from registrations where id = $1",
      [reg.id],
    );
    expect(row).toEqual({ name: null, status: "expired" });
  });

  it("90일 지난 조회 기록과 3일 지난 운항 정보를 지운다", async () => {
    const db = await setup(flightRow("OLD1", "2026-10-01 10:00"), flightRow("NEW1", "2026-10-05 10:00"));
    await logAccess(db, { at: kst("2026-07-01 10:00"), action: "login_fail", deviceKey: "d" });
    await logAccess(db, { at: kst("2026-10-01 10:00"), action: "login_fail", deviceKey: "d" });

    const res = await purge(db, kst("2026-10-05 12:00"));
    expect(res.logsDeleted).toBe(1);
    expect(await db.query("select 1 from access_logs")).toHaveLength(1);
    const flights = await db.query<{ flight_no: string }>("select flight_no from flights");
    expect(flights.map((f) => f.flight_no)).toEqual(["NEW1"]);
  });
});
