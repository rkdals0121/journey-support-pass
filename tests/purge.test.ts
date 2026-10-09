import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { guideHandler, lookupPass } from "@/lib/api/public";
import { resolveHandler } from "@/lib/api/kiosk";
import { logAccess } from "@/lib/auth";
import { acceptCall, createCall, getCallAt } from "@/lib/calls";
import type { Db } from "@/lib/db";
import { recordPoll } from "@/lib/flights/ingest";
import { getJourney, isJourneyOver } from "@/lib/journey";
import { logEvent } from "@/lib/metrics";
import { resolvePassNo, resolveToken } from "@/lib/passes";
import { eraseRegistration, purge } from "@/lib/purge";
import { getRegistration } from "@/lib/registrations";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, CHOICES, flightRow, kioskSession, register, registerWithPass, resetData } from "./helpers/fixtures";

const t0 = kst("2026-10-05 12:00");

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await resetData(db);
});

const statusOf = async (id: string) => (await getRegistration(db, id))?.status;

describe("출발 후 삭제", () => {
  it("출발 30분 뒤에 지운다. 항공편과 고른 항목이 사라지고 경로와 시각만 남는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 101 })], t0);
    const { registration, pass } = await registerWithPass(db, t0, { lang: "en", route: "kiosk" });

    expect((await purge(db, kst("2026-10-05 14:59"))).purged).toBe(0);
    expect(await statusOf(registration.id)).toBe("active");

    expect((await purge(db, kst("2026-10-05 15:00"))).purged).toBe(1);
    const [row] = await db.query<Record<string, unknown>>(
      `select name, flight_date, flight_no, needs, categories, lang, receipt_no, status, purged_at, route, submitted_at
       from registrations where id = $1`,
      [registration.id],
    );
    expect(row).toEqual({
      name: null,
      flight_date: null,
      flight_no: null,
      needs: [],
      categories: [],
      lang: "ko", // 고른 언어도 지운다. 영어로 등록했어도 처음 값으로 돌아간다.
      receipt_no: null,
      status: "expired",
      purged_at: kst("2026-10-05 15:00"),
      route: "kiosk",
      submitted_at: t0,
    });

    // 패스는 일회용이다. 출발 후에는 끝난 패스가 되어 다시 열리지 않는다.
    expect(await resolveToken(db, pass.token)).toEqual({ kind: "unusable" });
    expect(await resolvePassNo(db, pass.passNo)).toEqual({ kind: "unknown" });
    const [p] = await db.query<{ state: string; registration_id: string | null; linked_at: Date | null }>(
      "select state, registration_id, linked_at from passes where token = $1",
      [pass.token],
    );
    expect(p).toEqual({ state: "expired", registration_id: null, linked_at: null });
  });

  it("지워진 등록의 행 어디에도 편명과 고른 항목이 남지 않는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 15:00"));
    const dump = JSON.stringify(await db.query("select * from registrations"));
    expect(dump).not.toContain("KE123");
    for (const c of CHOICES) expect(dump).not.toContain(c);
  });

  it("지연되면 변경된 출발 시각을 따른다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { estAt: kst("2026-10-05 16:30") })], t0);
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 16:59"));
    expect(await statusOf(registration.id)).toBe("active");
    await purge(db, kst("2026-10-05 17:00"));
    expect(await statusOf(registration.id)).toBe("expired");
  });

  it("상태가 출발이면 시각과 무관하게 지운다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0);
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { status: "출발" })], kst("2026-10-05 12:05"));
    await purge(db, kst("2026-10-05 12:10"));
    expect(await statusOf(registration.id)).toBe("expired");
  });

  it("결항은 다음 날 04시에 지운다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { status: "결항" })], t0);
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-06 03:59"));
    expect(await statusOf(registration.id)).toBe("active");
    await purge(db, kst("2026-10-06 04:00"));
    expect(await statusOf(registration.id)).toBe("expired");
  });

  it("공동운항은 실제 운항 편의 시각으로 판정한다", async () => {
    await addFlights(
      db,
      [
        flightRow("OP1", "2026-10-05 14:30", { estAt: kst("2026-10-05 16:30") }),
        flightRow("CS1", "2026-10-05 14:30", { masterNo: "OP1", gate: null }),
      ],
      t0,
    );
    const { registration } = await registerWithPass(db, t0, { flightNo: "CS1" });
    await purge(db, kst("2026-10-05 15:30"));
    expect(await statusOf(registration.id)).toBe("active");
    await purge(db, kst("2026-10-05 17:00"));
    expect(await statusOf(registration.id)).toBe("expired");
  });

  it("아무리 지연돼도 예정 출발 24시간 뒤에는 지운다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { estAt: kst("2026-10-07 09:00") })], t0);
    const { registration } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-06 14:29"));
    expect(await statusOf(registration.id)).toBe("active");
    await purge(db, kst("2026-10-06 14:30"));
    expect(await statusOf(registration.id)).toBe("expired");
  });

  it("운항 정보가 사라진 등록은 48시간 뒤에 지운다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0);
    await db.query("delete from flights");
    await purge(db, kst("2026-10-07 11:59"));
    expect(await statusOf(registration.id)).toBe("active");
    await purge(db, kst("2026-10-07 12:00"));
    expect(await statusOf(registration.id)).toBe("expired");
  });

  it("두 번 돌려도 두 번째는 할 일이 없다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    await registerWithPass(db, t0);
    const at = kst("2026-10-05 15:00");
    expect((await purge(db, at)).purged).toBe(1);
    expect(await purge(db, at)).toEqual({ purged: 0, unlinkedPurged: 0, logsDeleted: 0 });
  });

  it("아직 떠나지 않은 편의 여객은 건드리지 않는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30"), flightRow("KE999", "2026-10-05 20:00")], t0);
    const gone = await registerWithPass(db, t0);
    const staying = await registerWithPass(db, t0, { flightNo: "KE999" });
    expect((await purge(db, kst("2026-10-05 15:00"))).purged).toBe(1);
    expect(await statusOf(gone.registration.id)).toBe("expired");
    expect(await statusOf(staying.registration.id)).toBe("active");
    expect(await resolveToken(db, staying.pass.token)).toMatchObject({ kind: "active" });
    expect((await getJourney(db, staying.registration.id, kst("2026-10-05 15:00")))?.choices).toEqual(CHOICES);
  });
});

describe("삭제 작업이 돌기 전", () => {
  // 삭제 작업이 늦게 돌아도 떠난 여객의 정보는 화면에 나오지 않아야 한다.
  it("떠난 편의 패스는 지워지기 전이라도 열리지 않는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 127 })], t0);
    const { registration, pass } = await registerWithPass(db, t0);
    const kiosk = kioskSession(t0, "cc-center");

    const before = kst("2026-10-05 14:59");
    expect((await lookupPass(db, pass.token, before)).kind).toBe("ok");
    expect((await guideHandler(db, pass.token, null, before)).status).toBe(200);

    const after = kst("2026-10-05 15:00");
    expect(isJourneyOver((await getJourney(db, registration.id, after))!, after)).toBe(true);
    expect(await lookupPass(db, pass.token, after)).toEqual({ kind: "ended" });
    expect((await guideHandler(db, pass.token, null, after)).status).toBe(410);
    expect((await guideHandler(db, pass.token, kiosk, after)).status).toBe(410);
    expect((await resolveHandler(db, kiosk, { scanned: pass.token }, "d", after)).status).toBe(410);
    // 번호로 열면 없는 번호와 똑같이 답한다. 끝난 패스가 있었는지 번호로는 알려 주지 않는다.
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, "d", after)).status).toBe(404);
    expect(await db.query("select 1 from access_logs where action = 'number_fail'")).toHaveLength(0);

    // DB 에는 아직 그대로 있다. 삭제 작업이 돌지 않았다.
    expect(await statusOf(registration.id)).toBe("active");
    expect(await resolveToken(db, pass.token)).toMatchObject({ kind: "active" });
  });

  it("상태가 출발로 바뀌면 그 순간부터 열리지 않는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { pass } = await registerWithPass(db, t0);
    const at = kst("2026-10-05 12:30");
    expect((await lookupPass(db, pass.token, at)).kind).toBe("ok");
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { status: "출발" })], at);
    expect(await lookupPass(db, pass.token, at)).toEqual({ kind: "ended" });
  });

  it("탑승이 마감되어도 출발 30분 뒤까지는 열린다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { status: "탑승마감" })], t0);
    const { pass } = await registerWithPass(db, t0);
    expect((await lookupPass(db, pass.token, kst("2026-10-05 14:45"))).kind).toBe("ok");
  });
});

describe("삭제 뒤에 남는 것", () => {
  it("직원 호출은 닫히고 등록과의 연결이 끊긴다. 부른 자리와 시각은 남는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0);
    const open = await createCall(db, "cc-108", registration.id, "guide", kst("2026-10-05 14:40"));
    await acceptCall(db, open!.id, "cc-mid", kst("2026-10-05 14:41"));

    const at = kst("2026-10-05 15:00");
    await purge(db, at);

    expect(await getCallAt(db, open!.id, "cc-108")).toMatchObject({
      registrationId: null,
      state: "cancelled",
      endedAt: at,
      placeId: "cc-108",
      zoneId: "cc-mid",
      createdAt: kst("2026-10-05 14:40"),
      acceptedZone: "cc-mid",
    });
    expect(await db.query("select 1 from calls where registration_id is not null")).toHaveLength(0);
  });

  it("조회 기록에서도 등록과의 연결이 끊긴다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0);
    await logAccess(db, { at: t0, zoneId: "desk-t1", deviceKey: "d", action: "register", registrationId: registration.id });

    await purge(db, kst("2026-10-05 15:00"));

    const logs = await db.query<{ registration_id: string | null; zone_id: string; action: string }>(
      "select registration_id, zone_id, action from access_logs",
    );
    expect(logs).toEqual([{ registration_id: null, zone_id: "desk-t1", action: "register" }]);
  });

  it("어느 표에도 지워진 등록의 id 가 남지 않는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0);
    await createCall(db, "cc-108", registration.id, "guide", kst("2026-10-05 14:40"));
    await logAccess(db, { at: t0, action: "register", registrationId: registration.id });
    await purge(db, kst("2026-10-05 15:00"));

    for (const table of ["passes", "calls", "access_logs", "events"]) {
      expect(JSON.stringify(await db.query(`select * from ${table}`)), table).not.toContain(registration.id);
    }
  });

  it("여객이 지워 달라고 한 것은 revoked, 출발해서 지워진 것은 expired 로 남는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const asked = await registerWithPass(db, t0);
    const left = await registerWithPass(db, t0);
    await eraseRegistration(db, asked.registration.id, kst("2026-10-05 12:30"), "revoked");
    await purge(db, kst("2026-10-05 15:00"));

    expect(await statusOf(asked.registration.id)).toBe("revoked");
    expect(await statusOf(left.registration.id)).toBe("expired");
    const passes = await db.query<{ token: string; state: string }>("select token, state from passes");
    expect(passes.find((p) => p.token === asked.pass.token)?.state).toBe("revoked");
    expect(passes.find((p) => p.token === left.pass.token)?.state).toBe("expired");
    // 먼저 지운 등록의 지운 시각은 삭제 작업이 다시 쓰지 않는다.
    const [row] = await db.query<{ purged_at: Date }>("select purged_at from registrations where id = $1", [
      asked.registration.id,
    ]);
    expect(row.purged_at).toEqual(kst("2026-10-05 12:30"));
  });

  it("끝난 패스의 번호는 새 패스가 다시 쓸 수 있다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30"), flightRow("KE999", "2026-10-05 20:00")], t0);
    const { pass } = await registerWithPass(db, t0);
    await purge(db, kst("2026-10-05 15:00"));

    const next = await register(db, kst("2026-10-05 15:10"), { flightNo: "KE999" });
    await expect(
      db.query("insert into passes (token, pass_no, registration_id, state) values ('7K2M9QXW4HT8VB3N', $1, $2, 'active')", [
        pass.passNo,
        next.id,
      ]),
    ).resolves.toBeDefined();
  });
});

describe("그 밖의 정리", () => {
  it("패스를 만들지 못한 채 남은 등록은 24시간 뒤에 지운다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-06 14:30")], t0);
    const reg = await register(db, t0, { flightDate: "2026-10-06", lang: "en" });
    expect(await purge(db, kst("2026-10-06 11:59"))).toMatchObject({ purged: 0, unlinkedPurged: 0 });
    expect(await purge(db, kst("2026-10-06 12:00"))).toMatchObject({ purged: 0, unlinkedPurged: 1 });
    const [row] = await db.query<Record<string, unknown>>(
      "select flight_no, flight_date, needs, lang, status from registrations where id = $1",
      [reg.id],
    );
    expect(row).toEqual({ flight_no: null, flight_date: null, needs: [], lang: "ko", status: "expired" });
    expect((await purge(db, kst("2026-10-06 12:00"))).unlinkedPurged).toBe(0);
  });

  it("90일 지난 조회 기록, 건수 기록, 직원 호출, 수집 기록을 지운다", async () => {
    const old = kst("2026-07-01 10:00"); // 96일 전
    const recent = kst("2026-10-01 10:00");
    for (const at of [old, recent]) {
      await logAccess(db, { at, action: "login_fail", deviceKey: "d" });
      await logEvent(db, { at, kind: "reg_start" });
      await logEvent(db, { at, kind: "survey", value: 3 });
      await recordPoll(db, { at, ok: true, rowCount: 1, durationMs: 1, gateChanges: 0 });
    }
    await db.query(
      `insert into calls (created_at, place_id, zone_id, screen, ended_at, end_kind)
       values ($1, 'cc-108', 'cc-mid', 'guide', $1, 'done'), ($2, 'cc-108', 'cc-mid', 'guide', $2, 'done')`,
      [old, recent],
    );

    const res = await purge(db, kst("2026-10-05 12:00"));
    expect(res.logsDeleted).toBe(1);

    const left = async (table: string, column: string) =>
      (await db.query<{ at: Date }>(`select ${column} as at from ${table}`)).map((r) => r.at);
    expect(await left("access_logs", "at")).toEqual([recent]);
    expect(await left("events", "at")).toEqual([recent, recent]);
    expect(await left("calls", "created_at")).toEqual([recent]);
    expect(await left("flight_polls", "polled_at")).toEqual([recent]);
  });

  it("딱 90일 된 기록은 아직 남긴다", async () => {
    const now = kst("2026-10-05 12:00");
    const edge = new Date(now.getTime() - 90 * 24 * 3_600_000);
    await logEvent(db, { at: edge, kind: "reg_start" });
    await logEvent(db, { at: new Date(edge.getTime() - 1000), kind: "reg_start" });
    await purge(db, now);
    expect((await db.query<{ at: Date }>("select at from events")).map((r) => r.at)).toEqual([edge]);
  });

  it("3일 지난 운항 정보를 지운다", async () => {
    await addFlights(db, [flightRow("OLD1", "2026-10-01 10:00"), flightRow("NEW1", "2026-10-05 10:00")], t0);
    await purge(db, kst("2026-10-05 12:00"));
    const flights = await db.query<{ flight_no: string }>("select flight_no from flights");
    expect(flights.map((f) => f.flight_no)).toEqual(["NEW1"]);
  });
});
