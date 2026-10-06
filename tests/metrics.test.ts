import { describe, expect, it } from "vitest";
import { endEncounter, recordScan, startEncounter } from "@/lib/encounters";
import { recordPoll } from "@/lib/flights/ingest";
import { summaryHandler } from "@/lib/api/desk";
import { collectMetrics, todaySummary } from "@/lib/metrics";
import { purge } from "@/lib/purge";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, register, registerWithPass } from "./helpers/fixtures";

describe("측정값 내려받기", () => {
  it("작성 시간, 연결까지 걸린 시간, 응대 시간을 계산하고 사람을 알 수 있는 값은 내보내지 않는다", async () => {
    const db = await createTestDb();
    await seedZones(db, () => "x:y");
    const t0 = kst("2026-10-05 12:00");
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 101 })], t0);

    // 11:58 에 화면을 열어 12:00 에 제출 → 작성 120초. 12:03 에 패스 연결 → 180초.
    const waiting = await register(db, t0, { route: "paper", editCount: 2 });
    const { registration } = await registerWithPass(db, t0);
    await db.query("update registrations set linked_at = $2 where id = $1", [registration.id, kst("2026-10-05 12:03")]);

    const e = await recordScan(db, registration.id, "cc-end", kst("2026-10-05 13:00"));
    await startEncounter(db, e.id, "cc-end", new Date(kst("2026-10-05 13:00").getTime() + 20_000));
    await endEncounter(db, e.id, "cc-end", new Date(kst("2026-10-05 13:00").getTime() + 200_000));
    await recordPoll(db, { at: t0, ok: true, rowCount: 2000, durationMs: 14000, gateChanges: 3 });
    await recordPoll(db, { at: t0, ok: false, rowCount: 0, durationMs: 60000, gateChanges: 0, error: "x" });

    await purge(db, kst("2026-10-05 15:00"));
    const m = await collectMetrics(db, kst("2026-10-05 00:00"));

    expect(m.registrations).toHaveLength(2);
    expect(m.registrations.find((r) => r.route === "paper")).toMatchObject({
      hourKst: 12,
      writeSec: 120,
      editCount: 2,
      linkWaitSec: null,
      status: "pending",
      isMock: true,
    });
    expect(m.registrations.find((r) => r.route === "web")).toMatchObject({ linkWaitSec: 180, status: "expired" });
    expect(m.encounters).toEqual([
      {
        zoneId: "cc-end",
        gateBand: "끝단",
        hourKst: 13,
        scanToStartSec: 20,
        serviceSec: 180,
        supportGroups: ["이동", "감각·소통"],
        completed: true,
      },
    ]);
    expect(m.polls).toMatchObject({ total: 2, failed: 1, avgDurationMs: 14000, gateChanges: 3 });

    const dump = JSON.stringify(m);
    expect(dump).not.toContain("홍길동");
    expect(dump).not.toContain("KE123");
    expect(dump).not.toContain(waiting.receiptNo!);
    expect(dump).not.toContain("mov_no_stairs");
  });
});

describe("오늘 현황", () => {
  it("오늘 받은 등록과 응대를 세고 가운데값을 낸다. 어제 것은 세지 않는다", async () => {
    const db = await createTestDb();
    await seedZones(db, () => "x:y");
    const t0 = kst("2026-10-05 12:00");
    await addFlights(db, [flightRow("KE123", "2026-10-05 18:30", { gate: 101 })], t0);

    // 어제 등록은 오늘 건수에 들어가지 않는다.
    await register(db, kst("2026-10-04 23:50"), { startedAt: kst("2026-10-04 23:49") });
    await register(db, t0, { route: "paper" }); // 작성 120초, 패스 대기 중
    const a = await registerWithPass(db, t0, { route: "assisted", startedAt: kst("2026-10-05 11:59") }); // 작성 60초
    await db.query("update registrations set linked_at = $2 where id = $1", [a.registration.id, kst("2026-10-05 12:04")]);

    // 두 구역이 이어서 응대한다.
    const at = (m: number, sec = 0) => new Date(kst("2026-10-05 13:00").getTime() + m * 60_000 + sec * 1000);
    const e1 = await recordScan(db, a.registration.id, "cc-end", at(0));
    await startEncounter(db, e1.id, "cc-end", at(0, 30));
    await endEncounter(db, e1.id, "cc-end", at(5, 30));
    const e2 = await recordScan(db, a.registration.id, "cc-mid", at(10));
    await startEncounter(db, e2.id, "cc-mid", at(10, 10));

    const s = await todaySummary(db, kst("2026-10-05 14:00"));
    expect(s).toEqual({
      date: "2026-10-05",
      registered: 2,
      byRoute: { web: 0, assisted: 1, paper: 1 },
      linked: 1,
      waiting: 2, // 어제 등록도 아직 패스를 기다린다
      active: 1,
      medianWriteSec: 90,
      medianLinkWaitSec: 240,
      scans: 2,
      completed: 1,
      medianScanToStartSec: 20,
      medianServiceSec: 300,
      handoffs: 1,
    });
  });

  it("아무것도 없으면 0 과 빈 값", async () => {
    const db = await createTestDb();
    const s = await todaySummary(db, kst("2026-10-05 14:00"));
    expect(s).toMatchObject({ registered: 0, scans: 0, handoffs: 0, medianWriteSec: null, medianServiceSec: null });
  });

  it("안내데스크만 볼 수 있고 이름이나 편명은 담기지 않는다", async () => {
    const db = await createTestDb();
    await seedZones(db, () => "x:y");
    const now = kst("2026-10-05 12:00");
    await addFlights(db, [flightRow("KE123", "2026-10-05 18:30")], now);
    await registerWithPass(db, now, { name: "비밀이름" });
    const base = { canSwitch: false, needsZone: false, exp: now.getTime() + 3_600_000 };
    expect((await summaryHandler(db, null, now)).status).toBe(401);
    expect((await summaryHandler(db, { zoneId: "cc-end", isDesk: false, ...base }, now)).status).toBe(403);
    const res = await summaryHandler(db, { zoneId: "desk-t1", isDesk: true, ...base }, now);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/비밀이름|KE123/);
  });
});
