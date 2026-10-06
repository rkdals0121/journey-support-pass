import { describe, expect, it } from "vitest";
import { endEncounter, recordScan, startEncounter } from "@/lib/encounters";
import { recordPoll } from "@/lib/flights/ingest";
import { collectMetrics } from "@/lib/metrics";
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
