import { describe, expect, it } from "vitest";
import { caseHandler, listHandler, resolveHandler } from "@/lib/api/staff";
import type { Session } from "@/lib/auth";
import { seedDemo } from "@/lib/demo";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";

const now = kst("2026-10-08 13:00");
const staff: Session = { zoneId: "cc-end", isDesk: false, canSwitch: false, needsZone: false, exp: now.getTime() + 3_600_000 };

describe("시연용 여객", () => {
  it("넣은 패스의 주소를 찍으면 여객 카드가 열린다", async () => {
    const db = await createTestDb();
    await seedZones(db, () => "x:y");
    const res = await seedDemo(db, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.passes).toHaveLength(9);
    const first = res.passes[0];
    expect(first.url).toMatch(/\/p\/[A-Za-z0-9_-]{24}$/);
    const found = await resolveHandler(db, staff, { scanned: first.url }, "d", now);
    expect(found.body.kind).toBe("active");
    const card = await caseHandler(db, staff, found.body.registrationId as string, now);
    expect(card.body.case).toMatchObject({ name: first.name, flightNo: first.flightNo });
    // 가장 이른 편도 두 시간쯤 뒤에 떠난다. 금방 사라지지 않는다.
    const list = await listHandler(db, staff, "all", "d", new Date(now.getTime() + 100 * 60_000));
    const shown = (list.body.assigned as unknown[]).length + (list.body.gateUnknown as unknown[]).length + (list.body.others as unknown[]).length;
    expect(shown).toBe(9);
  });

  it("다시 넣으면 앞서 넣은 여객은 지워지고 그 패스는 열리지 않는다", async () => {
    const db = await createTestDb();
    await seedZones(db, () => "x:y");
    const a = await seedDemo(db, now);
    const b = await seedDemo(db, new Date(now.getTime() + 60_000));
    if (!a.ok || !b.ok) throw new Error("실패");
    expect((await resolveHandler(db, staff, { scanned: a.passes[0].url }, "d", now)).body.kind).toBe("unusable");
    expect((await resolveHandler(db, staff, { scanned: b.passes[0].url }, "d", now)).body.kind).toBe("active");
    expect(await db.query("select 1 from registrations where status = 'active'")).toHaveLength(9);
  });
});
