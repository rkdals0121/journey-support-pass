import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveHandler } from "@/lib/api/kiosk";
import { guideHandler } from "@/lib/api/public";
import { validateChoices } from "@/lib/catalog";
import type { Db } from "@/lib/db";
import { DEMO, seedDemo } from "@/lib/demo";
import { lastSuccessfulPoll, recordPoll } from "@/lib/flights/ingest";
import type { GuideDto } from "@/lib/guide";
import { pollMetrics } from "@/lib/metrics";
import { extractToken } from "@/lib/passes";
import { mockFlights } from "@/lib/setup";
import { pollState } from "@/lib/timing";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, hasKey, kioskSession, registerWithPass } from "./helpers/fixtures";

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

  it("다시 넣으면 시험 삼아 등록한 모의 편(MQ·MZ 포함)의 등록도 지우고, 실제 편의 등록은 그대로 둔다", async () => {
    const a = await seedDemo(db, now);
    if (!a.ok) throw new Error(a.error);
    // 시연 준비 중에 휴대전화로 오사카/간사이 모의 편(모의저비용항공 MQ702)을 골라 등록했다.
    const [mq] = await db.query<{ flight_date: string }>("select flight_date::text as flight_date from flights where flight_no = 'MQ702'");
    const tester = await registerWithPass(db, now, { flightNo: "MQ702", flightDate: mq.flight_date, startedAt: now });
    // 같은 때 실제 편으로 등록한 여객.
    await addFlights(db, [flightRow("KE123", "2026-10-08 18:00")], now);
    const real = await registerWithPass(db, now, { flightNo: "KE123", flightDate: "2026-10-08", startedAt: now });

    await seedDemo(db, new Date(now.getTime() + 60_000));
    const status = async (id: string) =>
      (await db.query<{ status: string }>("select status from registrations where id = $1", [id]))[0].status;
    expect(await status(tester.registration.id)).toBe("revoked");
    expect(await status(real.registration.id)).toBe("active");
  });
});

describe("시연용 패스와 운항 정보 기준 시각", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("실제 수집이 멈춘 동안 시연용 패스를 넣어도 '운항 정보가 늦어지고 있습니다'를 가리지 않는다", async () => {
    await db.exec("truncate table flight_polls restart identity");
    // 실제 수집은 09:07 이 마지막 성공이고, 그 뒤로는 실패하고 있다.
    await recordPoll(db, { at: kst("2026-10-08 09:07"), ok: true, rowCount: 2000, durationMs: 9000, gateChanges: 0 });
    await recordPoll(db, { at: kst("2026-10-08 10:07"), ok: false, rowCount: 0, durationMs: 9000, gateChanges: 0, error: "timeout" });
    await seedDemo(db, now);
    expect(await lastSuccessfulPoll(db)).toEqual(kst("2026-10-08 09:07"));
    expect(pollState(await lastSuccessfulPoll(db), now).stale).toBe(true);
    // 수집 현황에도 넣은 기록은 수집으로 세지 않는다.
    expect(await pollMetrics(db, kst("2026-10-08 00:00"))).toMatchObject({ total: 2, failed: 1, lastAt: kst("2026-10-08 10:07") });
  });

  it("실제 수집이 한 번도 없으면(운항 정보 키 없는 개발 환경) 모의 운항을 넣은 시각을 기준으로 쓴다", async () => {
    vi.stubEnv("ICN_API_KEY", "");
    await db.exec("truncate table flight_polls restart identity");
    await seedDemo(db, now);
    expect(await lastSuccessfulPoll(db)).toEqual(now);
    expect(pollState(await lastSuccessfulPoll(db), now).stale).toBe(false);
  });

  it("운항 정보 키가 있는데 수집이 한 번도 성공하지 못했으면 모의 운항을 넣은 시각으로 가리지 않는다", async () => {
    // 새로 받은 키가 아직 쓰이지 않거나, 키를 잘못 넣었다. 수집은 계속 실패하고 있다.
    vi.stubEnv("ICN_API_KEY", "not-yet-active");
    await db.exec("truncate table flight_polls restart identity");
    await recordPoll(db, { at: kst("2026-10-08 12:07"), ok: false, rowCount: 0, durationMs: 900, gateChanges: 0, error: "SERVICE KEY IS NOT REGISTERED" });
    await seedDemo(db, now);
    expect(await lastSuccessfulPoll(db)).toBeNull();
    expect(pollState(await lastSuccessfulPoll(db), now).stale).toBe(true);
  });
});
