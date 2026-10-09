import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callCancelHandler,
  callHandler,
  callStateHandler,
  kioskLoginHandler,
  placesHandler,
  resolveHandler,
} from "@/lib/api/kiosk";
import { eraseHandler, eventHandler, guideHandler, registerHandler, searchFlightsHandler } from "@/lib/api/public";
import { callActionHandler, callsHandler, loginHandler, summaryHandler, zonesHandler, type CallDto } from "@/lib/api/staff";
import { deviceKey, hashCode, readSession } from "@/lib/auth";
import { PLACES } from "@/lib/airport";
import { config } from "@/lib/config";
import type { Db } from "@/lib/db";
import type { GuideDto } from "@/lib/guide";
import { formatPassNo, passUrl } from "@/lib/passes";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import {
  addFlights,
  commonSession,
  deskSession,
  flightRow,
  hasKey,
  kioskSession,
  regInput,
  registerWithPass,
  resetData,
  sessionOf,
} from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");
const staff = sessionOf(now);
const mid = sessionOf(now, { zoneId: "cc-mid" });
const common = commonSession(now);
const desk = deskSession(now);
const kiosk = kioskSession(now, "cc-train"); // 탑승동 지하 1층 셔틀트레인 도착층
const other = kioskSession(now, "cc-108");
const dev = deviceKey("10.0.0.5", "kiosk");

// 로그인을 검사하므로 접속 코드를 실제 방식으로 해시해 넣는다. 느려서 한 번만 한다.
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, hashCode);
}, 400_000);
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 127 })], now);
});

const logCount = async (action: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from access_logs where action = $1", [action]))[0].n;
const events = () =>
  db.query<{ kind: string; route: string; adapted: boolean; place_id: string | null; device_key: string | null }>(
    "select kind, route, adapted, place_id, device_key from events order by id",
  );
/** 틀린 번호. 진짜 번호와 겹치지 않게 고른다. */
const wrongNo = (real: string) => (real === "000000" ? "000001" : "000000");

describe("키오스크를 놓을 자리", () => {
  it("자리의 id, 이름, 보안검색 전인지만 준다. 호출을 받는 구역은 주지 않는다", () => {
    const res = placesHandler();
    expect(res.status).toBe(200);
    const places = res.body.places as Record<string, unknown>[];
    expect(places.map((p) => p.id)).toEqual(PLACES.map((p) => p.id));
    for (const p of places) expect(Object.keys(p).sort()).toEqual(["id", "label", "landside"]);
    expect(places.find((p) => p.id === "cc-train")).toEqual({
      id: "cc-train",
      label: "탑승동 지하 1층 셔틀트레인 도착층",
      landside: false,
    });
    expect(places.find((p) => p.id === "t1-info")?.landside).toBe(true);
  });
});

describe("키오스크 설치와 직원 로그인", () => {
  it("설치 코드와 자리를 넣으면 그 기기가 키오스크가 된다", async () => {
    const res = await kioskLoginHandler(db, { code: " 300300 ", placeId: "cc-train" }, "k1", now);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ placeId: "cc-train", placeLabel: "탑승동 지하 1층 셔틀트레인 도착층" });
    expect(readSession(res.token, now)).toEqual({
      zoneId: "kiosk",
      isDesk: false,
      canSwitch: false,
      needsZone: false,
      isKiosk: true,
      placeId: "cc-train",
      exp: now.getTime() + config.kioskSessionDays * 24 * 3_600_000,
    });
    // 받은 세션으로 키오스크 기능을 쓸 수 있고 직원 화면은 열 수 없다.
    const session = readSession(res.token, now);
    expect((await callHandler(db, session, {}, now)).status).toBe(200);
    expect((await callsHandler(db, session, now)).status).toBe(401);
  });

  it("코드나 자리가 없으면 400 이고 실패 횟수로 세지 않는다", async () => {
    expect((await kioskLoginHandler(db, { placeId: "cc-train" }, "k2", now)).status).toBe(400);
    expect((await kioskLoginHandler(db, { code: "   ", placeId: "cc-train" }, "k2", now)).status).toBe(400);
    expect((await kioskLoginHandler(db, { code: 300300, placeId: "cc-train" }, "k2", now)).status).toBe(400);
    expect((await kioskLoginHandler(db, { code: "300300" }, "k2", now)).status).toBe(400);
    expect((await kioskLoginHandler(db, { code: "300300", placeId: "nope" }, "k2", now)).status).toBe(400);
    expect((await kioskLoginHandler(db, { code: "300300", placeId: 3 }, "k2", now)).status).toBe(400);
    expect(await logCount("login_fail")).toBe(0);
  });

  it("직원 코드로는 키오스크를 설치할 수 없다", async () => {
    for (const code of ["201132", "100100", "200200"]) {
      const res = await kioskLoginHandler(db, { code, placeId: "cc-train" }, `k3-${code}`, now);
      expect(res.status, code).toBe(401);
      expect(res.token, code).toBeUndefined();
      expect(res.body).toEqual({ error: "설치 코드가 맞지 않습니다" });
    }
    expect(await logCount("login_fail")).toBe(3);
  });

  it("설치 코드로는 직원 화면에 로그인할 수 없다", async () => {
    const res = await loginHandler(db, { code: "300300" }, "k4", now);
    expect(res.status).toBe(401);
    expect(res.token).toBeUndefined();
    expect(res.body).toEqual({ error: "접속 코드가 맞지 않습니다" });
  });

  it("직원 코드로 로그인하면 구역 이름과 권한을 알려 준다", async () => {
    const zone = await loginHandler(db, { code: "201132" }, "s1", now);
    expect(zone.body).toEqual({ zoneLabel: "탑승동 끝단 (101~106, 127~132)", isDesk: false, needsZone: false });
    expect(readSession(zone.token, now)).toMatchObject({ zoneId: "cc-end", isKiosk: false, placeId: null });

    const deskRes = await loginHandler(db, { code: "100100" }, "s2", now);
    expect(deskRes.body).toEqual({ zoneLabel: "안내데스크", isDesk: true, needsZone: false });

    const commonRes = await loginHandler(db, { code: "200200" }, "s3", now);
    expect(commonRes.body).toMatchObject({ isDesk: false, needsZone: true });
    expect((await zonesHandler(db, readSession(commonRes.token, now))).status).toBe(200);

    expect((await loginHandler(db, {}, "s4", now)).status).toBe(400);
    expect((await loginHandler(db, { code: 201132 }, "s4", now)).status).toBe(400);
  });

  it(`${config.lockMaxFails}회 틀리면 맞는 설치 코드도 받지 않는다. 직원 로그인과 실패 횟수를 함께 센다`, async () => {
    for (let i = 0; i < config.lockMaxFails - 1; i++) {
      expect((await kioskLoginHandler(db, { code: "999999", placeId: "cc-train" }, "k5", now)).status).toBe(401);
    }
    expect((await loginHandler(db, { code: "999999" }, "k5", now)).status).toBe(401);
    expect((await kioskLoginHandler(db, { code: "300300", placeId: "cc-train" }, "k5", now)).status).toBe(429);
    expect((await loginHandler(db, { code: "201132" }, "k5", now)).status).toBe(429);
    // 다른 기기는 영향이 없다.
    expect((await kioskLoginHandler(db, { code: "300300", placeId: "cc-train" }, "k6", now)).status).toBe(200);
  });
});

describe("패스 열기: 누가 열 수 있는가", () => {
  it("키오스크나 안내데스크가 아니면 403", async () => {
    const { pass } = await registerWithPass(db, now);
    for (const s of [null, staff, mid, common]) {
      expect((await resolveHandler(db, s, { scanned: pass.token }, dev, now)).status).toBe(403);
      expect((await resolveHandler(db, s, { passNo: pass.passNo }, dev, now)).status).toBe(403);
    }
    // 거절한 요청은 번호 실패로 세지 않는다.
    expect(await logCount("number_fail")).toBe(0);
    expect(await events()).toHaveLength(0);
  });

  it("키오스크와 안내데스크는 연다", async () => {
    const { pass } = await registerWithPass(db, now);
    expect((await resolveHandler(db, kiosk, { scanned: pass.token }, dev, now)).status).toBe(200);
    expect((await resolveHandler(db, desk, { scanned: pass.token }, dev, now)).status).toBe(200);
  });
});

describe("패스 열기: QR 을 찍어서", () => {
  it("QR 값(스티커를 다시 뽑는 데 쓴다)과 안내 내용을 돌려준다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, kiosk, { scanned: passUrl("https://x.app", pass.token) }, dev, now);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["guide", "token"]);
    expect(res.body.token).toBe(pass.token);
    expect((res.body.guide as GuideDto).passNo).toBe(pass.passNo);
  });

  it("대문자 주소, 소문자 주소, 값만 있는 글자를 모두 받는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const url = passUrl("https://journey.example.kr", pass.token);
    for (const scanned of [url, url.toLowerCase(), pass.token, pass.token.toLowerCase(), `  ${url}\n`, `${url.toLowerCase()}/`]) {
      const res = await resolveHandler(db, kiosk, { scanned }, dev, now);
      expect(res.status, scanned).toBe(200);
      expect(res.body.token, scanned).toBe(pass.token);
    }
  });

  it("안내의 길은 그 키오스크가 놓인 자리에서 계산한다", async () => {
    const { pass } = await registerWithPass(db, now, { choices: ["mov_wheelchair_own", "fac_restroom"] });
    const at = async (s: typeof kiosk) => (await resolveHandler(db, s, { scanned: pass.token }, dev, now)).body.guide as GuideDto;

    // 지하 1층 셔틀트레인 도착층: 엘리베이터로 올라가 127번 탑승구 쪽으로 걷는다.
    const fromTrain = await at(kiosk);
    expect(fromTrain.place).toMatchObject({ id: "cc-train", level: -1 });
    expect(fromTrain.routeNote).toBeNull();
    expect(fromTrain.gateRoute?.steps.map((s) => s.kind)).toEqual(["elevator", "walk"]);
    expect(fromTrain.gateRoute?.steps[1]).toMatchObject({
      towardGate: 127,
      meters: 315,
      along: [{ kind: "restroom", nearGate: 123, meters: 195 }],
    });
    expect(fromTrain.pace).toBe("ok");
    expect(fromTrain.facilities[0]).toMatchObject({ kind: "restroom", chosen: true });

    // 108번 탑승구 앞: 같은 층이라 걷기만 한다.
    const from108 = await at(other);
    expect(from108.place?.id).toBe("cc-108");
    expect(from108.gateRoute?.steps.map((s) => s.kind)).toEqual(["walk"]);
    expect(from108.gateRoute?.meters).toBe(570);

    // 제2여객터미널 키오스크: 걸어서 갈 수 없다.
    expect((await at(kioskSession(now, "t2-center"))).routeNote).toBe("other_terminal");
    // 보안검색 전 키오스크: 길을 안내하지 않는다.
    expect(await at(kioskSession(now, "t1-info"))).toMatchObject({ routeNote: "landside", gateRoute: null, facilities: [] });
  });

  it("안내데스크에서 열면 자리가 없어 길과 시설은 비어 있다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, desk, { scanned: pass.token }, dev, now);
    expect(res.body.guide).toMatchObject({ place: null, gateRoute: null, routeNote: "no_place", facilities: [] });
    expect(res.body.token).toBe(pass.token);
  });

  it("세션의 자리가 목록에 없으면 자리가 없는 것으로 본다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, kioskSession(now, "gone"), { scanned: pass.token }, dev, now);
    expect(res.status).toBe(200);
    expect(res.body.guide).toMatchObject({ place: null, routeNote: "no_place" });
  });

  it("패스가 아닌 QR 과 없는 값은 404. 틀린 횟수로 세지 않는다", async () => {
    await registerWithPass(db, now);
    for (const scanned of ["https://naver.com", "7K2M9QXW4HT8VB3N", "https://x.app/p/7K2M9QXW4HT8VB3N", "안녕하세요"]) {
      const res = await resolveHandler(db, kiosk, { scanned }, dev, now);
      expect(res.status, scanned).toBe(404);
      expect(Object.keys(res.body)).toEqual(["error"]);
    }
    expect(await logCount("number_fail")).toBe(0);
  });

  it("여객이 지운 패스와 출발한 편의 패스는 410", async () => {
    await addFlights(db, [flightRow("KE001", "2026-10-05 12:20")], now);
    const erased = await registerWithPass(db, now);
    const departed = await registerWithPass(db, now, { flightNo: "KE001" });
    await eraseHandler(db, { token: erased.pass.token }, dev, now);

    const res = await resolveHandler(db, kiosk, { scanned: erased.pass.token }, dev, now);
    expect(res.status).toBe(410);
    expect(Object.keys(res.body)).toEqual(["error"]);

    // 출발 30분 뒤부터는 삭제 작업이 돌지 않았어도 열리지 않는다.
    expect((await resolveHandler(db, kiosk, { scanned: departed.pass.token }, dev, kst("2026-10-05 12:49"))).status).toBe(200);
    expect((await resolveHandler(db, kiosk, { scanned: departed.pass.token }, dev, kst("2026-10-05 12:50"))).status).toBe(410);
  });
});

describe("패스 열기: 번호를 넣어서", () => {
  it("여섯 자리 번호로 연다. 띄어 쓴 모양도 받는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const spaced = formatPassNo(pass.passNo);
    expect(spaced).toMatch(/^\d{3} \d{3}$/);
    for (const passNo of [pass.passNo, spaced, ` ${pass.passNo.slice(0, 3)}-${pass.passNo.slice(3)} `]) {
      const res = await resolveHandler(db, kiosk, { passNo }, dev, now);
      expect(res.status, passNo).toBe(200);
      expect(res.body.token, passNo).toBe(pass.token);
      expect((res.body.guide as GuideDto).passNo, passNo).toBe(pass.passNo);
    }
    expect(await logCount("number_fail")).toBe(0);
  });

  it("안내데스크에서도 번호로 연다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, desk, { passNo: pass.passNo }, dev, now);
    expect(res.status).toBe(200);
    expect(res.body.guide).toMatchObject({ passNo: pass.passNo, place: null });
  });

  it("여섯 자리가 아니면 400 이고 틀린 횟수로 세지 않는다", async () => {
    for (const passNo of ["12345", "1234567", "", "abcdef", 123456, null, undefined]) {
      expect((await resolveHandler(db, kiosk, { passNo }, dev, now)).status, String(passNo)).toBe(400);
    }
    expect((await resolveHandler(db, kiosk, {}, dev, now)).status).toBe(400);
    expect((await resolveHandler(db, kiosk, { scanned: "   ", passNo: "12" }, dev, now)).status).toBe(400);
    expect(await logCount("number_fail")).toBe(0);
  });

  it("없는 번호는 404 이고 틀린 기록을 남긴다. 어느 기기에서 틀렸는지만 남는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, now);
    expect(res.status).toBe(404);
    expect(Object.keys(res.body)).toEqual(["error"]);
    const logs = await db.query("select zone_id, device_key, action, registration_id from access_logs");
    expect(logs).toEqual([{ zone_id: "kiosk", device_key: dev, action: "number_fail", registration_id: null }]);
    expect(await events()).toHaveLength(0);
  });

  it(`같은 기기에서 ${config.numberLockMaxFails}회 틀리면 맞는 번호도 받지 않는다`, async () => {
    // 키오스크는 여러 여객이 함께 쓰므로 로그인(5회)보다 넉넉하게 둔다.
    expect(config.numberLockMaxFails).toBe(10);
    expect(config.lockMaxFails).toBe(5);
    const { pass } = await registerWithPass(db, now);
    for (let i = 0; i < config.numberLockMaxFails; i++) {
      expect((await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, now)).status).toBe(404);
    }
    const locked = await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, now);
    expect(locked.status).toBe(429);
    expect(hasKey(locked.body, "guide")).toBe(false);
    // 잠긴 동안의 시도는 횟수를 늘리지 않는다.
    await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, now);
    expect(await logCount("number_fail")).toBe(config.numberLockMaxFails);

    // QR 은 맞힐 수 없는 값이라 잠겨 있어도 찍으면 열린다.
    expect((await resolveHandler(db, kiosk, { scanned: pass.token }, dev, now)).status).toBe(200);
    // 다른 기기는 영향이 없고, 시간이 지나면 풀린다.
    expect((await resolveHandler(db, other, { passNo: pass.passNo }, deviceKey("10.0.0.6", "kiosk"), now)).status).toBe(200);
    const later = new Date(now.getTime() + (config.lockMinutes + 1) * 60_000);
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, later)).status).toBe(200);
  });

  it(`${config.numberLockMaxFails - 1}회까지는 잠기지 않는다`, async () => {
    const { pass } = await registerWithPass(db, now);
    for (let i = 0; i < config.numberLockMaxFails - 1; i++) await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, now);
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, now)).status).toBe(200);
  });

  it("번호를 틀린 횟수는 설치 코드와 직원 로그인을 잠그지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    for (let i = 0; i < config.numberLockMaxFails; i++) await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, now);
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, now)).status).toBe(429);
    expect((await kioskLoginHandler(db, { code: "300300", placeId: "cc-train" }, dev, now)).status).toBe(200);
    expect((await loginHandler(db, { code: "201132" }, dev, now)).status).toBe(200);
  });

  it("여객이 지운 패스의 번호는 없는 번호와 똑같이 404 다", async () => {
    const { pass } = await registerWithPass(db, now);
    await eraseHandler(db, { token: pass.token }, dev, now);
    const res = await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, now);
    const unknown = await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, now);
    expect(res).toEqual(unknown);
    expect(res.status).toBe(404);
    expect(await logCount("number_fail")).toBe(2);
  });

  it("출발한 편의 패스 번호도 지워지기 전부터 없는 번호와 똑같이 404 다. 틀린 횟수로는 세지 않는다", async () => {
    await addFlights(db, [flightRow("KE001", "2026-10-05 12:20")], now);
    const { pass } = await registerWithPass(db, now, { flightNo: "KE001" });
    // 출발 29분 뒤까지는 번호로 열린다.
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, kst("2026-10-05 12:49"))).status).toBe(200);

    const later = kst("2026-10-05 12:50"); // 출발 30분 뒤. 삭제 작업은 아직 돌지 않았다.
    const res = await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, later);
    expect(res.status).toBe(404);
    expect(Object.keys(res.body)).toEqual(["error"]);
    // 여객의 잘못이 아니므로 틀린 기록을 남기지 않는다.
    expect(await logCount("number_fail")).toBe(0);
    // 없는 번호와 답이 같아서, 번호만으로는 끝난 패스가 있었는지 알 수 없다.
    expect(res).toEqual(await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo) }, dev, later));
    // 같은 패스를 QR 로 찍으면 끝난 패스라고 알려 준다.
    expect((await resolveHandler(db, kiosk, { scanned: pass.token }, dev, later)).status).toBe(410);
    // 여러 번 넣어도 기기가 잠기지 않는다.
    for (let i = 0; i < config.numberLockMaxFails; i++) await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, later);
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, dev, later)).status).toBe(404);
  });

  it("QR 과 번호가 함께 오면 QR 로 연다", async () => {
    const a = await registerWithPass(db, now);
    const b = await registerWithPass(db, now);
    const res = await resolveHandler(db, kiosk, { scanned: a.pass.token, passNo: b.pass.passNo }, dev, now);
    expect(res.body.token).toBe(a.pass.token);
  });
});

describe("패스 열기: 안내 열람 기록", () => {
  it("키오스크에서 안내를 보려고 열면 열람을 한 건 남긴다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await resolveHandler(db, kiosk, { scanned: pass.token, purpose: "guide" }, dev, now);
    expect(res.status).toBe(200);
    expect(await events()).toEqual([
      { kind: "guide_open", route: "kiosk", adapted: true, place_id: "cc-train", device_key: dev },
    ]);
  });

  it("번호로 열어도 한 건이다. 안내 방식을 켜지 않은 여객은 그렇게 남는다", async () => {
    const { pass } = await registerWithPass(db, now, { choices: ["mov_no_stairs"] });
    await resolveHandler(db, kiosk, { passNo: pass.passNo, purpose: "guide" }, dev, now);
    expect(await events()).toEqual([
      { kind: "guide_open", route: "kiosk", adapted: false, place_id: "cc-train", device_key: dev },
    ]);
  });

  it("목적을 주지 않거나 다른 목적이면 남기지 않는다. 스티커를 다시 뽑으려고 연 것은 열람이 아니다", async () => {
    const { pass } = await registerWithPass(db, now);
    await resolveHandler(db, kiosk, { scanned: pass.token }, dev, now);
    await resolveHandler(db, kiosk, { scanned: pass.token, purpose: "print" }, dev, now);
    await resolveHandler(db, kiosk, { scanned: pass.token, purpose: true }, dev, now);
    expect(await events()).toHaveLength(0);
  });

  it("안내데스크에서 연 것은 남기지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    await resolveHandler(db, desk, { scanned: pass.token, purpose: "guide" }, dev, now);
    expect(await events()).toHaveLength(0);
  });

  it("열지 못한 것은 남기지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    await resolveHandler(db, kiosk, { scanned: "7K2M9QXW4HT8VB3N", purpose: "guide" }, dev, now);
    await resolveHandler(db, kiosk, { passNo: wrongNo(pass.passNo), purpose: "guide" }, dev, now);
    await eraseHandler(db, { token: pass.token }, dev, now);
    await resolveHandler(db, kiosk, { scanned: pass.token, purpose: "guide" }, dev, now);
    expect(await events()).toHaveLength(0);
  });

  it("안내를 다시 읽는 것(guideHandler)은 열람으로 세지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    await resolveHandler(db, kiosk, { scanned: pass.token, purpose: "guide" }, dev, now);
    for (let i = 0; i < 3; i++) await guideHandler(db, pass.token, kiosk, now);
    expect(await events()).toHaveLength(1);
  });
});

describe("키오스크에서 직원 부르기", () => {
  const staffList = async () => (await callsHandler(db, mid, now)).body.calls as CallDto[];

  it("키오스크가 아니면 부를 수도, 볼 수도, 거둘 수도 없다", async () => {
    const made = await callHandler(db, other, {}, now);
    const id = made.body.id as string;
    for (const s of [null, staff, desk, common, sessionOf(now, { zoneId: "kiosk", isKiosk: true, placeId: null })]) {
      expect((await callHandler(db, s, {}, now)).status).toBe(403);
      expect((await callStateHandler(db, s, id)).status).toBe(403);
      expect((await callCancelHandler(db, s, id, now)).status).toBe(403);
    }
    expect(await db.query("select 1 from calls")).toHaveLength(1);
    expect((await callStateHandler(db, other, id)).body.state).toBe("waiting");
  });

  it("부르면 호출 id 와 상태만 돌려주고, 그 자리를 맡은 구역 직원 화면에 뜬다", async () => {
    const res = await callHandler(db, other, { screen: "register" }, now);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["id", "state"]);
    expect(res.body.state).toBe("waiting");
    expect(await staffList()).toMatchObject([
      { id: res.body.id, mine: true, screen: "register", place: "탑승동 3층 108번 탑승구 앞", pass: null },
    ]);
  });

  it("화면을 알려 주지 않으면 안내를 보다 부른 것으로 둔다", async () => {
    await callHandler(db, other, {}, now);
    await callHandler(db, kiosk, { screen: "elsewhere" }, now);
    expect((await staffList()).map((c) => c.screen)).toEqual(["guide", "guide"]);
  });

  it("여러 번 눌러도 같은 호출이다", async () => {
    const a = await callHandler(db, other, {}, now);
    const b = await callHandler(db, other, {}, new Date(now.getTime() + 5000));
    expect(b.body).toEqual(a.body);
    expect(await db.query("select 1 from calls")).toHaveLength(1);
  });

  it("패스를 찍은 뒤에 부르면 직원 화면에 고른 항목과 항공편이 함께 뜬다", async () => {
    const { pass } = await registerWithPass(db, now, { choices: ["gd_voice", "mov_wheelchair_need"] });
    await callHandler(db, other, { token: pass.token, screen: "guide" }, now);
    const [c] = await staffList();
    expect(c.pass).toMatchObject({ choices: ["소리 안내", "휠체어 필요"], flight: { flightNo: "KE123", gate: 127 } });
  });

  it("패스 없이 불렀다가 패스를 찍고 다시 부르면 같은 호출에 패스가 붙는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const first = await callHandler(db, other, { screen: "register" }, now);
    expect((await staffList())[0].pass).toBeNull();
    const second = await callHandler(db, other, { token: pass.token }, now);
    expect(second.body.id).toBe(first.body.id);
    expect((await staffList())[0]).toMatchObject({ screen: "guide", pass: { lang: "ko" } });
  });

  it("없는 값이나 끝난 패스의 값을 보내도 호출은 생긴다. 패스만 붙지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    await eraseHandler(db, { token: pass.token }, dev, now);
    expect((await callHandler(db, other, { token: pass.token }, now)).status).toBe(200);
    expect((await callHandler(db, kiosk, { token: "7K2M9QXW4HT8VB3N" }, now)).status).toBe(200);
    expect((await callHandler(db, kioskSession(now, "cc-125"), { token: 42 }, now)).status).toBe(200);
    for (const c of await staffList()) expect(c.pass).toBeNull();
  });

  it("세션의 자리가 목록에 없으면 400", async () => {
    const res = await callHandler(db, kioskSession(now, "gone"), {}, now);
    expect(res.status).toBe(400);
    expect(await db.query("select 1 from calls")).toHaveLength(0);
  });

  it("직원이 받으면 키오스크에서 상태가 바뀐 것을 본다", async () => {
    const made = await callHandler(db, other, {}, now);
    const id = made.body.id as string;
    expect((await callStateHandler(db, other, id)).body).toEqual({ id, state: "waiting" });
    await callActionHandler(db, mid, id, { action: "accept" }, now);
    expect((await callStateHandler(db, other, id)).body).toEqual({ id, state: "accepted" });
    await callActionHandler(db, mid, id, { action: "done" }, now);
    expect((await callStateHandler(db, other, id)).body).toEqual({ id, state: "done" });
  });

  it("다른 키오스크의 호출은 볼 수도 거둘 수도 없다", async () => {
    const made = await callHandler(db, other, {}, now);
    const id = made.body.id as string;
    expect((await callStateHandler(db, kiosk, id)).status).toBe(404);
    expect((await callCancelHandler(db, kiosk, id, now)).status).toBe(404);
    expect((await callStateHandler(db, other, id)).body.state).toBe("waiting");
    expect((await callStateHandler(db, other, "nope")).status).toBe(404);
    expect((await callCancelHandler(db, other, "nope", now)).status).toBe(404);
  });

  it("여객이 거두면 cancelled 가 되고, 다시 거둬도 같은 답이다", async () => {
    const made = await callHandler(db, other, {}, now);
    const id = made.body.id as string;
    expect(await callCancelHandler(db, other, id, now)).toEqual({ status: 200, body: { id, state: "cancelled" } });
    expect(await callCancelHandler(db, other, id, now)).toEqual({ status: 200, body: { id, state: "cancelled" } });
    expect((await callActionHandler(db, mid, id, { action: "accept" }, now)).status).toBe(409);
    // 거둔 뒤에 다시 누르면 새 호출이다.
    expect((await callHandler(db, other, {}, now)).body.id).not.toBe(id);
  });

  it("직원이 마친 호출을 거두려 해도 마친 상태 그대로다", async () => {
    const made = await callHandler(db, other, {}, now);
    const id = made.body.id as string;
    await callActionHandler(db, mid, id, { action: "done" }, now);
    expect((await callCancelHandler(db, other, id, now)).body).toEqual({ id, state: "done" });
  });
});

describe("키오스크에서 등록하기", () => {
  const body = (over: Record<string, unknown> = {}) => {
    const i = regInput();
    return { flightDate: i.flightDate, flightNo: i.flightNo, choices: i.choices, lang: "ko", consent: true, startedAt: i.startedAt.toISOString(), ...over };
  };

  it("키오스크에서 등록하고, 받은 패스를 그 자리에서 바로 열어 안내를 본다", async () => {
    await eventHandler(db, { kind: "reg_start", adapted: true }, kiosk, dev, now);
    const reg = await registerHandler(db, body(), kiosk, dev, now);
    expect(reg.status).toBe(200);
    const [row] = await db.query<{ route: string; name: string | null }>("select route, name from registrations");
    expect(row).toEqual({ route: "kiosk", name: null });

    const opened = await resolveHandler(db, kiosk, { passNo: reg.body.passNo, purpose: "guide" }, dev, now);
    expect(opened.status).toBe(200);
    expect(opened.body.token).toBe(reg.body.token);
    expect((await events()).map((e) => [e.kind, e.route, e.place_id])).toEqual([
      ["reg_start", "kiosk", "cc-train"],
      ["reg_done", "kiosk", "cc-train"],
      ["guide_open", "kiosk", "cc-train"],
    ]);
  });
});

describe("응답에 이름이 없다", () => {
  it("공개·키오스크·직원 경로의 어느 응답에도 name 칸이 없고, 등록의 이름 칸은 비어 있다", async () => {
    const body = { ...regInput(), startedAt: regInput().startedAt.toISOString(), name: "홍길동" };
    const web = deviceKey("203.0.113.7", "phone");
    const responses: Record<string, unknown>[] = [];
    const keep = <T extends { body: Record<string, unknown> }>(r: T): T => {
      responses.push(r.body);
      return r;
    };

    keep(await searchFlightsHandler(db, "KE", now));
    keep(placesHandler());
    const reg = keep(await registerHandler(db, body, null, web, now));
    const token = reg.body.token as string;
    keep(await registerHandler(db, body, kiosk, dev, now));
    keep(await registerHandler(db, body, desk, dev, now, true));
    keep(await eventHandler(db, { kind: "reg_start" }, null, web, now));
    keep(await guideHandler(db, token, null, now));
    keep(await guideHandler(db, token, kiosk, now));
    keep(await resolveHandler(db, kiosk, { scanned: token, purpose: "guide" }, dev, now));
    keep(await resolveHandler(db, desk, { passNo: reg.body.passNo }, dev, now));
    const call = keep(await callHandler(db, other, { token }, now));
    keep(await callStateHandler(db, other, call.body.id as string));
    keep(await callsHandler(db, mid, now));
    keep(await callsHandler(db, desk, now));
    keep(await callActionHandler(db, mid, call.body.id as string, { action: "accept" }, now));
    keep(await zonesHandler(db, common));
    keep(await summaryHandler(db, desk, now));
    keep(await callCancelHandler(db, other, call.body.id as string, now));
    keep(await eraseHandler(db, { token }, web, now));
    keep(await guideHandler(db, token, null, now));

    expect(responses).toHaveLength(20);
    for (const r of responses) {
      expect(hasKey(r, "name"), JSON.stringify(r).slice(0, 80)).toBe(false);
      expect(JSON.stringify(r)).not.toContain("홍길동");
    }
    const rows = await db.query<{ name: string | null }>("select name from registrations");
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.name).toBeNull();
  });
});
