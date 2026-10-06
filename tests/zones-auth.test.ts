import { beforeAll, describe, expect, it } from "vitest";
import { deviceKey, hashCode, isLocked, login, readSession, signSession, verifyCode } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { applyCodeOverrides, expandGates, getZone, readSeedZones, seedZones, zoneForGate } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";

// scrypt 는 느리다. 검사에서는 구역 적재를 한 번만 한다.
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, hashCode);
});

describe("구역", () => {
  it("탑승구로 구역을 찾는다", async () => {
    expect((await zoneForGate(db, "T2", 220))?.id).toBe("t2-wam");
    expect((await zoneForGate(db, "CONCOURSE", 101))?.band).toBe("끝단");
    expect((await zoneForGate(db, "CONCOURSE", 115))?.band).toBe("중앙부");
    expect((await zoneForGate(db, "CONCOURSE", 124))?.band).toBe("중간");
  });

  it("꺼 둔 구역과 없는 탑승구는 찾지 않는다", async () => {
    expect((await zoneForGate(db, "T1", 40))?.id).toBe("t1-e");
    await db.query("update zones set active = false where id = 't1-e'");
    expect(await zoneForGate(db, "T1", 40)).toBeNull();
    expect(await getZone(db, "t1-e")).toBeNull();
    expect(await zoneForGate(db, "T2", 999)).toBeNull();
  });

  it("탑승구 번호가 같아도 터미널이 다르면 찾지 않는다", async () => {
    expect(await zoneForGate(db, "T2", 115)).toBeNull();
  });

  it("한 탑승구가 켜진 구역 두 곳에 속하지 않는다", () => {
    const seen = new Map<string, string>();
    for (const z of readSeedZones().filter((z) => z.active)) {
      for (const g of expandGates(z.gateRanges)) {
        const key = `${z.terminal}:${g}`;
        expect(seen.get(key), `${key} 가 ${seen.get(key)} 와 ${z.id} 에 모두 있음`).toBeUndefined();
        seen.set(key, z.id);
      }
    }
  });

  it("탑승동 끝단은 12곳이다", () => {
    const end = readSeedZones().find((z) => z.id === "cc-end");
    expect(expandGates(end!.gateRanges)).toHaveLength(12);
  });

  it("접속 코드는 구역마다 다르다", () => {
    const codes = readSeedZones().map((z) => z.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("따로 둔 접속 코드가 있으면 그 구역만 바꾼다", () => {
    const zones = readSeedZones();
    const changed = applyCodeOverrides(zones, { "cc-end": "999001", "desk-t1": "" });
    expect(changed.find((z) => z.id === "cc-end")?.code).toBe("999001");
    expect(changed.find((z) => z.id === "desk-t1")?.code).toBe(zones.find((z) => z.id === "desk-t1")?.code);
    expect(changed.find((z) => z.id === "cc-mid")?.code).toBe(zones.find((z) => z.id === "cc-mid")?.code);
  });

  it("다시 적재해도 행이 늘지 않는다", async () => {
    const before = (await db.query("select 1 from zones")).length;
    await seedZones(db, hashCode);
    expect(await db.query("select 1 from zones")).toHaveLength(before);
  });

  it("접속 코드를 평문으로 저장하지 않는다", async () => {
    const rows = await db.query<{ code_hash: string }>("select code_hash from zones");
    for (const r of rows) expect(r.code_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });
});

describe("접속 코드와 세션", () => {
  it("코드를 검증한다", () => {
    const stored = hashCode("201132");
    expect(verifyCode("201132", stored)).toBe(true);
    expect(verifyCode("201133", stored)).toBe(false);
    expect(hashCode("201132")).not.toBe(stored);
    expect(verifyCode("201132", "깨진 값")).toBe(false);
  });

  it("세션을 서명하고 읽는다", () => {
    const now = kst("2026-10-05 09:00");
    const s = { zoneId: "cc-end", isDesk: false, exp: now.getTime() + 1000 };
    const token = signSession(s);
    expect(readSession(token, now)).toEqual(s);
    expect(readSession(token, new Date(now.getTime() + 1000))).toBeNull();
    expect(readSession(undefined, now)).toBeNull();
    expect(readSession("abc", now)).toBeNull();
  });

  it("내용을 바꾼 세션은 버린다", () => {
    const now = kst("2026-10-05 09:00");
    const token = signSession({ zoneId: "cc-end", isDesk: false, exp: now.getTime() + 1000 });
    const forged = Buffer.from(JSON.stringify({ zoneId: "desk-t1", isDesk: true, exp: now.getTime() + 1000 })).toString(
      "base64url",
    );
    expect(readSession(`${forged}.${token.split(".")[1]}`, now)).toBeNull();
  });
});

describe("로그인", () => {
  it("코드가 맞으면 그 구역으로 12시간 로그인된다", async () => {
    const now = kst("2026-10-05 09:00");
    const res = await login(db, "201132", "dev-a", now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.session).toEqual({ zoneId: "cc-end", isDesk: false, exp: now.getTime() + 12 * 3_600_000 });
    expect(readSession(res.token, now)?.zoneId).toBe("cc-end");
  });

  it("안내데스크 코드는 안내데스크 권한을 준다", async () => {
    const res = await login(db, "100100", "dev-a", kst("2026-10-05 09:00"));
    expect(res.ok && res.session.isDesk).toBe(true);
  });

  it("꺼 둔 구역의 코드로는 로그인할 수 없다", async () => {
    expect((await login(db, "101014", "dev-on", kst("2026-10-05 09:00"))).ok).toBe(true);
    await db.query("update zones set active = false where id = 't1-w'");
    const res = await login(db, "101014", "dev-off", kst("2026-10-05 09:00"));
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("브라우저 표시를 바꿔 가며 시도해도 같은 접속 주소에서 20회면 잠긴다", async () => {
    const t0 = kst("2026-10-05 13:00");
    const key = (ua: string) => deviceKey("203.0.113.7", ua);
    // 기기마다 4회씩만 틀려 기기 기준(5회)은 피한다.
    for (let ua = 0; ua < 5; ua++) {
      for (let i = 0; i < 4; i++) {
        expect((await login(db, "000000", key(`ua-${ua}`), t0)).ok).toBe(false);
      }
    }
    expect(await isLocked(db, key("ua-new"), "login_fail", t0)).toBe(true);
    expect(await login(db, "201132", key("ua-new"), t0)).toEqual({ ok: false, reason: "locked" });
    // 다른 접속 주소는 영향이 없다.
    expect((await login(db, "201132", deviceKey("198.51.100.9", "ua-0"), t0)).ok).toBe(true);
    // 10분이 지나면 풀린다.
    expect((await login(db, "201132", key("ua-new"), new Date(t0.getTime() + 11 * 60_000))).ok).toBe(true);
    // 로그인 한 번마다 켜진 구역 수만큼 코드를 대조하므로 20여 회 시도는 오래 걸린다.
  }, 180_000);

  it("기기 키에 원래의 접속 주소와 브라우저 표시가 남지 않는다", () => {
    const k = deviceKey("203.0.113.7", "Mozilla/5.0 Test");
    expect(k).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}$/);
    expect(k).not.toContain("203.0.113.7");
    expect(k).not.toContain("Mozilla");
  });

  it("5회 틀리면 10분 동안 잠기고, 다른 기기는 영향이 없다", async () => {
    const t0 = kst("2026-10-05 10:00");
    for (let i = 0; i < 5; i++) {
      expect(await login(db, "000000", "dev-b", new Date(t0.getTime() + i * 1000))).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    const t1 = new Date(t0.getTime() + 60_000);
    expect(await isLocked(db, "dev-b", "login_fail", t1)).toBe(true);
    expect(await login(db, "201132", "dev-b", t1)).toEqual({ ok: false, reason: "locked" });
    expect((await login(db, "201132", "dev-c", t1)).ok).toBe(true);

    const t2 = new Date(t0.getTime() + 11 * 60_000);
    expect((await login(db, "201132", "dev-b", t2)).ok).toBe(true);
  });

  it("잠긴 동안의 시도는 실패 횟수를 늘리지 않는다", async () => {
    const t0 = kst("2026-10-05 11:00");
    for (let i = 0; i < 5; i++) await login(db, "000000", "dev-d", t0);
    for (let i = 0; i < 3; i++) await login(db, "000000", "dev-d", new Date(t0.getTime() + 5 * 60_000));
    const [row] = await db.query<{ n: number }>(
      "select count(*)::int as n from access_logs where device_key = 'dev-d'",
    );
    expect(row.n).toBe(5);
  });
});
