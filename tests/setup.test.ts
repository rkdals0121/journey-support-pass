import { describe, expect, it } from "vitest";
import { login } from "@/lib/auth";
import { openPglite } from "@/lib/db";
import { findFlights } from "@/lib/flights/search";
import { runSetup } from "@/lib/setup";
import { readSeedZones } from "@/lib/zones";
import { kst } from "./helpers/db";

const now = kst("2026-10-05 12:00");
const activeIds = readSeedZones()
  .filter((z) => z.active)
  .map((z) => z.id);
const allCodes = Object.fromEntries(activeIds.map((id, i) => [id, String(900000 + i)]));

describe("초기 설정", () => {
  it("빈 DB 에 테이블, 구역, 패스, 모의 운항을 채운다", async () => {
    const db = await openPglite();
    const res = await runSetup(db, { codes: allCodes, requireAllCodes: true, mockFlights: true }, now);
    expect(res).toMatchObject({ ok: true, idlePasses: 30, newPasses: 30 });
    expect(res.mockFlights).toContain("MK101");
    expect(await findFlights(db, "MK101", now)).toHaveLength(1);

    // 넘겨준 코드로 로그인되고, 저장소에 공개된 코드로는 안 된다.
    expect((await login(db, allCodes["cc-end"], "d1", now)).ok).toBe(true);
    expect((await login(db, "201132", "d2", now)).ok).toBe(false);
  });

  it("켜진 구역의 코드가 하나라도 빠지면 아무 구역도 넣지 않는다", async () => {
    const db = await openPglite();
    const partial = { ...allCodes };
    delete partial["cc-end"];
    const res = await runSetup(db, { codes: partial, requireAllCodes: true, mockFlights: false }, now);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("cc-end");
    expect(await db.query("select 1 from zones")).toHaveLength(0);
  });

  it("코드 없이 부르면 구역은 그대로 두고 모의 운항만 다시 맞춘다", async () => {
    const db = await openPglite();
    await runSetup(db, { codes: allCodes, requireAllCodes: true, mockFlights: true }, now);
    const later = kst("2026-10-05 18:00");
    const res = await runSetup(db, { codes: null, requireAllCodes: true, mockFlights: true }, later);
    expect(res).toMatchObject({ ok: true, newPasses: 0 });
    expect(await findFlights(db, "MK101", later)).toHaveLength(1);
    expect((await login(db, allCodes["cc-end"], "d1", later)).ok).toBe(true);
    const flights = await db.query("select 1 from flights");
    expect(flights).toHaveLength(res.mockFlights!.length);
  });

  it("구역이 없는 DB 에 코드 없이 부르면 거부한다", async () => {
    const db = await openPglite();
    const res = await runSetup(db, { codes: null, requireAllCodes: true, mockFlights: false }, now);
    expect(res.ok).toBe(false);
  });
});
