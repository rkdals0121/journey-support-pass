import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceKey } from "@/lib/auth";
import { acceptCall, cancelCall, createCall, finishCall } from "@/lib/calls";
import type { Db } from "@/lib/db";
import { recordPoll } from "@/lib/flights/ingest";
import { allowEvent, logEvent, pollMetrics, summarize, todaySummary, type EventKind } from "@/lib/metrics";
import { eraseRegistration } from "@/lib/purge";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, hasKey, register, registerWithPass, resetData } from "./helpers/fixtures";

const now = kst("2026-10-05 14:00");
const at = (hhmm: string, sec = 0) => new Date(kst(`2026-10-05 ${hhmm}`).getTime() + sec * 1000);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("KE123", "2026-10-05 18:30", { gate: 127 })], kst("2026-10-05 09:00"));
});

/** 같은 건수 기록을 n 번 남긴다. */
async function events(n: number, kind: EventKind, over: { adapted?: boolean; value?: number; when?: Date; route?: string } = {}) {
  for (let i = 0; i < n; i++) {
    await logEvent(db, { at: over.when ?? at("12:00"), kind, adapted: over.adapted, value: over.value, route: over.route ?? "web" });
  }
}

describe("건수 기록", () => {
  it("넣은 값을 그대로 남기고, 주지 않은 값은 비운다", async () => {
    await logEvent(db, { at: at("12:00"), kind: "reg_start" });
    await logEvent(db, {
      at: at("12:01"),
      kind: "survey",
      route: "kiosk",
      adapted: true,
      placeId: "cc-108",
      value: 3,
      deviceKey: "ip:dev",
    });
    const rows = await db.query("select kind, route, adapted, place_id, value, device_key from events order by id");
    expect(rows).toEqual([
      { kind: "reg_start", route: "", adapted: false, place_id: null, value: null, device_key: null },
      { kind: "survey", route: "kiosk", adapted: true, place_id: "cc-108", value: 3, device_key: "ip:dev" },
    ]);
  });

  it("정해진 네 종류가 아니면 DB 가 받지 않는다", async () => {
    await expect(logEvent(db, { at: now, kind: "page_view" as EventKind })).rejects.toThrow();
    for (const kind of ["reg_start", "reg_done", "guide_open", "survey"] as const) {
      await expect(logEvent(db, { at: now, kind })).resolves.toBeUndefined();
    }
  });

  it("같은 접속 주소에서 10분에 200건을 넘기면 더 받지 않는다. 브라우저 표시를 바꿔도 같다", async () => {
    const key = (ua: string) => deviceKey("203.0.113.7", ua);
    await db.query(
      `insert into events (at, kind, device_key)
       select $1::timestamptz, 'reg_start', case when g % 2 = 0 then $2::text else $3::text end
       from generate_series(1, 199) g`,
      [now, key("ua-a"), key("ua-b")],
    );
    expect(await allowEvent(db, key("ua-c"), now)).toBe(true);
    await logEvent(db, { at: now, kind: "reg_start", deviceKey: key("ua-a") });
    expect(await allowEvent(db, key("ua-c"), now)).toBe(false);
    // 다른 접속 주소는 영향이 없고, 10분이 지나면 다시 받는다.
    expect(await allowEvent(db, deviceKey("198.51.100.9", "ua-a"), now)).toBe(true);
    expect(await allowEvent(db, key("ua-c"), new Date(now.getTime() + 10 * 60_000))).toBe(true);
  });
});

describe("등록 완료 비율", () => {
  it("안내 방식을 켠 여객과 켜지 않은 여객을 따로 센다", async () => {
    await events(4, "reg_start", { adapted: true });
    await events(3, "reg_done", { adapted: true });
    await events(2, "reg_start", { adapted: false });
    await events(1, "reg_done", { adapted: false });
    const s = await todaySummary(db, now);
    expect(s.completion).toEqual({
      adapted: { started: 4, done: 3, rate: 75 },
      plain: { started: 2, done: 1, rate: 50 },
    });
  });

  it("비율은 반올림한 정수다", async () => {
    await events(3, "reg_start", { adapted: true });
    await events(2, "reg_done", { adapted: true });
    await events(3, "reg_start", { adapted: false });
    await events(1, "reg_done", { adapted: false });
    const s = await todaySummary(db, now);
    expect(s.completion.adapted.rate).toBe(67);
    expect(s.completion.plain.rate).toBe(33);
  });

  it("시작 기록이 빠진 채 완료만 와도 100을 넘지 않는다", async () => {
    await events(1, "reg_start", { adapted: true });
    await events(3, "reg_done", { adapted: true });
    await events(2, "reg_done", { adapted: false });
    const s = await todaySummary(db, now);
    expect(s.completion.adapted).toEqual({ started: 3, done: 3, rate: 100 });
    expect(s.completion.plain).toEqual({ started: 2, done: 2, rate: 100 });
  });

  it("시작이 없으면 비율은 null 이다. 한쪽만 있어도 다른 쪽은 null 로 남는다", async () => {
    expect((await todaySummary(db, now)).completion).toEqual({
      adapted: { started: 0, done: 0, rate: null },
      plain: { started: 0, done: 0, rate: null },
    });
    await events(2, "reg_start", { adapted: true });
    const s = await todaySummary(db, now);
    expect(s.completion.adapted).toEqual({ started: 2, done: 0, rate: 0 });
    expect(s.completion.plain.rate).toBeNull();
  });

  it("키오스크에서 한 것과 휴대전화에서 한 것을 함께 센다", async () => {
    await events(1, "reg_start", { adapted: true, route: "web" });
    await events(1, "reg_start", { adapted: true, route: "kiosk" });
    await events(1, "reg_done", { adapted: true, route: "kiosk" });
    expect((await todaySummary(db, now)).completion.adapted).toEqual({ started: 2, done: 1, rate: 50 });
  });
});

describe("만족도와 안내 열람", () => {
  it("응답을 좋음(3)·보통(2)·아쉬움(1)으로 나눠 센다", async () => {
    await events(2, "survey", { value: 3 });
    await events(1, "survey", { value: 2, adapted: true });
    await events(1, "survey", { value: 1 });
    await events(2, "survey", { value: 3, adapted: true });
    expect((await todaySummary(db, now)).survey).toEqual({ good: 4, fair: 1, poor: 1, total: 6 });
  });

  it("값이 범위를 벗어난 응답은 세지 않는다", async () => {
    await events(1, "survey", { value: 3 });
    await events(1, "survey", { value: 5 });
    await events(1, "survey", {});
    expect((await todaySummary(db, now)).survey).toEqual({ good: 1, fair: 0, poor: 0, total: 1 });
  });

  it("안내 화면을 연 횟수를 센다", async () => {
    await events(3, "guide_open", { route: "kiosk" });
    await events(2, "guide_open", { route: "kiosk", adapted: true });
    expect((await todaySummary(db, now)).guideOpens).toBe(5);
  });
});

describe("직원 부르기 집계", () => {
  it("어디서 불렀는지, 어떻게 끝났는지, 받기까지 걸린 시간의 가운데값을 낸다", async () => {
    // 등록하다 불렀고 40초 뒤에 받아 마쳤다.
    const a = await createCall(db, "cc-108", null, "register", at("12:00"));
    await acceptCall(db, a!.id, "cc-mid", at("12:00", 40));
    await finishCall(db, a!.id, "cc-mid", at("12:05"));
    // 안내를 보다 불렀다가 거뒀다.
    const b = await createCall(db, "cc-125", null, "guide", at("12:10"));
    await cancelCall(db, b!.id, "cc-125", at("12:11"));
    // 받지 않고 100초 뒤에 바로 마쳤다.
    const c = await createCall(db, "t2-west", null, "guide", at("12:20"));
    await finishCall(db, c!.id, "t2-wam", at("12:20", 100));
    // 받고 200초 뒤, 아직 돕는 중이다.
    const d = await createCall(db, "t1-west", null, "guide", at("13:50"));
    await acceptCall(db, d!.id, "t1-w", at("13:50", 200));
    // 아직 아무도 받지 않았다.
    await createCall(db, "t1-east", null, "guide", at("13:55"));

    expect((await todaySummary(db, now)).calls).toEqual({
      total: 5,
      fromRegister: 1,
      fromGuide: 4,
      done: 2,
      cancelled: 1,
      open: 2,
      medianAcceptSec: 100, // 40, 100, 200 의 가운데
    });
  });

  it("받은 호출이 짝수 개면 가운데 두 값의 평균이다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", at("12:00"));
    await acceptCall(db, a!.id, "cc-mid", at("12:00", 40));
    const b = await createCall(db, "cc-125", null, "guide", at("12:00"));
    await acceptCall(db, b!.id, "cc-mid", at("12:00", 100));
    expect((await todaySummary(db, now)).calls.medianAcceptSec).toBe(70);
  });

  it("받은 호출이 없으면 가운데값은 null", async () => {
    const a = await createCall(db, "cc-108", null, "guide", at("13:50"));
    await cancelCall(db, a!.id, "cc-108", at("13:51"));
    expect((await todaySummary(db, now)).calls).toMatchObject({ total: 1, cancelled: 1, open: 0, medianAcceptSec: null });
  });
});

describe("등록 집계", () => {
  it("경로별 건수를 세고, 작성 시간의 가운데값에서 직원이 대신 넣은 것은 뺀다", async () => {
    const submit = at("12:00");
    const started = (sec: number) => new Date(submit.getTime() - sec * 1000);
    await registerWithPass(db, submit, { route: "web", startedAt: started(60) });
    await registerWithPass(db, submit, { route: "web", startedAt: started(120) });
    await registerWithPass(db, submit, { route: "kiosk", startedAt: started(300) });
    await registerWithPass(db, submit, { route: "assisted", startedAt: started(10) });

    const s = await todaySummary(db, now);
    expect(s.registered).toBe(4);
    expect(s.byRoute).toEqual({ web: 2, kiosk: 1, assisted: 1 });
    // 60, 120, 300 의 가운데. 대신 넣은 10초가 끼면 90이 된다.
    expect(s.medianWriteSec).toBe(120);
    expect(s.active).toBe(4);
  });

  it("직원이 대신 넣은 것만 있으면 작성 시간은 null", async () => {
    await registerWithPass(db, at("12:00"), { route: "assisted" });
    const s = await todaySummary(db, now);
    expect(s).toMatchObject({ registered: 1, byRoute: { web: 0, kiosk: 0, assisted: 1 }, medianWriteSec: null });
  });

  it("지금 패스를 쓰는 여객 수는 패스가 살아 있는 등록만 센다", async () => {
    await register(db, at("12:00")); // 패스를 만들지 못한 등록
    const gone = await registerWithPass(db, at("12:00"));
    await registerWithPass(db, at("12:00"));
    await eraseRegistration(db, gone.registration.id, at("13:00"), "revoked");

    const s = await todaySummary(db, now);
    expect(s.active).toBe(1);
    // 지운 등록도 오늘 받은 건수와 경로에는 남는다.
    expect(s.registered).toBe(3);
    expect(s.byRoute.web).toBe(3);
  });
});

describe("오늘 현황", () => {
  it("한국 날짜로 오늘 것만 센다. 어제 것은 세지 않는다", async () => {
    const yesterday = kst("2026-10-04 23:59");
    await addFlights(db, [flightRow("KE900", "2026-10-05 08:00")], yesterday);
    await registerWithPass(db, yesterday, { flightNo: "KE900", startedAt: kst("2026-10-04 23:58") });
    await events(2, "reg_start", { when: yesterday });
    await events(1, "survey", { when: yesterday, value: 3 });
    await events(1, "guide_open", { when: yesterday });
    const old = await createCall(db, "cc-108", null, "guide", yesterday);
    await finishCall(db, old!.id, "cc-mid", yesterday);

    const midnight = kst("2026-10-05 00:00");
    await registerWithPass(db, midnight, { startedAt: midnight });
    await events(1, "reg_start", { when: midnight });

    const s = await todaySummary(db, now);
    expect(s.date).toBe("2026-10-05");
    expect(s.registered).toBe(1);
    expect(s.completion.plain.started).toBe(1);
    expect(s.survey.total).toBe(0);
    expect(s.guideOpens).toBe(0);
    expect(s.calls.total).toBe(0);
    // 어제 등록한 여객도 아직 패스를 쓰고 있으면 지금 여객 수에는 들어간다.
    expect(s.active).toBe(2);
  });

  it("아무것도 없으면 0 과 null", async () => {
    expect(await todaySummary(db, now)).toEqual({
      date: "2026-10-05",
      active: 0,
      registered: 0,
      byRoute: { web: 0, kiosk: 0, assisted: 0 },
      medianWriteSec: null,
      completion: { adapted: { started: 0, done: 0, rate: null }, plain: { started: 0, done: 0, rate: null } },
      guideOpens: 0,
      calls: { total: 0, fromRegister: 0, fromGuide: 0, done: 0, cancelled: 0, open: 0, medianAcceptSec: null },
      survey: { good: 0, fair: 0, poor: 0, total: 0 },
    });
  });

  it("기간을 정해 집계할 수 있다", async () => {
    await events(1, "guide_open", { when: at("09:00") });
    await events(1, "guide_open", { when: at("13:00") });
    expect((await summarize(db, at("12:00"), "오후")).guideOpens).toBe(1);
    expect((await summarize(db, at("12:00"), "오후")).date).toBe("오후");
    expect((await summarize(db, at("08:00"), "종일")).guideOpens).toBe(2);
  });

  it("사람을 알 수 있는 값은 담기지 않는다. 편명도 고른 항목도 없다", async () => {
    const { registration } = await registerWithPass(db, at("12:00"), { choices: ["gd_large", "mov_wheelchair_own"] });
    await createCall(db, "cc-108", registration.id, "guide", at("12:30"));
    await events(1, "survey", { value: 3 });
    const s = await todaySummary(db, now);
    const dump = JSON.stringify(s);
    expect(dump).not.toContain("KE123");
    expect(dump).not.toContain("mov_wheelchair_own");
    expect(dump).not.toContain(registration.id);
    expect(dump).not.toContain("cc-108");
    expect(hasKey(s, "name")).toBe(false);
  });
});

describe("운항 정보 수집 집계", () => {
  it("횟수, 실패, 성공한 수집의 평균 시간, 탑승구 변경 수를 낸다", async () => {
    await recordPoll(db, { at: at("10:00"), ok: true, rowCount: 2000, durationMs: 12000, gateChanges: 3 });
    await recordPoll(db, { at: at("11:00"), ok: true, rowCount: 2000, durationMs: 16000, gateChanges: 1 });
    await recordPoll(db, { at: at("12:00"), ok: false, rowCount: 0, durationMs: 60000, gateChanges: 0, error: "x" });
    await recordPoll(db, { at: kst("2026-10-04 12:00"), ok: true, rowCount: 1, durationMs: 1, gateChanges: 9 });

    expect(await pollMetrics(db, kst("2026-10-05 00:00"))).toEqual({
      total: 3,
      failed: 1,
      avgDurationMs: 14000,
      gateChanges: 4,
      firstAt: at("10:00"),
      lastAt: at("12:00"),
    });
  });

  it("수집이 없으면 0 과 null", async () => {
    expect(await pollMetrics(db, kst("2026-10-05 00:00"))).toEqual({
      total: 0,
      failed: 0,
      avgDurationMs: null,
      gateChanges: 0,
      firstAt: null,
      lastAt: null,
    });
  });
});
