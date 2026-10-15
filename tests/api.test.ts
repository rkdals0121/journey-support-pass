import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zoneName } from "@/lib/api/dto";
import { resolveHandler } from "@/lib/api/kiosk";
import {
  claimRegistration,
  destinationsHandler,
  eraseHandler,
  eventHandler,
  guideHandler,
  lookupPass,
  registerHandler,
  searchFlightsHandler,
} from "@/lib/api/public";
import {
  callActionHandler,
  callsHandler,
  deskEraseHandler,
  summaryHandler,
  switchZoneHandler,
  zonesHandler,
  type CallDto,
} from "@/lib/api/staff";
import { deviceKey, forgetAttempt, readSession } from "@/lib/auth";
import { cancelCall, createCall } from "@/lib/calls";
import { config } from "@/lib/config";
import type { Db } from "@/lib/db";
import { recordPoll } from "@/lib/flights/ingest";
import type { GuideDto } from "@/lib/guide";
import type { Summary } from "@/lib/metrics";
import { passUrl } from "@/lib/passes";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import {
  addFlights,
  CHOICES,
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
const staff = sessionOf(now); // 탑승동 끝단
const mid = sessionOf(now, { zoneId: "cc-mid" }); // 탑승동 중간. cc-108 키오스크의 호출을 맡는다
const common = commonSession(now);
const desk = deskSession(now);
const kiosk = kioskSession(now, "cc-108");
const web = deviceKey("203.0.113.7", "phone");

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await resetData(db);
  await addFlights(
    db,
    [flightRow("KE123", "2026-10-05 14:30", { gate: 127 }), flightRow("KE123", "2026-10-06 14:30", { gate: null })],
    now,
  );
});

/** 등록 화면이 보내는 본문. */
const body = (over: Record<string, unknown> = {}) => {
  const i = regInput();
  return {
    flightDate: i.flightDate,
    flightNo: i.flightNo,
    choices: i.choices,
    lang: i.lang,
    consent: true,
    startedAt: i.startedAt.toISOString(),
    editCount: 0,
    ...over,
  };
};

const logCount = async (action: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from access_logs where action = $1", [action]))[0].n;
const eventRows = (kind: string) =>
  db.query<{ route: string; adapted: boolean; place_id: string | null; value: number | null; device_key: string | null }>(
    "select route, adapted, place_id, value, device_key from events where kind = $1 order by id",
    [kind],
  );
const regRows = () =>
  db.query<{ route: string; name: string | null; lang: string; needs: string[]; status: string }>(
    "select route, name, lang, needs, status from registrations order by submitted_at, id",
  );

describe("편명 검색", () => {
  it("모레 편은 미리 받아 두어도 검색·도시 목록에 나오지 않는다", async () => {
    await addFlights(db, [flightRow("ZZ777", "2026-10-07 09:00", { destCode: "ULN", destName: "울란바토르" })], now);
    expect((await searchFlightsHandler(db, "ZZ777", now)).body.flights).toEqual([]);
    expect((await searchFlightsHandler(db, "", now, "울란바토르")).body.flights).toEqual([]);
    const list = (await destinationsHandler(db, now)).body.destinations as { city: string }[];
    expect(list.some((d) => d.city === "울란바토르")).toBe(false);
  });

  it("탑승구를 돌려주지 않는다. 오늘인지 내일인지와 시각만 준다", async () => {
    const res = await searchFlightsHandler(db, "ke123", now);
    expect(res.status).toBe(200);
    expect(res.body.flights).toEqual([
      {
        flightDate: "2026-10-05",
        flightNo: "KE123",
        airline: "대한항공",
        destName: "뉴욕",
        destCode: "JFK",
        day: "today",
        time: "14:30",
        cancelled: false,
      },
      {
        flightDate: "2026-10-06",
        flightNo: "KE123",
        airline: "대한항공",
        destName: "뉴욕",
        destCode: "JFK",
        day: "tomorrow",
        time: "14:30",
        cancelled: false,
      },
    ]);
    expect(hasKey(res.body, "gate")).toBe(false);
    expect(hasKey(res.body, "label")).toBe(false);
  });

  it("결항 편은 결항이라고 알려 주고, 지연 편은 바뀐 시각을 준다", async () => {
    await addFlights(
      db,
      [
        flightRow("CX9", "2026-10-05 16:00", { status: "결항" }),
        flightRow("DL9", "2026-10-05 16:00", { estAt: kst("2026-10-05 17:20"), status: "지연" }),
      ],
      now,
    );
    const first = async (q: string) => ((await searchFlightsHandler(db, q, now)).body.flights as Record<string, unknown>[])[0];
    expect(await first("CX9")).toMatchObject({ cancelled: true, time: "16:00" });
    expect(await first("DL9")).toMatchObject({ cancelled: false, time: "17:20" });
  });

  it("편명을 몰라도 도착 도시 이름, 영어 도시 이름, 공항 코드, 편명의 숫자로 찾는다", async () => {
    const nos = async (q: string) => ((await searchFlightsHandler(db, q, now)).body.flights as { flightNo: string }[]).map((f) => f.flightNo);
    expect(await nos("뉴욕")).toContain("KE123");
    expect(await nos("new york")).toContain("KE123");
    expect(await nos("JFK")).toContain("KE123");
    expect(await nos("123")).toContain("KE123");
    expect(await nos("0123")).toContain("KE123");
    // 없는 곳, 한 글자, 뜻 없는 글자는 빈 목록이다. 오류가 나지 않는다.
    expect(await nos("없는도시")).toEqual([]);
    expect(await nos("뉴")).toEqual([]);
    expect(await nos("zzzzzz")).toEqual([]);
    expect(await nos("%")).toEqual([]);
  });

  it("도착 도시 목록: 공항이 여럿인 도시는 하나로 묶고, 떠난 편만 있는 도시는 뺀다", async () => {
    await addFlights(
      db,
      [
        flightRow("BX164", "2026-10-05 15:00", { destName: "도쿄/나리타", destCode: "NRT" }),
        flightRow("LJ201", "2026-10-05 16:00", { destName: "도쿄/나리타", destCode: "NRT" }),
        flightRow("KE2101", "2026-10-06 09:00", { destName: "도쿄/하네다", destCode: "HND" }),
        flightRow("ZZ1", "2026-10-05 09:00", { destName: "이미떠난곳", destCode: "ZZZ" }),
        flightRow("QQ7", "2026-10-05 17:00", { destName: "모르는곳", destCode: "QQQ" }),
      ],
      now,
    );
    const res = await destinationsHandler(db, now);
    expect(res.status).toBe(200);
    const list = res.body.destinations as { city: string; en: string; count: number }[];
    expect(list.find((d) => d.city === "도쿄")).toEqual({ city: "도쿄", en: "Tokyo", count: 3 });
    expect(list.find((d) => d.city === "뉴욕")).toMatchObject({ en: "New York", count: 2 });
    // 영어 이름을 모르는 공항은 공항 코드를 보여 준다.
    expect(list.find((d) => d.city === "모르는곳")).toMatchObject({ en: "QQQ" });
    expect(list.some((d) => d.city === "이미떠난곳")).toBe(false);
    // 목록의 도시 이름으로 다시 찾으면 그 도시의 편이 모두 나온다.
    const found = ((await searchFlightsHandler(db, "도쿄", now)).body.flights as { flightNo: string }[]).map((f) => f.flightNo);
    expect(found.sort()).toEqual(["BX164", "KE2101", "LJ201"]);
  });

  it("도시 목록에서 고른 도시는 이름이 정확히 같은 곳만 찾는다. 한 글자 도시도 된다", async () => {
    await addFlights(
      db,
      [
        flightRow("LJ641", "2026-10-05 15:00", { destName: "괌", destCode: "GUM" }),
        flightRow("7C3102", "2026-10-06 09:00", { destName: "괌", destCode: "GUM" }),
        flightRow("CA124", "2026-10-05 16:00", { destName: "난징", destCode: "NKG" }),
        flightRow("ZH600", "2026-10-05 17:00", { destName: "난징루", destCode: "XXX" }),
        flightRow("BX164", "2026-10-05 18:00", { destName: "도쿄/나리타", destCode: "NRT" }),
        flightRow("KE2101", "2026-10-05 19:00", { destName: "도쿄/하네다", destCode: "HND" }),
      ],
      now,
    );
    const to = async (city: string) => ((await searchFlightsHandler(db, "", now, city)).body.flights as { flightNo: string }[]).map((f) => f.flightNo).sort();
    expect(await to("괌")).toEqual(["7C3102", "LJ641"]);
    // 이름이 다른 도시 이름에 들어 있어도 섞이지 않는다.
    expect(await to("난징")).toEqual(["CA124"]);
    // 공항이 여럿인 도시는 모두 나온다.
    expect(await to("도쿄")).toEqual(["BX164", "KE2101"]);
    expect(await to("없는곳")).toEqual([]);
    // 목록에 나온 도시는 모두 이 방법으로 다시 찾을 수 있어야 한다.
    const list = (await destinationsHandler(db, now)).body.destinations as { city: string; count: number }[];
    for (const d of list) expect((await to(d.city)).length, d.city).toBe(d.count);
  });

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
        flightRow("TW900", "2026-10-05 09:00"),
        flightRow("TW901", "2026-10-05 13:00", { status: "출발" }),
      ],
      now,
    );
    const flights = (await searchFlightsHandler(db, "TW", now)).body.flights as { flightNo: string }[];
    expect(flights).toHaveLength(8);
    expect(flights.map((f) => f.flightNo)).not.toContain("TW900");
    expect((await searchFlightsHandler(db, "TW90", now)).body.flights).toEqual([]);
  });
});

describe("등록", () => {
  it("등록하면 바로 패스가 만들어지고, 고유 일련 번호와 QR 값만 돌려준다", async () => {
    const res = await registerHandler(db, body(), null, web, now);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["passNo", "token"]);
    expect(res.body.passNo).toMatch(/^\d{6}$/);
    expect(res.body.token).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);

    expect(await regRows()).toEqual([{ route: "web", name: null, lang: "ko", needs: CHOICES, status: "active" }]);
    // 그 QR 값으로 바로 안내가 열린다.
    const guide = await guideHandler(db, res.body.token as string, null, now);
    expect((guide.body.guide as GuideDto).passNo).toBe(res.body.passNo);
  });

  it("이름을 넣어 보내도 저장하지 않는다", async () => {
    const res = await registerHandler(db, body({ name: "홍길동", categories: ["cat_senior"] }), null, web, now);
    expect(res.status).toBe(200);
    expect((await regRows())[0].name).toBeNull();
    expect(JSON.stringify(await db.query("select * from registrations"))).not.toContain("홍길동");
  });

  it("본문에 다른 등록 경로를 넣어 보내도 web 으로 저장한다", async () => {
    await registerHandler(db, body({ route: "assisted" }), null, web, now);
    await registerHandler(db, body({ route: "kiosk" }), staff, web, now);
    expect((await regRows()).map((r) => r.route)).toEqual(["web", "web"]);
  });

  it("키오스크 기기에서 오면 kiosk 로 저장한다", async () => {
    const res = await registerHandler(db, body(), kiosk, "kiosk-dev", now);
    expect(res.status).toBe(200);
    expect((await regRows())[0].route).toBe("kiosk");
  });

  it("직원이 대신 넣는 등록은 안내데스크만 할 수 있다", async () => {
    // 로그인이 풀린 안내데스크는 401 을 보고 다시 로그인하러 간다. 로그인했지만 안내데스크가 아니면 403.
    expect(await registerHandler(db, body(), null, "dev", now, true)).toEqual({ status: 401, body: { error: "로그인이 필요합니다" } });
    for (const s of [staff, mid, common, kiosk]) {
      const res = await registerHandler(db, body(), s, "dev", now, true);
      expect(res.status).toBe(403);
    }
    expect(await regRows()).toHaveLength(0);

    const res = await registerHandler(db, body(), desk, "desk-dev", now, true);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["passNo", "token"]);
    expect((await regRows())[0].route).toBe("assisted");
  });

  it("안내데스크 기기에서 여객이 스스로 한 등록은 web 이다", async () => {
    await registerHandler(db, body(), desk, "desk-dev", now);
    expect((await regRows())[0].route).toBe("web");
  });

  it("화면 언어를 남긴다", async () => {
    await registerHandler(db, body({ lang: "en" }), null, web, now);
    await registerHandler(db, body({ lang: "jp" }), null, web, now);
    expect((await regRows()).map((r) => r.lang).sort()).toEqual(["en", "ko"]);
  });

  it("동의하지 않거나 값이 맞지 않으면 400 이고 아무것도 남기지 않는다", async () => {
    // 영어 화면이 상황에 맞는 문구를 고를 수 있게 까닭(code)도 함께 온다.
    const bad: [Record<string, unknown>, string][] = [
      [body({ consent: false }), "consent"],
      [body({ consent: "true" }), "consent"],
      [body({ choices: ["nope"] }), "choices"],
      [body({ choices: ["stf_call", "stf_self"] }), "choices"],
      [body({ flightNo: "ZZ999" }), "flight"],
      [body({ flightNo: 123 }), "flight"],
      [body({ flightDate: undefined }), "flight"],
      [{}, "consent"],
    ];
    for (const [b, code] of bad) {
      const res = await registerHandler(db, b, null, web, now);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    }
    expect(await regRows()).toHaveLength(0);
    expect(await db.query("select 1 from passes")).toHaveLength(0);
    expect(await logCount("register")).toBe(0);
    expect(await eventRows("reg_done")).toHaveLength(0);
  });

  it("이미 떠난 편으로는 등록할 수 없다", async () => {
    await addFlights(db, [flightRow("KE001", "2026-10-05 09:00"), flightRow("KE888", "2026-10-05 12:30", { status: "출발" })], now);
    for (const flightNo of ["KE001", "KE888"]) {
      const res = await registerHandler(db, body({ flightNo }), null, web, now);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("이미 출발한 편");
      expect(res.body.code).toBe("departed");
    }
  });

  it("오늘과 내일 편이 아니면 등록할 수 없다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-07 14:30"), flightRow("KE123", "2026-10-03 23:50")], now);
    for (const flightDate of ["2026-10-07", "2026-10-03"]) {
      const res = await registerHandler(db, body({ flightDate }), null, web, now);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "오늘과 내일 출발하는 편만 등록할 수 있습니다", code: "date" });
    }
    expect(await regRows()).toHaveLength(0);
    expect((await registerHandler(db, body({ flightDate: "2026-10-06" }), null, web, now)).status).toBe(200);
  });

  it("어제 날짜 편도 아직 떠나지 않았으면(자정을 넘겨 늦어짐) 찾고 등록한다. 떠났으면 받지 않는다", async () => {
    const night = kst("2026-10-05 00:20");
    await addFlights(
      db,
      [
        // 어제 23:40 예정, 01:10 으로 늦어짐. 아직 떠나지 않았다.
        flightRow("KE701", "2026-10-04 23:40", { estAt: kst("2026-10-05 01:10"), status: "지연" }),
        // 어제 23:50 예정, 00:10 으로 늦어져 이미 떠났다.
        flightRow("KE702", "2026-10-04 23:50", { estAt: kst("2026-10-05 00:10") }),
      ],
      night,
    );
    const found = (await searchFlightsHandler(db, "KE70", night)).body.flights as Record<string, unknown>[];
    // 실제로 떠나는 날(오늘)과 바뀐 시각으로 보여 준다.
    expect(found).toEqual([expect.objectContaining({ flightNo: "KE701", flightDate: "2026-10-04", day: "today", time: "01:10" })]);
    const res = await registerHandler(db, body({ flightNo: "KE701", flightDate: "2026-10-04" }), null, web, night);
    expect(res.status).toBe(200);
    const gone = await registerHandler(db, body({ flightNo: "KE702", flightDate: "2026-10-04" }), null, web, night);
    expect(gone.status).toBe(400);
    expect(gone.body.code).toBe("departed");
  });

  it("오늘 밤 편이 자정을 넘겨 늦어지면 '내일'로 보여 준다", async () => {
    await addFlights(db, [flightRow("KE703", "2026-10-05 23:40", { estAt: kst("2026-10-06 00:15"), status: "지연" })], now);
    const [f] = (await searchFlightsHandler(db, "KE703", now)).body.flights as Record<string, unknown>[];
    expect(f).toMatchObject({ flightDate: "2026-10-05", day: "tomorrow", time: "00:15" });
  });

  it("고른 항목에 글자가 아닌 값이 섞여 오면 글자만 남겨 받는다", async () => {
    const res = await registerHandler(db, body({ choices: ["gd_large", 7, null, "fac_rest"] }), null, web, now);
    expect(res.status).toBe(200);
    expect((await regRows())[0].needs).toEqual(["gd_large", "fac_rest"]);
  });

  it("읽을 수 없는 시작 시각은 작성 시간 0 으로 남긴다", async () => {
    await registerHandler(db, body({ startedAt: "어제" }), null, web, now);
    await registerHandler(db, body({ startedAt: undefined }), null, web, now);
    const rows = await db.query<{ started_at: Date; submitted_at: Date }>("select started_at, submitted_at from registrations");
    for (const r of rows) expect(r.started_at).toEqual(r.submitted_at);
  });

  it("등록한 기록을 남긴다. 접속 주소는 해시로만 남는다", async () => {
    await registerHandler(db, body(), null, web, now);
    await registerHandler(db, body(), desk, "desk-dev", now, true);
    const logs = await db.query<{ zone_id: string | null; device_key: string; registration_id: string | null }>(
      "select zone_id, device_key, registration_id from access_logs where action = 'register' order by id",
    );
    expect(logs.map((l) => [l.zone_id, l.device_key])).toEqual([
      [null, web],
      ["desk-t1", "desk-dev"],
    ]);
    for (const l of logs) expect(l.registration_id).not.toBeNull();
    expect(web).not.toContain("203.0.113.7");
  });
});

describe("등록 횟수 제한", () => {
  const key = (ua: string) => deviceKey("203.0.113.7", ua);
  /** 지금 받을 수 있는지만 본다. 자리를 잡아 본 기록은 바로 지워 다음 셈에 섞이지 않게 한다. */
  const allowed = async (k: string, at: Date) => {
    const claim = await claimRegistration(db, k, at);
    if (claim) await forgetAttempt(db, claim);
    return claim !== null;
  };

  it(`같은 접속 주소에서 ${config.registerWindowMin}분에 ${config.registerMaxPerIp}건을 넘기면 막는다. 브라우저 표시를 바꿔도 같다`, async () => {
    for (let i = 0; i < config.registerMaxPerIp; i++) {
      expect((await registerHandler(db, body(), null, key(`ua-${i}`), now)).status).toBe(200);
    }
    const refused = await registerHandler(db, body(), null, key("ua-new"), now);
    expect(refused).toEqual({ status: 429, body: { error: "잠시 후 다시 시도해 주세요", code: "rate" } });
    // 거부된 등록은 저장되지 않고, 거부된 시도는 횟수로 남지 않는다.
    expect(await regRows()).toHaveLength(config.registerMaxPerIp);
    expect(await db.query("select 1 from passes")).toHaveLength(config.registerMaxPerIp);
    expect(await logCount("register")).toBe(config.registerMaxPerIp);

    // 다른 접속 주소는 영향이 없고, 시간이 지나면 다시 받는다.
    expect(await allowed(deviceKey("198.51.100.9", "ua-0"), now)).toBe(true);
    expect((await registerHandler(db, body(), null, deviceKey("198.51.100.9", "ua-0"), now)).status).toBe(200);
    const later = new Date(now.getTime() + config.registerWindowMin * 60_000);
    expect(await allowed(key("ua-new"), later)).toBe(true);
    expect((await registerHandler(db, body(), null, key("ua-new"), later)).status).toBe(200);
  });

  it("한도 안의 등록이 한꺼번에 몰려와도 모두 받는다", async () => {
    // 먼저 적고 세면 몰려온 기록이 서로의 셈에 들어간다. 그래도 한도 안이면 하나도 막지 않아야 한다.
    const n = config.registerMaxPerIp - 5;
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) => registerHandler(db, body(), null, key(`under-${i}`), now)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(n).fill(200));
    expect(await regRows()).toHaveLength(n);
    expect(await logCount("register")).toBe(n);
  });

  it("한꺼번에 몰려와도 한도를 넘겨 받지 않는다 (먼저 적고 센다)", async () => {
    // 세고 나서 적으면 몰려온 요청이 모두 "아직 0건"을 보고 지나가, 여기서 한도보다 많이 받는다.
    const results = await Promise.all(
      Array.from({ length: config.registerMaxPerIp + 10 }, (_, i) => registerHandler(db, body(), null, key(`burst-${i}`), now)),
    );
    const accepted = results.filter((r) => r.status === 200).length;
    expect(accepted).toBeLessThanOrEqual(config.registerMaxPerIp);
    expect(results.every((r) => r.status === 200 || r.status === 429)).toBe(true);
    expect(await regRows()).toHaveLength(accepted);
    expect(await logCount("register")).toBeLessThanOrEqual(config.registerMaxPerIp);
    // 거부된 시도의 기록은 지워져, 받은 등록만 횟수로 남는다. 모두 등록에 이어져 있다.
    const logs = await db.query<{ registration_id: string | null }>(
      "select registration_id from access_logs where action = 'register'",
    );
    expect(logs).toHaveLength(accepted);
    for (const l of logs) expect(l.registration_id).not.toBeNull();
    // 한도가 남아 있으면 그 뒤의 등록은 받는다.
    if (accepted < config.registerMaxPerIp) {
      expect((await registerHandler(db, body(), null, key("after"), now)).status).toBe(200);
    }
  });

  it(`모든 주소를 합해 ${config.registerMaxAll}건을 넘기면 다른 주소의 휴대전화 등록도 막는다`, async () => {
    await db.query(
      `insert into access_logs (at, zone_id, device_key, action)
       select $1, null, '10.0.' || g || ':ua', 'register' from generate_series(1, $2::int) g`,
      [now, config.registerMaxAll],
    );
    expect(await allowed(deviceKey("198.51.100.9", "ua"), now)).toBe(false);
    expect((await registerHandler(db, body(), null, deviceKey("198.51.100.9", "ua"), now)).status).toBe(429);
    // 거부된 시도는 남지 않는다.
    expect(await logCount("register")).toBe(config.registerMaxAll);
  });

  it("받지 못한 등록(값이 틀림)은 횟수로 세지 않는다", async () => {
    for (let i = 0; i < config.registerMaxPerIp; i++) {
      expect((await registerHandler(db, body({ consent: false }), null, key(`ua-${i}`), now)).status).toBe(400);
    }
    expect(await logCount("register")).toBe(0);
    expect((await registerHandler(db, body(), null, key("ua-ok"), now)).status).toBe(200);
  });

  it("키오스크와 안내데스크의 대신 입력은 횟수를 막지 않는다", async () => {
    for (let i = 0; i < config.registerMaxPerIp; i++) await registerHandler(db, body(), null, key(`ua-${i}`), now);
    expect(await allowed(key("kiosk"), now)).toBe(false);

    expect((await registerHandler(db, body(), kiosk, key("kiosk"), now)).status).toBe(200);
    expect((await registerHandler(db, body(), desk, key("desk"), now, true)).status).toBe(200);
    // 같은 주소의 휴대전화는 여전히 막힌다.
    expect((await registerHandler(db, body(), null, key("phone"), now)).status).toBe(429);
    expect((await registerHandler(db, body(), desk, key("desk"), now)).status).toBe(429);
  });

  it("키오스크와 안내데스크에서 받은 등록은 휴대전화 등록의 횟수로 세지 않는다", async () => {
    // 공항 안에서는 키오스크와 여객의 휴대전화가 같은 접속 주소로 나갈 수 있다.
    for (let i = 0; i < config.registerMaxPerIp; i++) await registerHandler(db, body(), kiosk, key("kiosk"), now);
    for (let i = 0; i < 3; i++) await registerHandler(db, body(), desk, key("desk"), now, true);
    expect(await logCount("register")).toBe(config.registerMaxPerIp + 3);
    expect(await allowed(key("phone"), now)).toBe(true);

    // 휴대전화 등록은 한도까지 그대로 받는다.
    for (let i = 0; i < config.registerMaxPerIp; i++) {
      expect((await registerHandler(db, body(), null, key(`ua-${i}`), now)).status).toBe(200);
    }
    expect((await registerHandler(db, body(), null, key("phone"), now)).status).toBe(429);
  });

  it("키오스크 한 대가 한도보다 많이 받아도 계속 받는다", async () => {
    for (let i = 0; i < config.registerMaxPerIp + 3; i++) {
      expect((await registerHandler(db, body(), kiosk, key("kiosk"), now)).status).toBe(200);
    }
    expect((await regRows()).every((r) => r.route === "kiosk")).toBe(true);
  });
});

describe("등록 완료 기록", () => {
  it("휴대전화와 키오스크에서 한 등록은 완료로 센다. 키오스크는 놓인 자리도 남긴다", async () => {
    await registerHandler(db, body(), null, web, now);
    await registerHandler(db, body(), kiosk, "kiosk-dev", now);
    expect(await eventRows("reg_done")).toEqual([
      { route: "web", adapted: true, place_id: null, value: null, device_key: web },
      { route: "kiosk", adapted: true, place_id: "cc-108", value: null, device_key: "kiosk-dev" },
    ]);
  });

  it("직원이 대신 넣은 등록은 완료로 세지 않는다", async () => {
    await registerHandler(db, body(), desk, "desk-dev", now, true);
    expect(await regRows()).toHaveLength(1);
    expect(await db.query("select 1 from events")).toHaveLength(0);
  });

  it("시작할 때의 값을 보내지 않으면 고른 항목에서 안내 방식을 켰는지 본다", async () => {
    await registerHandler(db, body({ choices: ["gd_voice"] }), null, web, now);
    await registerHandler(db, body({ choices: ["mov_no_stairs", "fac_rest"] }), null, web, now);
    await registerHandler(db, body({ choices: [] }), null, web, now);
    expect((await eventRows("reg_done")).map((e) => e.adapted)).toEqual([true, false, false]);
  });

  it("시작할 때의 값을 보내면 그 값으로 센다. 고른 항목과 달라도 그렇다", async () => {
    // 안내 방식을 켜고 시작했다가 끄고 마친 여객, 끄고 시작했다가 켜고 마친 여객.
    await registerHandler(db, body({ choices: ["mov_no_stairs"], startAdapted: true }), null, web, now);
    await registerHandler(db, body({ choices: ["gd_large"], startAdapted: false }), null, web, now);
    expect((await eventRows("reg_done")).map((e) => e.adapted)).toEqual([true, false]);
  });

  it("시작할 때의 값이 참·거짓이 아니면 고른 항목으로 센다", async () => {
    await registerHandler(db, body({ choices: ["gd_large"], startAdapted: "false" }), null, web, now);
    await registerHandler(db, body({ choices: [], startAdapted: 1 }), null, web, now);
    expect((await eventRows("reg_done")).map((e) => e.adapted)).toEqual([true, false]);
  });
});

describe("안내 내용", () => {
  it("로그인 없이 QR 값만으로 열린다. 자리가 없으니 길과 시설은 비어 있다", async () => {
    const { pass } = await registerWithPass(db, now);
    await recordPoll(db, { at: kst("2026-10-05 11:55"), ok: true, rowCount: 1, durationMs: 1, gateChanges: 0 });
    const res = await guideHandler(db, pass.token, null, now);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["guide"]);
    expect(res.body.guide).toMatchObject({
      passNo: pass.passNo,
      lang: "ko",
      choices: CHOICES,
      place: null,
      gateRoute: null,
      routeNote: "no_place",
      pace: null,
      facilities: [],
      flight: { flightNo: "KE123", gate: 127, area: "CONCOURSE", schedTime: "14:30", close: "open", minutesToClose: 140 },
      poll: { label: "운항 정보 11:55 기준", stale: false },
    });
  });

  it("QR 값(token)은 안내 내용에 다시 싣지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await guideHandler(db, pass.token, null, now);
    expect(JSON.stringify(res.body)).not.toContain(pass.token);
    expect(hasKey(res.body, "token")).toBe(false);
    expect(hasKey(res.body, "registrationId")).toBe(false);
  });

  it("주소째로 넣어도, 소문자로 넣어도 열린다", async () => {
    const { pass } = await registerWithPass(db, now);
    expect((await guideHandler(db, passUrl("https://x.app", pass.token), null, now)).status).toBe(200);
    expect((await guideHandler(db, pass.token.toLowerCase(), null, now)).status).toBe(200);
  });

  it("키오스크에서 열면 그 자리를 기준으로 길과 가까운 시설이 들어간다", async () => {
    const { pass } = await registerWithPass(db, now);
    const g = (await guideHandler(db, pass.token, kiosk, now)).body.guide as GuideDto;
    expect(g.place).toMatchObject({ id: "cc-108", landside: false });
    expect(g.routeNote).toBeNull();
    // 108번 앞에서 127번 탑승구까지 570m. 계단이 어렵다고 한 여객이라 천천히 걷는 시간으로 잰다.
    expect(g.gateRoute).toMatchObject({ meters: 570, minutes: 13, levelChanges: 0 });
    expect(g.pace).toBe("ok");
    expect(g.facilities).toHaveLength(6);
  });

  it("직원 세션으로 열어도 자리가 없으니 길은 비어 있다", async () => {
    const { pass } = await registerWithPass(db, now);
    for (const s of [staff, desk]) {
      expect((await guideHandler(db, pass.token, s, now)).body.guide).toMatchObject({ place: null, routeNote: "no_place" });
    }
  });

  it("없는 값은 404, 끝난 패스는 410", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    expect((await guideHandler(db, "7K2M9QXW4HT8VB3N", null, now)).status).toBe(404);
    expect((await guideHandler(db, "https://naver.com", null, now)).status).toBe(404);
    expect((await guideHandler(db, "", null, now)).status).toBe(404);

    await db.query("update registrations set status = 'expired' where id = $1", [registration.id]);
    const ended = await guideHandler(db, pass.token, null, now);
    expect(ended.status).toBe(410);
    expect(Object.keys(ended.body)).toEqual(["error"]);
  });

  it("안내를 여러 번 읽어도 건수 기록과 조회 기록은 늘지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    for (let i = 0; i < 3; i++) await guideHandler(db, pass.token, kiosk, now);
    expect(await db.query("select 1 from events")).toHaveLength(0);
    expect(await db.query("select 1 from access_logs")).toHaveLength(0);
  });

  it("운항 정보를 받은 지 오래되면 그렇다고 알려 준다", async () => {
    const { pass } = await registerWithPass(db, now);
    const poll = async () => ((await guideHandler(db, pass.token, null, now)).body.guide as GuideDto).poll;
    expect(await poll()).toEqual({ label: "운항 정보 없음", stale: true, staleInMs: null });
    // 수집이 멈춘 것으로 볼 시간(config.staleMin, 수집 간격의 두 배에 15분)보다 오래된 수집만 있으면 멈춘 것으로 본다.
    expect(config.staleMin).toBe(135);
    await recordPoll(db, { at: kst("2026-10-05 09:44"), ok: true, rowCount: 1, durationMs: 1, gateChanges: 0 });
    expect(await poll()).toEqual({ label: "운항 정보 09:44 기준", stale: true, staleInMs: -60_000 });
    await recordPoll(db, { at: kst("2026-10-05 11:40"), ok: true, rowCount: 1, durationMs: 1, gateChanges: 0 });
    // 12:00 에 만든 내용이다. 115분이 더 지나면(13:55) 오래된 정보가 된다. 남겨 둔 화면은 이 값으로 스스로 알아본다.
    expect(await poll()).toEqual({ label: "운항 정보 11:40 기준", stale: false, staleInMs: 115 * 60_000 });
    // 실패한 수집은 기준 시각이 되지 않는다.
    await recordPoll(db, { at: kst("2026-10-05 11:59"), ok: false, rowCount: 0, durationMs: 1, gateChanges: 0, error: "x" });
    expect((await poll()).label).toBe("운항 정보 11:40 기준");
  });
});

describe("여객이 등록 지우기", () => {
  it("QR 값으로 지우면 항공편과 고른 항목이 사라지고 패스는 더 열리지 않는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    const res = await eraseHandler(db, { token: pass.token }, web, now);
    expect(res).toEqual({ status: 200, body: { erased: true } });

    const [row] = await db.query<Record<string, unknown>>(
      "select flight_no, flight_date, needs, status, purged_at from registrations where id = $1",
      [registration.id],
    );
    expect(row).toEqual({ flight_no: null, flight_date: null, needs: [], status: "revoked", purged_at: now });
    const [p] = await db.query<Record<string, unknown>>("select state, registration_id from passes");
    expect(p).toEqual({ state: "revoked", registration_id: null });

    expect(await lookupPass(db, pass.token, now)).toEqual({ kind: "ended" });
    expect((await guideHandler(db, pass.token, null, now)).status).toBe(410);
    expect((await resolveHandler(db, kiosk, { scanned: pass.token }, "kiosk-dev", now)).status).toBe(410);
    // 번호로는 끝난 패스가 있었는지도 알려 주지 않는다.
    expect((await resolveHandler(db, kiosk, { passNo: pass.passNo }, "kiosk-dev", now)).status).toBe(404);
  });

  it("주소째로 보내도 지운다", async () => {
    const { pass } = await registerWithPass(db, now);
    expect((await eraseHandler(db, { token: passUrl("https://x.app", pass.token) }, web, now)).status).toBe(200);
    expect((await regRows())[0].status).toBe("revoked");
  });

  it("지운 기록을 남기되 등록과는 잇지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    await eraseHandler(db, { token: pass.token }, web, now);
    const logs = await db.query<{ device_key: string; registration_id: string | null }>(
      "select device_key, registration_id from access_logs where action = 'cancel'",
    );
    expect(logs).toEqual([{ device_key: web, registration_id: null }]);
  });

  it("두 번 지워도 같은 답이고 기록은 한 번만 남는다", async () => {
    const { pass } = await registerWithPass(db, now);
    await eraseHandler(db, { token: pass.token }, web, now);
    expect(await eraseHandler(db, { token: pass.token }, web, now)).toEqual({ status: 200, body: { erased: true } });
    expect(await logCount("cancel")).toBe(1);
  });

  it("없는 값이나 값이 없으면 404 이고 아무것도 지우지 않는다", async () => {
    await registerWithPass(db, now);
    expect((await eraseHandler(db, { token: "7K2M9QXW4HT8VB3N" }, web, now)).status).toBe(404);
    expect((await eraseHandler(db, {}, web, now)).status).toBe(404);
    expect((await eraseHandler(db, { token: 123456 }, web, now)).status).toBe(404);
    expect((await regRows())[0].status).toBe("active");
  });

  it("고유 일련 번호로는 지울 수 없다", async () => {
    const { pass } = await registerWithPass(db, now);
    expect((await eraseHandler(db, { token: pass.passNo }, web, now)).status).toBe(404);
    expect((await regRows())[0].status).toBe("active");
  });

  it("한 여객이 지워도 다른 여객의 패스는 그대로다", async () => {
    const a = await registerWithPass(db, now);
    const b = await registerWithPass(db, now);
    await eraseHandler(db, { token: a.pass.token }, web, now);
    expect((await guideHandler(db, b.pass.token, null, now)).status).toBe(200);
  });
});

describe("화면이 보내는 건수 기록", () => {
  it("등록을 시작했다는 기록을 받는다. 안내 방식을 켰는지와 어디서 했는지를 남긴다", async () => {
    expect(await eventHandler(db, { kind: "reg_start", adapted: true }, null, web, now)).toEqual({ status: 200, body: {} });
    expect((await eventHandler(db, { kind: "reg_start" }, kiosk, "kiosk-dev", now)).status).toBe(200);
    expect((await eventHandler(db, { kind: "reg_start", adapted: "yes" }, desk, "desk-dev", now)).status).toBe(200);
    expect(await eventRows("reg_start")).toEqual([
      { route: "web", adapted: true, place_id: null, value: null, device_key: web },
      { route: "kiosk", adapted: false, place_id: "cc-108", value: null, device_key: "kiosk-dev" },
      { route: "web", adapted: false, place_id: null, value: null, device_key: "desk-dev" },
    ]);
  });

  it("만족도는 1, 2, 3 만 받는다", async () => {
    for (const value of [1, 2, 3]) {
      expect((await eventHandler(db, { kind: "survey", value }, kiosk, "kiosk-dev", now)).status).toBe(200);
    }
    for (const value of [0, 4, -1, 2.5, "3", null, undefined, true]) {
      expect((await eventHandler(db, { kind: "survey", value }, kiosk, "kiosk-dev", now)).status, String(value)).toBe(400);
    }
    expect((await eventRows("survey")).map((e) => e.value)).toEqual([1, 2, 3]);
  });

  it("완료와 안내 열람은 화면이 보낼 수 없다. 서버가 직접 센다", async () => {
    for (const kind of ["reg_done", "guide_open", "page_view", "", null, undefined, 1]) {
      expect((await eventHandler(db, { kind, value: 3 }, null, web, now)).status, String(kind)).toBe(400);
    }
    expect(await db.query("select 1 from events")).toHaveLength(0);
  });

  it("같은 접속 주소에서 너무 많이 오면 받지 않는다", async () => {
    await db.query(
      `insert into events (at, kind, device_key) select $1::timestamptz, 'reg_start', $2::text from generate_series(1, 200)`,
      [now, deviceKey("203.0.113.7", "other")],
    );
    expect((await eventHandler(db, { kind: "reg_start" }, null, web, now)).status).toBe(429);
    expect((await eventHandler(db, { kind: "reg_start" }, null, deviceKey("198.51.100.9", "phone"), now)).status).toBe(200);
    // 설치 코드로 들어온 키오스크는 같은 접속 주소라도 한도에 걸리지 않는다.
    expect((await eventHandler(db, { kind: "survey", value: 3 }, kiosk, deviceKey("203.0.113.7", "kiosk"), now)).status).toBe(200);
  });
});

describe("직원 화면: 로그인과 근무 구역", () => {
  it("로그인하지 않았거나 키오스크 기기면 직원 화면을 열 수 없다", async () => {
    for (const s of [null, kiosk]) {
      expect((await callsHandler(db, s, now)).status).toBe(401);
      expect((await callActionHandler(db, s, "x", { action: "accept" }, now)).status).toBe(401);
      expect((await summaryHandler(db, s, now)).status).toBe(401);
      expect((await deskEraseHandler(db, s, { token: "x" }, "d", now)).status).toBe(401);
      expect((await zonesHandler(db, s)).status).toBe(401);
      expect((await switchZoneHandler(db, s, { zoneId: "cc-end" })).status).toBe(401);
    }
  });

  it("안내데스크 권한을 가진 것처럼 꾸민 키오스크 세션도 직원 화면을 열 수 없다", async () => {
    const forged = { ...kiosk, isDesk: true, canSwitch: true };
    expect((await summaryHandler(db, forged, now)).status).toBe(401);
    expect((await deskEraseHandler(db, forged, { token: "x" }, "d", now)).status).toBe(401);
    expect((await switchZoneHandler(db, forged, { zoneId: "cc-end" })).status).toBe(401);
  });

  it("근무 구역을 고르기 전에는 호출을 볼 수도 받을 수도 없다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    expect((await callsHandler(db, common, now)).status).toBe(409);
    expect((await callActionHandler(db, common, call!.id, { action: "accept" }, now)).status).toBe(409);
    expect((await summaryHandler(db, common, now)).status).toBe(409);
    expect((await deskEraseHandler(db, common, { token: "x" }, "d", now)).status).toBe(409);
    expect((await db.query<{ accepted_at: Date | null }>("select accepted_at from calls"))[0].accepted_at).toBeNull();
  });

  it("고를 수 있는 구역은 터미널별로 묶여 오고 안내데스크, 공통 자리, 키오스크 자리는 빠진다", async () => {
    const res = await zonesHandler(db, common);
    const groups = res.body.groups as { terminal: string; zones: { id: string; label: string }[] }[];
    expect(groups.map((g) => g.terminal)).toEqual(["제1여객터미널", "탑승동", "제2여객터미널"]);
    const ids = groups.flatMap((g) => g.zones.map((z) => z.id));
    expect(ids).toContain("cc-end");
    expect(ids).not.toContain("desk-t1");
    expect(ids).not.toContain("staff-common");
    expect(ids).not.toContain("kiosk");
    expect(res.body.current).toBeNull();
    expect(hasKey(res.body, "code")).toBe(false);
    expect(hasKey(res.body, "code_hash")).toBe(false);
  });

  it("구역을 고르면 그 구역의 세션이 된다. 만료 시각은 늘어나지 않는다", async () => {
    const res = await switchZoneHandler(db, common, { zoneId: "cc-end" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zoneLabel: "탑승동 끝단 (101~106, 127~132)" });
    const next = readSession(res.token, now);
    expect(next).toEqual({ ...common, zoneId: "cc-end", needsZone: false });
    // 고른 뒤에는 지금 구역이 표시되고 호출 목록이 열린다.
    expect((await zonesHandler(db, next)).body.current).toBe("cc-end");
    expect((await callsHandler(db, next, now)).status).toBe(200);
  });

  it("안내데스크, 키오스크 자리, 없는 구역은 고를 수 없고, 구역 코드로 들어온 직원은 바꿀 수 없다", async () => {
    for (const zoneId of ["desk-t1", "staff-common", "kiosk", "nope", 7, undefined]) {
      expect((await switchZoneHandler(db, common, { zoneId })).status, String(zoneId)).toBe(400);
    }
    expect((await switchZoneHandler(db, staff, { zoneId: "cc-mid" })).status).toBe(403);
    expect((await switchZoneHandler(db, desk, { zoneId: "cc-mid" })).status).toBe(403);
    expect((await zonesHandler(db, staff)).status).toBe(403);
  });

  it("구역 이름에서 탑승구 범위를 뗀다", () => {
    expect(zoneName("탑승동 끝단 (101~106, 127~132)")).toBe("탑승동 끝단");
    expect(zoneName("안내데스크")).toBe("안내데스크");
    expect(zoneName("")).toBe("");
  });
});

describe("직원 화면: 호출 목록", () => {
  const list = async (s = staff, at = now) => (await callsHandler(db, s, at)).body.calls as CallDto[];

  it("호출이 없으면 빈 목록과 내 구역 이름이 온다", async () => {
    expect((await callsHandler(db, staff, now)).body).toEqual({
      calls: [],
      zoneLabel: "탑승동 끝단",
      isDesk: false,
      canSwitch: false,
    });
    expect((await callsHandler(db, desk, now)).body).toMatchObject({ zoneLabel: "안내데스크", isDesk: true });
  });

  it("어느 키오스크에서 언제 불렀는지, 얼마나 기다렸는지를 보여준다", async () => {
    const call = await createCall(db, "cc-108", null, "register", now);
    const at = new Date(now.getTime() + 3 * 60_000 + 59_000);
    expect(await list(mid, at)).toEqual([
      {
        id: call!.id,
        state: "waiting",
        endReason: null,
        place: "탑승동 3층 108번 탑승구 앞",
        mine: true,
        screen: "register",
        time: "12:00",
        createdAt: now.toISOString(),
        waitedMin: 3,
        acceptedBy: null,
        acceptedByMe: false,
        pass: null,
      },
    ]);
  });

  it("내 구역의 키오스크에서 온 호출만 내 것으로 표시한다. 다른 구역 직원에게도 목록은 보인다", async () => {
    await createCall(db, "cc-108", null, "guide", now); // 탑승동 중간
    await createCall(db, "t1-info", null, "guide", new Date(now.getTime() + 1000)); // 안내데스크
    const mine = async (s: typeof staff) => (await list(s)).map((c) => c.mine);
    expect(await mine(mid)).toEqual([true, false]);
    expect(await mine(staff)).toEqual([false, false]);
    expect(await mine(desk)).toEqual([false, true]);
  });

  it("패스 없이 부른 호출에는 여객의 정보가 없다", async () => {
    await registerWithPass(db, now);
    await createCall(db, "cc-108", null, "guide", now);
    const [c] = await list(mid);
    expect(c.pass).toBeNull();
    expect(JSON.stringify(c)).not.toContain("KE123");
  });

  it("패스를 찍고 부른 호출에는 고른 항목의 줄인 말과 항공편이 함께 온다", async () => {
    const { registration } = await registerWithPass(db, now, { lang: "en" });
    await createCall(db, "cc-108", registration.id, "guide", now);
    const [c] = await list(mid);
    expect(c.pass).toMatchObject({
      choices: ["큰 글씨", "계단 어려움", "직원 호출 원함"],
      lang: "en",
      flight: { flightNo: "KE123", gate: 127, area: "CONCOURSE", schedTime: "14:30", close: "open", minutesToClose: 140 },
    });
    expect(Object.keys(c.pass!).sort()).toEqual(["choices", "flight", "lang"]);
    // 항목 코드와 등록 id, QR 값은 나가지 않는다.
    const dump = JSON.stringify(c);
    for (const code of CHOICES) expect(dump).not.toContain(code);
    expect(dump).not.toContain(registration.id);
    expect(hasKey(c, "token")).toBe(false);
    expect(hasKey(c, "passNo")).toBe(false);
  });

  it("임박한 편은 항공편에 urgent 가 켜져 온다", async () => {
    const { registration } = await registerWithPass(db, now);
    const urgentAt = async (at: Date) => (await list(mid, at))[0].pass?.flight.urgent;
    await createCall(db, "cc-108", registration.id, "guide", kst("2026-10-05 13:40"));
    expect(await urgentAt(kst("2026-10-05 13:45"))).toBe(false); // 마감 35분 전
    expect(await urgentAt(kst("2026-10-05 13:50"))).toBe(true); // 마감 30분 전
  });

  it("여정이 끝난 여객의 호출에는 지워지기 전이라도 여객의 정보가 오지 않는다", async () => {
    const { registration } = await registerWithPass(db, now);
    const call = await createCall(db, "cc-108", registration.id, "guide", kst("2026-10-05 14:50"));
    // 출발 29분 뒤까지는 보인다.
    expect((await list(mid, kst("2026-10-05 14:59")))[0].pass).not.toBeNull();
    // 출발 30분 뒤. 삭제 작업은 아직 돌지 않아 등록은 그대로 남아 있다.
    const [c] = await list(mid, kst("2026-10-05 15:00"));
    expect(c).toMatchObject({ id: call!.id, state: "waiting", pass: null });
    expect(JSON.stringify(c)).not.toContain("KE123");
    expect((await regRows())[0].status).toBe("active");
  });

  it("등록이 지워진 호출에는 여객의 정보가 더는 오지 않는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    await createCall(db, "cc-108", registration.id, "guide", now);
    await eraseHandler(db, { token: pass.token }, web, now);
    const [c] = await list(mid);
    expect(c).toMatchObject({ state: "cancelled", pass: null });
  });

  it("끝나지 않은 호출을 오래 기다린 순으로 먼저 보여주고, 끝난 호출은 30분 뒤에 빠진다", async () => {
    const t = (min: number) => new Date(now.getTime() + min * 60_000);
    const a = await createCall(db, "cc-108", null, "guide", t(0));
    const b = await createCall(db, "cc-125", null, "guide", t(1));
    await callActionHandler(db, mid, a!.id, { action: "done" }, t(2));
    expect((await list(mid, t(3))).map((c) => [c.id, c.state])).toEqual([
      [b!.id, "waiting"],
      [a!.id, "done"],
    ]);
    // 끝난 호출의 기다린 시간은 끝날 때까지 걸린 시간에서 멈춘다.
    expect((await list(mid, t(20))).find((c) => c.id === a!.id)?.waitedMin).toBe(2);
    expect((await list(mid, t(20))).find((c) => c.id === b!.id)?.waitedMin).toBe(19);
    expect((await list(mid, t(32))).map((c) => c.id)).not.toContain(a!.id);
  });

  it("끝난 까닭을 나눠 보낸다: 도움 마침, 여객이 거둠, 아무도 받지 않아 시간이 지나 닫힘", async () => {
    const t = (min: number) => new Date(now.getTime() + min * 60_000);
    const done = await createCall(db, "cc-108", null, "guide", t(0));
    await callActionHandler(db, mid, done!.id, { action: "done" }, t(1));
    const withdrawn = await createCall(db, "cc-125", null, "guide", t(0));
    await cancelCall(db, withdrawn!.id, "cc-125", t(2));
    // 30분 넘게 아무도 받지 않았다. 목록을 불러올 때 닫힌다.
    const missed = await createCall(db, "t1-info", null, "guide", t(0));
    const calls = await list(mid, t(30.5));
    const reasons = Object.fromEntries(calls.map((c) => [c.id, [c.state, c.endReason]]));
    expect(reasons).toEqual({
      [done!.id]: ["done", "done"],
      [withdrawn!.id]: ["cancelled", "cancelled"],
      [missed!.id]: ["cancelled", "expired"],
    });
  });
});

describe("직원 화면: 호출 받기와 마치기", () => {
  const list = async (s = staff) => (await callsHandler(db, s, now)).body.calls as CallDto[];

  it("받으면 받은 구역 이름이 보인다. 받은 직원에게만 내가 받은 것으로 표시된다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    expect(await callActionHandler(db, mid, call!.id, { action: "accept" }, now)).toEqual({ status: 200, body: {} });
    expect((await list(mid))[0]).toMatchObject({ state: "accepted", acceptedBy: "탑승동 중간", acceptedByMe: true });
    expect((await list(staff))[0]).toMatchObject({ state: "accepted", acceptedBy: "탑승동 중간", acceptedByMe: false });
  });

  it("다른 구역 직원도 받을 수 있다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    expect((await callActionHandler(db, staff, call!.id, { action: "accept" }, now)).status).toBe(200);
    expect((await list(mid))[0]).toMatchObject({ mine: true, acceptedBy: "탑승동 끝단", acceptedByMe: false });
  });

  it("두 번째로 받으려는 구역은 409 를 받는다. 처음 받은 구역이 그대로 남는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    expect((await callActionHandler(db, mid, call!.id, { action: "accept" }, now)).status).toBe(200);
    const second = await callActionHandler(db, staff, call!.id, { action: "accept" }, now);
    expect(second.status).toBe(409);
    expect(second.body.error).toContain("먼저 받았거나");
    expect((await callActionHandler(db, desk, call!.id, { action: "accept" }, now)).status).toBe(409);
    expect((await list())[0].acceptedBy).toBe("탑승동 중간");
  });

  it("마치면 done 이 되고, 다시 마치거나 받을 수 없다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    await callActionHandler(db, mid, call!.id, { action: "accept" }, now);
    expect((await callActionHandler(db, mid, call!.id, { action: "done" }, now)).status).toBe(200);
    expect((await list())[0].state).toBe("done");
    expect((await callActionHandler(db, mid, call!.id, { action: "done" }, now)).status).toBe(409);
    expect((await callActionHandler(db, staff, call!.id, { action: "accept" }, now)).status).toBe(409);
  });

  it("받지 않고 바로 마칠 수 있다. 마친 구역이 받은 구역으로 남는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    expect((await callActionHandler(db, staff, call!.id, { action: "done" }, now)).status).toBe(200);
    expect((await list(staff))[0]).toMatchObject({ state: "done", acceptedBy: "탑승동 끝단", acceptedByMe: true });
  });

  it("여객이 거둔 호출, 없는 호출, 모양이 다른 id 는 409", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    await db.query("update calls set ended_at = $1, end_kind = 'cancelled'", [now]);
    for (const id of [call!.id, "00000000-0000-4000-8000-000000000009", "nope", ""]) {
      expect((await callActionHandler(db, mid, id, { action: "accept" }, now)).status, id).toBe(409);
      expect((await callActionHandler(db, mid, id, { action: "done" }, now)).status, id).toBe(409);
    }
  });

  it("받기와 마치기가 아닌 동작은 400", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    for (const action of ["cancel", "", undefined, 1]) {
      expect((await callActionHandler(db, mid, call!.id, { action }, now)).status, String(action)).toBe(400);
    }
    expect((await list())[0].state).toBe("waiting");
  });
});

describe("안내데스크: 오늘 현황", () => {
  it("안내데스크만 본다", async () => {
    expect((await summaryHandler(db, null, now)).status).toBe(401);
    expect((await summaryHandler(db, staff, now)).status).toBe(403);
    expect((await summaryHandler(db, mid, now)).status).toBe(403);
    expect((await summaryHandler(db, desk, now)).status).toBe(200);
  });

  it("오늘 받은 등록, 완료 비율, 호출, 만족도의 건수가 온다", async () => {
    await eventHandler(db, { kind: "reg_start", adapted: true }, null, web, now);
    await registerHandler(db, body({ startAdapted: true }), null, web, now);
    await eventHandler(db, { kind: "reg_start", adapted: false }, kiosk, "kiosk-dev", now);
    const reg = await registerHandler(db, body(), desk, "desk-dev", now, true);
    await resolveHandler(db, kiosk, { scanned: reg.body.token, purpose: "guide" }, "kiosk-dev", now);
    await eventHandler(db, { kind: "survey", value: 3 }, kiosk, "kiosk-dev", now);
    await createCall(db, "cc-108", null, "guide", now);

    const res = await summaryHandler(db, desk, kst("2026-10-05 12:30"));
    expect(Object.keys(res.body)).toEqual(["summary"]);
    expect(res.body.summary as Summary).toMatchObject({
      date: "2026-10-05",
      active: 2,
      registered: 2,
      byRoute: { web: 1, kiosk: 0, assisted: 1 },
      completion: { adapted: { started: 1, done: 1, rate: 100 }, plain: { started: 1, done: 0, rate: 0 } },
      guideOpens: 1,
      calls: { total: 1, open: 1 },
      survey: { good: 1, fair: 0, poor: 0, total: 1 },
    });
  });

  it("건수만 있다. 편명도 고른 항목도 기기 값도 담기지 않는다", async () => {
    await registerHandler(db, body(), null, web, now);
    const res = await summaryHandler(db, desk, now);
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/KE123|gd_large|mov_no_stairs/);
    expect(dump).not.toContain(web);
    expect(hasKey(res.body, "name")).toBe(false);
  });
});

describe("안내데스크: 여객 요청으로 지우기", () => {
  it("안내데스크만 할 수 있다", async () => {
    const { pass } = await registerWithPass(db, now);
    expect((await deskEraseHandler(db, null, { token: pass.token }, "d", now)).status).toBe(401);
    expect((await deskEraseHandler(db, staff, { token: pass.token }, "d", now)).status).toBe(403);
    expect((await regRows())[0].status).toBe("active");
  });

  it("QR 값으로 지우고 누가(어느 구역이) 지웠는지 남긴다", async () => {
    const { pass } = await registerWithPass(db, now);
    const res = await deskEraseHandler(db, desk, { token: pass.token }, "desk-dev", now);
    expect(res).toEqual({ status: 200, body: { erased: true } });
    expect((await regRows())[0]).toMatchObject({ status: "revoked", needs: [] });
    expect((await guideHandler(db, pass.token, null, now)).status).toBe(410);
    const logs = await db.query("select zone_id, device_key, registration_id from access_logs where action = 'cancel'");
    expect(logs).toEqual([{ zone_id: "desk-t1", device_key: "desk-dev", registration_id: null }]);
  });

  it("키오스크나 안내데스크에서 번호로 찾아 받은 QR 값으로 지울 수 있다", async () => {
    const { pass } = await registerWithPass(db, now);
    const found = await resolveHandler(db, desk, { passNo: pass.passNo }, "desk-dev", now);
    expect(found.body.token).toBe(pass.token);
    expect((await deskEraseHandler(db, desk, { token: found.body.token }, "desk-dev", now)).status).toBe(200);
    expect((await regRows())[0].status).toBe("revoked");
  });

  it("없는 값은 404, 이미 끝난 패스는 지웠다고만 답하고 기록을 더 남기지 않는다", async () => {
    const { pass } = await registerWithPass(db, now);
    expect((await deskEraseHandler(db, desk, { token: "7K2M9QXW4HT8VB3N" }, "desk-dev", now)).status).toBe(404);
    expect((await deskEraseHandler(db, desk, {}, "desk-dev", now)).status).toBe(404);
    await deskEraseHandler(db, desk, { token: pass.token }, "desk-dev", now);
    expect(await deskEraseHandler(db, desk, { token: pass.token }, "desk-dev", now)).toEqual({
      status: 200,
      body: { erased: true },
    });
    expect(await logCount("cancel")).toBe(1);
  });
});
