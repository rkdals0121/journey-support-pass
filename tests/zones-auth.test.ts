import { beforeAll, describe, expect, it } from "vitest";
import { deviceKey, hashCode, isLocked, logAccess, login, readSession, signSession, switchZone, verifyCode } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { config } from "@/lib/config";
import { applyCodeOverrides, expandGates, getZone, listWorkZones, readSeedZones, seedZones, zoneForGate } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { sessionOf } from "./helpers/fixtures";

// scrypt 는 느리다. 검사에서는 구역 적재를 한 번만 한다.
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, hashCode);
}, 400_000);

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

  it("안내데스크, 공통 직원 자리, 키오스크 자리가 하나씩 있다", async () => {
    const seed = readSeedZones();
    expect(seed.filter((z) => z.isDesk).map((z) => [z.id, z.label])).toEqual([["desk-t1", "안내데스크"]]);
    expect(seed.filter((z) => z.isCommon).map((z) => z.id)).toEqual(["staff-common"]);
    expect(seed.filter((z) => z.isKiosk).map((z) => [z.id, z.code])).toEqual([["kiosk", "300300"]]);
    const rows = await db.query<{ id: string }>("select id from zones where is_kiosk");
    expect(rows.map((r) => r.id)).toEqual(["kiosk"]);
    expect((await getZone(db, "desk-t1"))?.label).toBe("안내데스크");
  });

  it("키오스크 자리와 공통 자리, 안내데스크는 근무 구역으로 고를 수 없고 탑승구도 없다", async () => {
    const ids = (await listWorkZones(db)).map((z) => z.id);
    expect(ids).not.toContain("kiosk");
    expect(ids).not.toContain("staff-common");
    expect(ids).not.toContain("desk-t1");
    expect(ids).toContain("cc-end");
    for (const z of readSeedZones().filter((z) => z.isKiosk || z.isCommon || z.isDesk)) expect(z.gateRanges).toEqual([]);
  });

  it("근무 구역은 터미널 순, 그 안에서는 탑승구 번호 순이다", async () => {
    const zones = await listWorkZones(db);
    const terminals = zones.map((z) => z.terminal);
    expect([...new Set(terminals)]).toEqual(["T1", "CONCOURSE", "T2"]);
    for (const t of ["T1", "CONCOURSE", "T2"]) {
      const firsts = zones.filter((z) => z.terminal === t).map((z) => Math.min(...z.gates));
      expect(firsts, t).toEqual([...firsts].sort((a, b) => a - b));
    }
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
    const s = sessionOf(now, { exp: now.getTime() + 1000 });
    const token = signSession(s);
    expect(readSession(token, now)).toEqual(s);
    expect(readSession(token, new Date(now.getTime() + 1000))).toBeNull();
    expect(readSession(undefined, now)).toBeNull();
    expect(readSession("abc", now)).toBeNull();
  });

  it("내용을 바꾼 세션은 버린다", () => {
    const now = kst("2026-10-05 09:00");
    const token = signSession(sessionOf(now, { exp: now.getTime() + 1000 }));
    const forged = Buffer.from(JSON.stringify({ zoneId: "desk-t1", isDesk: true, exp: now.getTime() + 1000 })).toString(
      "base64url",
    );
    expect(readSession(`${forged}.${token.split(".")[1]}`, now)).toBeNull();
  });
});

describe("키오스크 세션", () => {
  const now = kst("2026-10-05 09:00");

  it("키오스크 세션은 놓인 자리를 함께 담는다", () => {
    const s = sessionOf(now, { zoneId: "kiosk", isKiosk: true, placeId: "cc-train" });
    expect(readSession(signSession(s), now)).toEqual(s);
  });

  it("키오스크가 아닌 세션에 자리가 들어 있어도 읽을 때 버린다", () => {
    const s = sessionOf(now, { placeId: "cc-train" });
    expect(readSession(signSession(s), now)).toEqual({ ...s, placeId: null });
  });

  it("예전에 만든 세션에는 키오스크 칸이 없다. 직원 세션으로 읽는다", () => {
    const old = { zoneId: "cc-end", isDesk: false, canSwitch: false, needsZone: false, exp: now.getTime() + 1000 };
    expect(readSession(signSession(old as never), now)).toEqual({ ...old, isKiosk: false, placeId: null });
  });

  it("설치 코드와 자리를 주면 키오스크 세션이 된다. 30일 동안 유지된다", async () => {
    const res = await login(db, "300300", "kiosk-a", now, { placeId: "cc-train" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(config.kioskSessionDays).toBe(30);
    expect(res.session).toEqual({
      zoneId: "kiosk",
      isDesk: false,
      canSwitch: false,
      needsZone: false,
      isKiosk: true,
      placeId: "cc-train",
      exp: now.getTime() + 30 * 24 * 3_600_000,
    });
    expect(readSession(res.token, new Date(now.getTime() + 29 * 24 * 3_600_000))).toEqual(res.session);
    expect(readSession(res.token, new Date(now.getTime() + 30 * 24 * 3_600_000))).toBeNull();
  });

  it("설치 코드로 직원 화면에 로그인할 수 없다", async () => {
    expect(await login(db, "300300", "kiosk-b", now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("직원 코드, 안내데스크 코드, 공통 코드로 키오스크를 설치할 수 없다", async () => {
    for (const code of ["201132", "100100", "200200"]) {
      expect(await login(db, code, `kiosk-c-${code}`, now, { placeId: "cc-train" }), code).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("잘못 넣은 설치 코드도 실패 횟수에 들어간다", async () => {
    const t = kst("2026-10-05 09:30");
    for (let i = 0; i < 5; i++) await login(db, "000000", "kiosk-d", t, { placeId: "cc-train" });
    expect(await isLocked(db, "kiosk-d", "login_fail", t)).toBe(true);
    expect(await login(db, "300300", "kiosk-d", t, { placeId: "cc-train" })).toEqual({ ok: false, reason: "locked" });
  });

  it("키오스크 세션은 근무 구역을 고를 수 없고, 키오스크 자리는 근무 구역으로 고를 수 없다", async () => {
    const kiosk = sessionOf(now, { zoneId: "kiosk", isKiosk: true, placeId: "cc-train" });
    expect(await switchZone(db, kiosk, "cc-end")).toEqual({ ok: false });
    expect(await switchZone(db, { ...kiosk, canSwitch: true }, "cc-end")).toEqual({ ok: false });
    const common = sessionOf(now, { zoneId: "staff-common", canSwitch: true, needsZone: true });
    expect(await switchZone(db, common, "kiosk")).toEqual({ ok: false });
    expect(await switchZone(db, common, "desk-t1")).toEqual({ ok: false });
    expect((await switchZone(db, common, "cc-end")).ok).toBe(true);
  });
});

describe("로그인", () => {
  it("코드가 맞으면 그 구역으로 12시간 로그인된다", async () => {
    const now = kst("2026-10-05 09:00");
    const res = await login(db, "201132", "dev-a", now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.session).toEqual({
      zoneId: "cc-end",
      isDesk: false,
      canSwitch: false,
      needsZone: false,
      isKiosk: false,
      placeId: null,
      exp: now.getTime() + 12 * 3_600_000,
    });
    expect(readSession(res.token, now)?.zoneId).toBe("cc-end");
  });

  it("공통 직원 코드는 구역을 고를 수 있는 세션을 준다. 고르기 전에는 구역이 없다", async () => {
    const res = await login(db, "200200", "dev-c", kst("2026-10-05 09:00"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.session).toMatchObject({ zoneId: "staff-common", isDesk: false, canSwitch: true, needsZone: true });
    const picked = await switchZone(db, res.session, "t2-mid");
    expect(picked.ok && picked.session).toMatchObject({ zoneId: "t2-mid", canSwitch: true, needsZone: false });
    expect(picked.ok && picked.session.exp).toBe(res.session.exp);
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
    // 로그인 한 번마다 켜진 구역 수만큼 코드를 대조해서 오래 걸린다. 앞의 네 기기는 실패 기록만 넣고, 마지막 기기만 실제로 틀려 본다.
    for (let ua = 0; ua < 4; ua++) {
      for (let i = 0; i < 4; i++) await logAccess(db, { at: t0, deviceKey: key(`ua-${ua}`), action: "login_fail" });
    }
    expect(await isLocked(db, key("ua-new"), "login_fail", t0)).toBe(false);
    for (let i = 0; i < 4; i++) {
      expect(await login(db, "000000", key("ua-4"), t0)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await isLocked(db, key("ua-new"), "login_fail", t0)).toBe(true);
    expect(await login(db, "201132", key("ua-new"), t0)).toEqual({ ok: false, reason: "locked" });
    // 다른 접속 주소는 영향이 없다.
    expect((await login(db, "201132", deviceKey("198.51.100.9", "ua-0"), t0)).ok).toBe(true);
    // 10분이 지나면 풀린다.
    expect((await login(db, "201132", key("ua-new"), new Date(t0.getTime() + 11 * 60_000))).ok).toBe(true);
  }, 400_000);

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
    // 로그인 한 번마다 켜진 구역 수만큼 코드를 대조해서 오래 걸린다.
  }, 400_000);

  it("로그인은 5회, 키오스크의 패스 번호는 10회 틀려야 잠긴다. 둘은 따로 센다", async () => {
    expect(config.lockMaxFails).toBe(5);
    expect(config.numberLockMaxFails).toBe(10);
    const t0 = kst("2026-10-05 15:00");
    const fail = async (deviceKey: string, action: "login_fail" | "number_fail", times: number) => {
      for (let i = 0; i < times; i++) await logAccess(db, { at: t0, deviceKey, action });
    };

    await fail("lock-login", "login_fail", 4);
    expect(await isLocked(db, "lock-login", "login_fail", t0)).toBe(false);
    await fail("lock-login", "login_fail", 1);
    expect(await isLocked(db, "lock-login", "login_fail", t0)).toBe(true);
    // 로그인을 틀린 횟수는 번호 입력을 잠그지 않는다.
    expect(await isLocked(db, "lock-login", "number_fail", t0)).toBe(false);

    // 키오스크는 여러 여객이 함께 쓰는 기기라 번호 쪽 기준이 더 넉넉하다.
    await fail("lock-number", "number_fail", 9);
    expect(await isLocked(db, "lock-number", "number_fail", t0)).toBe(false);
    await fail("lock-number", "number_fail", 1);
    expect(await isLocked(db, "lock-number", "number_fail", t0)).toBe(true);
    expect(await isLocked(db, "lock-number", "login_fail", t0)).toBe(false);
    // 10분이 지나면 풀린다.
    expect(await isLocked(db, "lock-number", "number_fail", new Date(t0.getTime() + config.lockMinutes * 60_000))).toBe(false);
  });

  it("잠긴 동안의 시도는 실패 횟수를 늘리지 않는다", async () => {
    const t0 = kst("2026-10-05 11:00");
    for (let i = 0; i < 5; i++) await login(db, "000000", "dev-d", t0);
    for (let i = 0; i < 3; i++) await login(db, "000000", "dev-d", new Date(t0.getTime() + 5 * 60_000));
    const [row] = await db.query<{ n: number }>(
      "select count(*)::int as n from access_logs where device_key = 'dev-d'",
    );
    expect(row.n).toBe(5);
  }, 400_000);
});
