import { beforeEach, describe, expect, it } from "vitest";
import { deviceKey, readSession, type Session } from "@/lib/auth";
import type { Db } from "@/lib/db";
import {
  cancelHandler,
  deskListHandler,
  deskRegisterHandler,
  linkHandler,
  morePassesHandler,
  receiptHandler,
  reissueHandler,
  updateHandler,
} from "@/lib/api/desk";
import { allowRegistration, registerHandler, searchFlightsHandler } from "@/lib/api/public";
import {
  caseHandler,
  decideTokenPage,
  encounterHandler,
  listHandler,
  resolveHandler,
  switchZoneHandler,
  zonesHandler,
} from "@/lib/api/staff";
import { generatePasses, resolveToken } from "@/lib/passes";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, regInput, register, registerWithPass } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");
const base = { canSwitch: false, needsZone: false, exp: now.getTime() + 3_600_000 };
const staff: Session = { zoneId: "cc-end", isDesk: false, ...base };
const common: Session = { zoneId: "staff-common", isDesk: false, ...base, canSwitch: true, needsZone: true };
const desk: Session = { zoneId: "desk-t1", isDesk: true, ...base };

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
  await addFlights(
    db,
    [flightRow("KE123", "2026-10-05 14:30", { gate: 101 }), flightRow("KE123", "2026-10-06 14:30", { gate: null })],
    now,
  );
});

const webBody = (over: Record<string, unknown> = {}) => {
  const i = regInput();
  return { ...i, startedAt: i.startedAt.toISOString(), ...over };
};

const logCount = async (action: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from access_logs where action = $1", [action]))[0].n;

describe("공개 경로", () => {
  it("편명 검색은 탑승구를 돌려주지 않는다", async () => {
    const res = await searchFlightsHandler(db, "ke123", now);
    const flights = res.body.flights as Record<string, unknown>[];
    expect(flights.map((f) => f.label)).toEqual(["KE123 · 뉴욕 · 오늘 14:30 출발", "KE123 · 뉴욕 · 내일 14:30 출발"]);
    for (const f of flights) expect(Object.keys(f)).not.toContain("gate");
  });

  it("결항 편은 결항이라고 보여준다", async () => {
    await addFlights(db, [flightRow("CX9", "2026-10-05 16:00", { status: "결항" })], now);
    const res = await searchFlightsHandler(db, "CX9", now);
    expect((res.body.flights as { label: string }[])[0].label).toBe("CX9 · 뉴욕 · 오늘 16:00 · 결항");
  });

  it("등록하면 접수 번호만 돌려준다", async () => {
    const res = await registerHandler(db, webBody(), "ip-1", now);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["receiptNo"]);
    expect(res.body.receiptNo).toMatch(/^\d{4}$/);
  });

  it("본문에 다른 등록 경로를 넣어 보내도 web 으로 저장한다", async () => {
    await registerHandler(db, webBody({ route: "assisted" }), "ip-2", now);
    const [row] = await db.query<{ route: string }>("select route from registrations");
    expect(row.route).toBe("web");
  });

  it("동의하지 않으면 400", async () => {
    expect((await registerHandler(db, webBody({ consent: false }), "ip-3", now)).status).toBe(400);
    expect((await registerHandler(db, webBody({ consent: "true" }), "ip-3", now)).status).toBe(400);
  });

  it("같은 접속 주소에서 10분에 20건을 넘기면 막는다. 브라우저 표시를 바꿔도 같다", async () => {
    const key = (ua: string) => deviceKey("203.0.113.7", ua);
    for (let i = 0; i < 20; i++) {
      expect((await registerHandler(db, webBody(), key(`ua-${i}`), now)).status).toBe(200);
    }
    expect((await registerHandler(db, webBody(), key("ua-new"), now)).status).toBe(429);
    expect(await allowRegistration(db, deviceKey("198.51.100.9", "ua-0"), now)).toBe(true);
    expect(await allowRegistration(db, key("ua-new"), new Date(now.getTime() + 10 * 60_000))).toBe(true);
    // 거부된 등록은 저장되지 않는다.
    expect(await db.query("select 1 from registrations")).toHaveLength(20);
  });
});

describe("직원 경로", () => {
  it("로그인 없이는 아무것도 열리지 않는다", async () => {
    const { registration } = await registerWithPass(db, now);
    expect((await listHandler(db, null, "zone", "d", now)).status).toBe(401);
    expect((await resolveHandler(db, null, { passNo: "0000" }, "d", now)).status).toBe(401);
    expect((await caseHandler(db, null, registration.id, now)).status).toBe(401);
    expect((await encounterHandler(db, null, registration.id, { action: "start" }, now)).status).toBe(401);
  });

  it("목록에는 운항 정보 기준 시각이 함께 온다", async () => {
    await registerWithPass(db, now);
    const res = await listHandler(db, staff, "zone", "d", now);
    expect(res.body.zoneLabel).toContain("끝단");
    expect(res.body.poll).toEqual({ label: "운항 정보 없음", stale: true, aged: false });
    expect(res.body.assigned).toHaveLength(1);
  });

  it("QR 로 찾으면 조회 기록이 남는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, staff, { scanned: `https://x.app/p/${pass.token}` }, "d", now);
    expect(res.body).toEqual({ kind: "active", registrationId: registration.id });
    expect(await logCount("scan_view")).toBe(1);
  });

  it("연결 전 패스, 패스가 아닌 QR", async () => {
    const [idle] = await generatePasses(db, 1);
    expect((await resolveHandler(db, staff, { scanned: idle.token }, "d", now)).body).toEqual({ kind: "idle" });
    expect((await resolveHandler(db, staff, { scanned: "https://naver.com" }, "d", now)).body).toEqual({
      kind: "unknown",
    });
  });

  it("패스 번호를 5회 틀리면 맞는 번호도 받지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const wrong = pass.passNo === "0000" ? "0001" : "0000";
    for (let i = 0; i < 5; i++) {
      expect((await resolveHandler(db, staff, { passNo: wrong }, "d", now)).body).toEqual({ kind: "unknown" });
    }
    expect((await resolveHandler(db, staff, { passNo: pass.passNo }, "d", now)).status).toBe(429);
    expect((await resolveHandler(db, staff, { passNo: pass.passNo }, "other", now)).body.kind).toBe("active");
    expect(await logCount("number_view")).toBe(1);
  });

  it("카드를 두 번 열어도 응대 기록은 하나", async () => {
    const { registration } = await registerWithPass(db, now);
    const a = await caseHandler(db, staff, registration.id, now);
    const b = await caseHandler(db, staff, registration.id, now);
    expect((a.body.encounter as { id: string }).id).toBe((b.body.encounter as { id: string }).id);
    expect(await db.query("select 1 from encounters")).toHaveLength(1);
  });

  it("카드는 문구로 바뀐 항목을 담는다", async () => {
    const { registration } = await registerWithPass(db, now, {
      needs: ["mov_no_stairs", "com_slow", "env_quiet", "acc_companion"],
    });
    const res = await caseHandler(db, staff, registration.id, now);
    expect(res.body.case).toMatchObject({
      name: "홍길동",
      comm: ["천천히 설명해 주세요"],
      categories: ["고령자입니다"],
      needs: ["계단이나 에스컬레이터 이용이 어렵습니다", "혼잡하거나 시끄러운 곳이 힘듭니다"],
      accompany: ["동반자가 있습니다"],
      gate: 101,
      schedTime: "14:30",
      estTime: null,
      minutesToClose: 140,
    });
  });

  it("공공데이터가 탑승 마감을 알려 주면 추정 대신 그 값을 보여준다", async () => {
    await addFlights(
      db,
      [
        flightRow("CL1", "2026-10-05 13:00", { gate: 102, status: "탑승마감" }),
        flightRow("BD1", "2026-10-05 16:00", { gate: 103, status: "탑승중" }),
        flightRow("CX1", "2026-10-05 16:00", { gate: 104, status: "결항" }),
      ],
      now,
    );
    const open = async (flightNo: string) => {
      const { registration } = await registerWithPass(db, now, { flightNo });
      return (await caseHandler(db, staff, registration.id, now)).body.case as Record<string, unknown>;
    };
    expect(await open("CL1")).toMatchObject({ closeLabel: "탑승 마감됨", urgent: true, status: "탑승마감" });
    // 출발까지 4시간 남았어도 탑승 중이면 급한 여객이다.
    expect(await open("BD1")).toMatchObject({ closeLabel: "탑승 마감까지 230분 (추정)", urgent: true, status: "탑승중" });
    expect(await open("CX1")).toMatchObject({ closeLabel: "결항", urgent: false });
    expect(await open("KE123")).toMatchObject({ closeLabel: "탑승 마감까지 140분 (추정)", urgent: false, status: "" });
  });

  it("응대는 시작한 뒤에만 완료된다", async () => {
    const { registration } = await registerWithPass(db, now);
    const res = await caseHandler(db, staff, registration.id, now);
    const id = (res.body.encounter as { id: string }).id;
    expect((await encounterHandler(db, staff, id, { action: "end" }, now)).body).toEqual({ ok: false });
    expect((await encounterHandler(db, staff, id, { action: "start" }, now)).body).toEqual({ ok: true });
    expect((await encounterHandler(db, staff, id, { action: "end" }, now)).body).toEqual({ ok: true });
    expect((await encounterHandler(db, staff, id, { action: "dance" }, now)).status).toBe(400);
  });

  it("만료된 등록의 카드는 열리지 않는다", async () => {
    const { registration } = await registerWithPass(db, now);
    await db.query("update registrations set status = 'expired' where id = $1", [registration.id]);
    expect((await caseHandler(db, staff, registration.id, now)).status).toBe(404);
  });
});

describe("공통 직원 코드와 근무 구역", () => {
  it("구역을 고르기 전에는 여객 정보가 열리지 않는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    expect((await listHandler(db, common, "all", "d", now)).status).toBe(409);
    expect((await caseHandler(db, common, registration.id, now)).status).toBe(409);
    expect((await resolveHandler(db, common, { scanned: pass.token }, "d", now)).status).toBe(409);
    expect(await decideTokenPage(db, pass.token, common, "d", now)).toEqual({ kind: "pick_zone" });
    expect(await logCount("scan_view")).toBe(0);
  });

  it("고를 수 있는 구역은 터미널별로 묶여 오고 안내데스크와 공통 자리는 빠진다", async () => {
    const res = await zonesHandler(db, common);
    const groups = res.body.groups as { terminal: string; zones: { id: string; label: string }[] }[];
    expect(groups.map((g) => g.terminal)).toEqual(["제1여객터미널", "탑승동", "제2여객터미널"]);
    const ids = groups.flatMap((g) => g.zones.map((z) => z.id));
    expect(ids).toContain("cc-end");
    expect(ids).not.toContain("desk-t1");
    expect(ids).not.toContain("staff-common");
    expect(res.body.current).toBeNull();
  });

  it("구역을 고르면 그 구역의 세션이 된다. 만료 시각은 늘어나지 않는다", async () => {
    const res = await switchZoneHandler(db, common, { zoneId: "cc-end" });
    expect(res.status).toBe(200);
    expect(readSession(res.token, now)).toEqual({ ...common, zoneId: "cc-end", needsZone: false });
  });

  it("안내데스크나 없는 구역은 고를 수 없고, 구역 코드로 들어온 직원은 바꿀 수 없다", async () => {
    expect((await switchZoneHandler(db, common, { zoneId: "desk-t1" })).status).toBe(400);
    expect((await switchZoneHandler(db, common, { zoneId: "staff-common" })).status).toBe(400);
    expect((await switchZoneHandler(db, common, { zoneId: "nope" })).status).toBe(400);
    expect((await switchZoneHandler(db, staff, { zoneId: "cc-mid" })).status).toBe(403);
    expect((await zonesHandler(db, staff)).status).toBe(403);
    expect((await zonesHandler(db, null)).status).toBe(401);
  });
});

describe("전체 여객 목록", () => {
  it("내 구역만 볼 때는 다른 구역 여객의 이름을 보내지 않고 건수만 보낸다", async () => {
    await addFlights(db, [flightRow("OZ500", "2026-10-05 15:00", { gate: 115 })], now);
    await registerWithPass(db, now);
    await registerWithPass(db, now, { name: "다른구역", flightNo: "OZ500" });
    const res = await listHandler(db, staff, "zone", "d", now);
    expect(res.body.assigned).toHaveLength(1);
    expect(res.body.otherCount).toBe(1);
    expect(res.body.others).toEqual([]);
    expect(await logCount("list_view")).toBe(0);
  });

  it("전체를 보면 다른 구역 여객이 오고 조회 기록이 남는다. 같은 기기는 10분에 한 번만 남긴다", async () => {
    await addFlights(db, [flightRow("OZ500", "2026-10-05 15:00", { gate: 115 })], now);
    await registerWithPass(db, now);
    await registerWithPass(db, now, { name: "다른구역", flightNo: "OZ500" });
    const res = await listHandler(db, staff, "all", "d", now);
    const others = res.body.others as { name: string; zoneLabel: string; terminalLabel: string }[];
    expect(others.map((c) => c.name)).toEqual(["다른구역"]);
    expect(others[0].zoneLabel).toContain("중앙부");
    expect(others[0].terminalLabel).toBe("탑승동");
    await listHandler(db, staff, "all", "d", new Date(now.getTime() + 60_000));
    expect(await logCount("list_view")).toBe(1);
    await listHandler(db, staff, "all", "d", new Date(now.getTime() + 11 * 60_000));
    expect(await logCount("list_view")).toBe(2);
  });
});

describe("편명 자동 검색", () => {
  it("두 글자부터 그 글자로 시작하는 편을 찾고, 같은 편명을 맨 위에 둔다", async () => {
    await addFlights(
      db,
      [flightRow("KE12", "2026-10-05 18:00"), flightRow("KE1234", "2026-10-05 13:00"), flightRow("OZ123", "2026-10-05 13:00")],
      now,
    );
    const nos = async (q: string) =>
      ((await searchFlightsHandler(db, q, now)).body.flights as { flightNo: string }[]).map((f) => f.flightNo);
    expect(await nos("k")).toEqual([]);
    expect(await nos("ke12")).toEqual(["KE12", "KE1234", "KE123", "KE123"]);
    expect(await nos("KE 123")).toEqual(["KE123", "KE123", "KE1234"]);
    expect(await nos("OZ")).toEqual(["OZ123"]);
    expect(await nos("ZZ")).toEqual([]);
  });

  it("후보는 여덟 편까지만, 떠난 편은 빼고 보낸다", async () => {
    await addFlights(
      db,
      [
        ...Array.from({ length: 12 }, (_, i) => flightRow("TW" + (100 + i), "2026-10-05 20:00")),
        flightRow("TW999", "2026-10-05 11:00"),
      ],
      now,
    );
    const flights = (await searchFlightsHandler(db, "TW", now)).body.flights as { flightNo: string }[];
    expect(flights).toHaveLength(8);
    expect(flights.map((f) => f.flightNo)).not.toContain("TW999");
  });
});

describe("응대 이력", () => {
  const mid: Session = { zoneId: "cc-mid", isDesk: false, ...base };

  it("카드를 열어 보기만 한 것은 응대로 세지 않는다", async () => {
    const { registration } = await registerWithPass(db, now);
    const res = await caseHandler(db, staff, registration.id, now);
    expect(res.body.trail).toEqual([]);
    expect((res.body.case as { service: unknown }).service).toBeNull();
    const list = await listHandler(db, staff, "zone", "d", now);
    expect((list.body.assigned as { service: unknown }[])[0].service).toBeNull();
  });

  it("앞 구역의 응대가 다음 구역 직원의 카드와 목록에 보인다. 직원은 구역으로만 남는다", async () => {
    const { registration } = await registerWithPass(db, now);
    const at = (m: number) => new Date(now.getTime() + m * 60_000);
    const first = await caseHandler(db, mid, registration.id, at(0));
    const id = (first.body.encounter as { id: string }).id;
    await encounterHandler(db, mid, id, { action: "start" }, at(1));

    // 응대 중: 다른 구역 직원의 목록에 보인다.
    let list = await listHandler(db, staff, "zone", "d", at(2));
    expect((list.body.assigned as { service: unknown }[])[0].service).toEqual({
      zone: "탑승동 중간",
      startTime: "12:01",
      endTime: null,
    });

    await encounterHandler(db, mid, id, { action: "end" }, at(6));
    const next = await caseHandler(db, staff, registration.id, at(10));
    expect(next.body.trail).toEqual([{ zone: "탑승동 중간", startTime: "12:01", endTime: "12:06" }]);

    // 다음 구역이 시작하면 이력이 두 줄이 되고, 목록은 가장 최근 것을 보여준다.
    await encounterHandler(db, staff, (next.body.encounter as { id: string }).id, { action: "start" }, at(11));
    const again = await caseHandler(db, staff, registration.id, at(12));
    expect((again.body.trail as { zone: string }[]).map((t) => t.zone)).toEqual(["탑승동 중간", "탑승동 끝단"]);
    list = await listHandler(db, staff, "zone", "d", at(12));
    expect((list.body.assigned as { service: { zone: string; endTime: string | null } }[])[0].service).toMatchObject({
      zone: "탑승동 끝단",
      endTime: null,
    });
  });
});

describe("패스 QR 주소 분기", () => {
  it("로그인하지 않으면 DB 를 조회하지 않고 직원 전용 안내만", async () => {
    let queries = 0;
    const counting: Db = {
      query: (sql, params) => {
        queries += 1;
        return db.query(sql, params);
      },
      exec: (sql) => db.exec(sql),
    };
    const { pass } = await registerWithPass(db, now);
    expect(await decideTokenPage(counting, pass.token, null, "d", now)).toEqual({ kind: "staff_only" });
    expect(await decideTokenPage(counting, "x".repeat(24), null, "d", now)).toEqual({ kind: "staff_only" });
    expect(queries).toBe(0);
  });

  it("직원이 연결된 패스를 찍으면 카드로, 기록을 남긴다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    expect(await decideTokenPage(db, pass.token, staff, "d", now)).toEqual({
      kind: "case",
      registrationId: registration.id,
    });
    expect(await logCount("scan_view")).toBe(1);
  });

  it("연결 전 패스는 안내데스크만 연결 화면으로", async () => {
    const [idle] = await generatePasses(db, 1);
    expect(await decideTokenPage(db, idle.token, staff, "d", now)).toEqual({ kind: "idle" });
    expect(await decideTokenPage(db, idle.token, desk, "d", now)).toEqual({ kind: "desk_link", token: idle.token });
  });

  it("없는 토큰과 폐기된 패스는 사용할 수 없음", async () => {
    expect(await decideTokenPage(db, "x".repeat(24), staff, "d", now)).toEqual({ kind: "unusable" });
  });
});

describe("안내데스크 경로", () => {
  it("안내데스크가 아니면 403, 로그인 없으면 401", async () => {
    expect((await receiptHandler(db, staff, { receiptNo: "0000" }, "d", now)).status).toBe(403);
    expect((await linkHandler(db, staff, {}, "d", now)).status).toBe(403);
    expect((await deskRegisterHandler(db, staff, {}, now)).status).toBe(403);
    expect((await reissueHandler(db, staff, {}, "d", now)).status).toBe(403);
    expect((await receiptHandler(db, null, { receiptNo: "0000" }, "d", now)).status).toBe(401);
  });

  it("접수 번호 조회 → 연결 → 같은 번호는 더 조회되지 않는다", async () => {
    const reg = await register(db, now);
    const [pass] = await generatePasses(db, 1);

    const found = await receiptHandler(db, desk, { receiptNo: reg.receiptNo }, "d", now);
    expect(found.body).toMatchObject({
      registrationId: reg.id,
      name: "홍길동",
      flightNo: "KE123",
      destName: "뉴욕",
      timeLabel: "14:30",
      categories: ["고령자입니다"],
      needs: ["계단이나 에스컬레이터 이용이 어렵습니다", "천천히 설명해 주세요"],
    });

    const linked = await linkHandler(db, desk, { registrationId: reg.id, scanned: pass.token }, "d", now);
    expect(linked.body).toEqual({ ok: true, passNo: pass.passNo });
    expect((await receiptHandler(db, desk, { receiptNo: reg.receiptNo }, "d", now)).status).toBe(404);
    expect(await logCount("receipt_view")).toBe(1);
    expect(await logCount("link")).toBe(1);
  });

  it("사용 중인 패스로는 연결할 수 없다", async () => {
    const { pass } = await registerWithPass(db, now);
    const reg = await register(db, now);
    const res = await linkHandler(db, desk, { registrationId: reg.id, scanned: pass.token }, "d", now);
    expect(res).toEqual({ status: 400, body: { error: "이미 사용 중인 패스입니다" } });
  });

  it("패스가 아닌 QR", async () => {
    const reg = await register(db, now);
    const res = await linkHandler(db, desk, { registrationId: reg.id, scanned: "https://naver.com" }, "d", now);
    expect(res.body.error).toBe("패스 QR이 아닙니다");
  });

  it("종이 체크리스트 등록은 경로를 남기고 바로 연결된다", async () => {
    const res = await deskRegisterHandler(db, desk, webBody({ route: "paper" }), now);
    expect(res.status).toBe(200);
    const [row] = await db.query<{ route: string }>("select route from registrations");
    expect(row.route).toBe("paper");

    const [pass] = await generatePasses(db, 1);
    const linked = await linkHandler(db, desk, { registrationId: res.body.registrationId, scanned: pass.token }, "d", now);
    expect(linked.status).toBe(200);
  });

  it("안내데스크 등록은 방법을 골라야 한다", async () => {
    expect((await deskRegisterHandler(db, desk, webBody({ route: "web" }), now)).status).toBe(400);
    expect((await deskRegisterHandler(db, desk, webBody(), now)).status).toBe(400);
  });

  it("재발급: 이름과 편명으로 찾아 새 패스를 연결하면 옛 패스는 쓸 수 없다", async () => {
    const { registration, pass: oldPass } = await registerWithPass(db, now);
    const [newPass] = await generatePasses(db, 1);

    const found = await reissueHandler(db, desk, { name: "홍길동", flightNo: "ke123" }, "d", now);
    const candidates = found.body.candidates as { registrationId: string }[];
    expect(candidates.map((c) => c.registrationId)).toEqual([registration.id]);

    const done = await reissueHandler(db, desk, { registrationId: registration.id, scanned: newPass.token }, "d", now);
    expect(done.body).toEqual({ ok: true, passNo: newPass.passNo });
    expect(await resolveToken(db, oldPass.token)).toEqual({ kind: "unusable" });
    expect(await logCount("reissue")).toBe(1);
  });

  it("카메라를 못 쓰면 패스 번호로 연결한다. 미사용 패스만 받는다", async () => {
    const reg = await register(db, now);
    const used = await registerWithPass(db, now);
    const [idle] = await generatePasses(db, 1);

    const bad = await linkHandler(db, desk, { registrationId: reg.id, passNo: used.pass.passNo }, "d", now);
    expect(bad).toEqual({ status: 400, body: { error: "쓸 수 있는 패스 번호가 아닙니다" } });

    const good = await linkHandler(db, desk, { registrationId: reg.id, passNo: idle.passNo }, "d", now);
    expect(good.body).toEqual({ ok: true, passNo: idle.passNo });
  });

  it("자동 배정: 번호가 가장 작은 미사용 패스를 연결하고 그 번호를 알려 준다", async () => {
    await db.query("delete from passes");
    await db.query("insert into passes (token, pass_no) values ($1, '0500'), ($2, '0042')", ["a".repeat(24), "b".repeat(24)]);
    const reg = await register(db, now);
    expect((await linkHandler(db, staff, { registrationId: reg.id, auto: true }, "d", now)).status).toBe(403);
    const res = await linkHandler(db, desk, { registrationId: reg.id, auto: true }, "d", now);
    expect(res.body).toEqual({ ok: true, passNo: "0042" });
    // 재발급도 자동 배정으로 할 수 있다. 옛 패스는 끝난다.
    const again = await reissueHandler(db, desk, { registrationId: reg.id, auto: true }, "d", now);
    expect(again.body).toEqual({ ok: true, passNo: "0500" });
    expect((await resolveToken(db, "b".repeat(24))).kind).toBe("unusable");
    // 남은 패스가 없으면 알려 준다.
    const other = await register(db, now, { name: "두번째" });
    const none = await linkHandler(db, desk, { registrationId: other.id, auto: true }, "d", now);
    expect(none.status).toBe(400);
    expect(none.body.error).toContain("미사용 패스가 없습니다");
  });

  it("등록 목록: 패스를 기다리는 등록과 연결된 등록을 나눠 보여준다", async () => {
    const waiting = await register(db, now, { name: "대기여객" });
    const linked = await registerWithPass(db, now, { name: "연결여객" });
    const gone = await register(db, now, { name: "만료여객" });
    await db.query("update registrations set status = 'expired' where id = $1", [gone.id]);

    const res = await deskListHandler(db, desk, "d", now);
    const pending = res.body.pending as Record<string, unknown>[];
    const active = res.body.active as Record<string, unknown>[];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      registrationId: waiting.id,
      name: "대기여객",
      flightNo: "KE123",
      destName: "뉴욕",
      timeLabel: "14:30",
      receiptNo: waiting.receiptNo,
      passNo: null,
    });
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ name: "연결여객", passNo: linked.pass.passNo });

    // 여러 여객의 이름이 보이는 화면이므로 열어 본 기록을 남긴다.
    expect(await logCount("list_view")).toBe(1);
    expect((await deskListHandler(db, staff, "d", now)).status).toBe(403);
    expect((await deskListHandler(db, null, "d", now)).status).toBe(401);
    expect(await logCount("list_view")).toBe(1);
  });

  it("등록 내용 고치기: 이름·편·선택을 바꾸고 패스는 그대로 둔다", async () => {
    await addFlights(db, [flightRow("OZ500", "2026-10-05 15:00", { gate: 115, destName: "파리" })], now);
    const { registration, pass } = await registerWithPass(db, now);
    const body = {
      registrationId: registration.id,
      name: " 홍길순 ",
      flightDate: "2026-10-05",
      flightNo: "OZ500",
      categories: ["cat_pregnant"],
      needs: ["mov_no_standing"],
    };
    expect((await updateHandler(db, staff, body, "d", now)).status).toBe(403);
    expect((await updateHandler(db, desk, { ...body, flightNo: "ZZ1" }, "d", now)).body.error).toBe("편명을 다시 확인해 주세요");
    expect((await updateHandler(db, desk, { ...body, categories: [] }, "d", now)).status).toBe(400);

    const res = await updateHandler(db, desk, body, "d", now);
    expect(res.body).toMatchObject({ name: "홍길순", flightNo: "OZ500", destName: "파리", categoryCodes: ["cat_pregnant"] });
    expect(await logCount("edit")).toBe(1);
    // 같은 패스로 열면 고친 내용이 보이고, 탑승구가 바뀐 편을 따라 다른 구역으로 넘어간다.
    const found = await resolveToken(db, pass.token);
    expect(found.kind).toBe("active");
    expect((await listHandler(db, staff, "zone", "d", now)).body.assigned).toHaveLength(0);
    const card = await caseHandler(db, staff, registration.id, now);
    expect(card.body.case).toMatchObject({ name: "홍길순", gate: 115, categories: ["임신 중입니다"] });
    const [row] = await db.query<{ edit_count: number }>("select edit_count from registrations where id = $1", [registration.id]);
    expect(row.edit_count).toBe(1);
  });

  it("끝난 등록은 고칠 수 없다", async () => {
    const reg = await register(db, now);
    await cancelHandler(db, desk, { registrationId: reg.id }, "d", now);
    const res = await updateHandler(db, desk, { ...webBody(), registrationId: reg.id }, "d", now);
    expect(res.status).toBe(400);
  });

  it("등록 취소: 사람을 알 수 있는 값을 지우고 패스를 끝낸다", async () => {
    const waiting = await register(db, now, { name: "잘못등록" });
    const linked = await registerWithPass(db, now, { name: "취소여객" });

    expect((await cancelHandler(db, staff, { registrationId: waiting.id }, "d", now)).status).toBe(403);
    expect((await cancelHandler(db, desk, { registrationId: waiting.id }, "d", now)).body).toEqual({ ok: true });
    expect((await cancelHandler(db, desk, { registrationId: linked.registration.id }, "d", now)).status).toBe(200);
    // 이미 취소한 등록은 다시 취소할 수 없다.
    expect((await cancelHandler(db, desk, { registrationId: waiting.id }, "d", now)).status).toBe(404);

    const rows = await db.query<{ name: string | null; status: string; receipt_no: string | null }>(
      "select name, status, receipt_no from registrations order by submitted_at",
    );
    expect(rows).toEqual([
      { name: null, status: "revoked", receipt_no: null },
      { name: null, status: "revoked", receipt_no: null },
    ]);
    expect(await resolveToken(db, linked.pass.token)).toEqual({ kind: "unusable" });
    const list = await deskListHandler(db, desk, "d", now);
    expect(list.body.pending).toHaveLength(0);
    expect(list.body.active).toHaveLength(0);
    expect(await logCount("cancel")).toBe(2);
  });

  it("패스 더 만들기: 안내데스크만, 한 번에 50장까지", async () => {
    expect((await morePassesHandler(db, staff, { count: 10 })).status).toBe(403);
    expect((await morePassesHandler(db, desk, { count: 0 })).status).toBe(400);
    expect((await morePassesHandler(db, desk, { count: 51 })).status).toBe(400);
    expect((await morePassesHandler(db, desk, { count: 10 })).body).toEqual({ ok: true, made: 10 });
    expect(await db.query("select 1 from passes where state = 'idle'")).toHaveLength(10);
  });

  it("재발급 검색은 이름과 편명이 모두 필요하다", async () => {
    expect((await reissueHandler(db, desk, { name: "홍길동" }, "d", now)).status).toBe(400);
  });
});
