import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { robotStatusHandler } from "@/lib/api/kiosk";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { kioskSession, sessionOf } from "./helpers/fixtures";

let db: Db;
const noon = kst("2026-11-12 12:00");
beforeAll(async () => { db = await createTestDb(); }, 400_000);
afterAll(async () => { await db?.close?.(); });
beforeEach(async () => {
  await db.exec("truncate support_hub_rules");
  await db.query("insert into support_hub_rules(hub_id,service,open_hour,close_hour) values($1,$2,9,18)", ["t1-departure", "robot"]);
});

describe("로봇의 즉시 이용 가능 여부", () => {
  it("로그인이 없으면 가용 여부를 주지 않고 401을 반환한다", async () => {
    const res = await robotStatusHandler(db, null, noon);
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("available");
  });
  it("직원 세션은 자리가 있어도 키오스크가 아니므로 403이다", async () => {
    const res = await robotStatusHandler(db, sessionOf(noon, { placeId: "t1-info" }), noon);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("available");
  });
  it("설치 자리가 없는 키오스크도 403이다", async () => {
    expect((await robotStatusHandler(db, sessionOf(noon, { isKiosk: true }), noon)).status).toBe(403);
  });
  it.each([
    ["08:59", false], ["09:00", true], ["12:00", true], ["17:59", true], ["18:00", false], ["23:59", false],
  ] as const)("한국 시각 %s의 운영 시간 경계를 확인한다", async (time, available) => {
    const now = kst(`2026-11-12 ${time}`);
    const res = await robotStatusHandler(db, kioskSession(now, "t1-info"), now);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available });
  });
  it("운영 중이라도 장비 정지·방전·가용 수량 0이면 이용할 수 없다", async () => {
    for (const [state, battery, capacity] of [["paused", 100, 1], ["ready", 19, 1], ["ready", 100, 0]] as const) {
      await db.query("update support_hub_rules set state=$1,battery=$2,capacity=$3", [state, battery, capacity]);
      expect((await robotStatusHandler(db, kioskSession(noon, "t1-info"), noon)).body).toEqual({ available: false });
    }
  });
});
