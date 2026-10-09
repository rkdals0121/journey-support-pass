import { beforeAll, describe, expect, it } from "vitest";
import { resolveHandler } from "@/lib/api/kiosk";
import { guideHandler } from "@/lib/api/public";
import { validateChoices } from "@/lib/catalog";
import type { Db } from "@/lib/db";
import { DEMO, seedDemo } from "@/lib/demo";
import type { GuideDto } from "@/lib/guide";
import { extractToken } from "@/lib/passes";
import { mockFlights } from "@/lib/setup";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { hasKey, kioskSession } from "./helpers/fixtures";

const now = kst("2026-10-08 13:00");
const kiosk = kioskSession(now, "cc-train");

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});

describe("시연용 장면", () => {
  it("이름이 없다. 장면 이름, 편명, 고른 항목뿐이다", () => {
    for (const d of DEMO) {
      expect(Object.keys(d).filter((k) => !["scene", "flightNo", "lang", "choices"].includes(k)), d.scene).toEqual([]);
    }
    expect(hasKey(DEMO, "name")).toBe(false);
  });

  it("고른 항목은 모두 등록할 수 있는 값이고, 편은 모의 운항에 있다", () => {
    const flights = mockFlights(now).map((f) => f.flightNo);
    for (const d of DEMO) {
      expect(validateChoices(d.choices), d.scene).toBeNull();
      expect(flights, d.scene).toContain(d.flightNo);
    }
  });

  it("장면 이름이 서로 다르다. 시연하는 사람이 QR 을 고를 때 구분한다", () => {
    expect(new Set(DEMO.map((d) => d.scene)).size).toBe(DEMO.length);
  });
});

describe("시연용 패스", () => {
  it("장면마다 패스를 하나씩 만들고 장면 이름, 편명, 번호, QR 주소만 돌려준다", async () => {
    const res = await seedDemo(db, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.passes).toHaveLength(DEMO.length);
    expect(res.passes.map((p) => [p.scene, p.flightNo])).toEqual(DEMO.map((d) => [d.scene, d.flightNo]));
    for (const p of res.passes) {
      expect(Object.keys(p).sort()).toEqual(["flightNo", "passNo", "scene", "url"]);
      expect(p.passNo).toMatch(/^\d{6}$/);
      expect(p.url).toMatch(/\/P\/[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(p.url).toBe(p.url.toUpperCase());
    }
    expect(new Set(res.passes.map((p) => p.passNo)).size).toBe(DEMO.length);

    // 등록에는 이름이 없고, 장면 이름은 어디에도 저장하지 않는다.
    const rows = await db.query<{ name: string | null; route: string; is_mock: boolean }>(
      "select name, route, is_mock from registrations where status = 'active'",
    );
    expect(rows).toHaveLength(DEMO.length);
    for (const r of rows) expect(r).toEqual({ name: null, route: "web", is_mock: true });
    const dump = JSON.stringify(await db.query("select * from registrations"));
    for (const d of DEMO) expect(dump).not.toContain(d.scene);
  });

  it("넣은 패스의 주소를 키오스크에 찍으면 그 장면의 안내가 열린다", async () => {
    const res = await seedDemo(db, now);
    if (!res.ok) throw new Error(res.error);

    for (const [i, d] of DEMO.entries()) {
      const found = await resolveHandler(db, kiosk, { scanned: res.passes[i].url }, "d", now);
      expect(found.status, d.scene).toBe(200);
      const guide = found.body.guide as GuideDto;
      expect(guide.passNo, d.scene).toBe(res.passes[i].passNo);
      expect(guide.lang, d.scene).toBe(d.lang ?? "ko");
      expect([...guide.choices].sort(), d.scene).toEqual([...d.choices].sort());
      expect(guide.flight.flightNo, d.scene).toBe(d.flightNo);
    }
  });

  it("제안서의 예시 장면: 휠체어 여객이 탑승동 지하 1층 키오스크에 찍으면 엘리베이터와 127번 탑승구 길이 나온다", async () => {
    const res = await seedDemo(db, now);
    if (!res.ok) throw new Error(res.error);
    const found = await resolveHandler(db, kiosk, { scanned: res.passes[0].url }, "d", now);
    const guide = found.body.guide as GuideDto;

    expect(guide.flight).toMatchObject({ flightNo: "MK127", area: "CONCOURSE", gate: 127, close: "open" });
    expect(guide.routeNote).toBeNull();
    expect(guide.gateRoute?.steps.map((s) => s.kind)).toEqual(["elevator", "walk"]);
    expect(guide.gateRoute?.steps[1]).toMatchObject({
      towardGate: 127,
      along: [{ kind: "restroom", nearGate: 123, meters: 195 }],
    });
    expect(guide.gateRoute?.stepFree).toBe(true);
    expect(guide.pace).toBe("ok");
    // 고른 장애인 화장실이 가까운 시설의 맨 앞에 온다.
    expect(guide.facilities[0]).toMatchObject({ kind: "restroom", chosen: true });
  });

  it("공동운항 장면은 실제 운항 편의 탑승구로 안내한다", async () => {
    const res = await seedDemo(db, now);
    if (!res.ok) throw new Error(res.error);
    const i = DEMO.findIndex((d) => d.flightNo === "MC830");
    const guide = (await resolveHandler(db, kiosk, { scanned: res.passes[i].url }, "d", now)).body.guide as GuideDto;
    expect(guide.flight).toMatchObject({ flightNo: "MC830", operatingNo: "MK300", gate: 104 });
    // 휠체어가 필요하다고 한 여객이다. 빌리는 곳이 맨 앞이다.
    expect(guide.facilities[0]).toMatchObject({ kind: "wheelchair", chosen: true });
  });

  it("가장 이른 편도 두 시간 넘게 뒤에 떠난다. 시연 도중에 패스가 끝나지 않는다", async () => {
    const res = await seedDemo(db, now);
    if (!res.ok) throw new Error(res.error);
    const later = new Date(now.getTime() + 120 * 60_000);
    for (const p of res.passes) {
      expect((await guideHandler(db, extractToken(p.url)!, null, later)).status, p.scene).toBe(200);
    }
  });

  it("다시 넣으면 앞서 넣은 여객은 지워지고 그 패스는 열리지 않는다", async () => {
    const a = await seedDemo(db, now);
    const b = await seedDemo(db, new Date(now.getTime() + 60_000));
    if (!a.ok || !b.ok) throw new Error("실패");
    expect((await resolveHandler(db, kiosk, { scanned: a.passes[0].url }, "d", now)).status).toBe(410);
    expect((await resolveHandler(db, kiosk, { scanned: b.passes[0].url }, "d", now)).status).toBe(200);
    expect(await db.query("select 1 from registrations where status = 'active'")).toHaveLength(DEMO.length);
    expect(await db.query("select 1 from passes where state = 'active'")).toHaveLength(DEMO.length);
    // 여객이 지워 달라고 한 것과 같은 방식으로 끝낸다.
    expect(await db.query("select 1 from registrations where status = 'expired'")).toHaveLength(0);
  });
});
