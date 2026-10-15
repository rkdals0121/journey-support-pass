import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeText, departsTomorrow, departureText } from "@/app/components/GuideParts";
import { FACILITY_KINDS, placeOf, type Place } from "@/lib/airport";
import { config } from "@/lib/config";
import type { Db } from "@/lib/db";
import { buildGuide, toFlightView } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { getJourney, loadJourneys, type Journey } from "@/lib/journey";
import type { PollState } from "@/lib/timing";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, hasKey, register, registerWithPass, resetData } from "./helpers/fixtures";

const poll: PollState = { label: "운항 정보 11:55 기준", stale: false, staleInMs: 130 * 60_000 };

/** 탑승동 127번 탑승구에서 14:30 에 떠나는 편의 여객. 마감까지 140분 남았다. */
function journey(over: Partial<Journey> = {}): Journey {
  return {
    registrationId: "00000000-0000-4000-8000-000000000001",
    choices: [],
    lang: "ko",
    submittedAt: kst("2026-10-05 12:00"),
    flightNo: "KE123",
    operatingNo: null,
    destName: "뉴욕",
    destCode: "JFK",
    terminal: "CONCOURSE",
    gate: 127,
    prevGate: null,
    gateChangedAt: null,
    schedAt: kst("2026-10-05 14:30"),
    estAt: null,
    status: "",
    minutesToClose: 140,
    cancelled: false,
    delayed: false,
    boardingNow: false,
    boardingClosed: false,
    ...over,
  };
}

const at = (id: string): Place => {
  const p = placeOf(id);
  if (!p) throw new Error(`없는 자리: ${id}`);
  return p;
};

describe("안내 화면의 항공편", () => {
  it("시각은 한국 시각 글자로 만들고, 터미널은 그대로 싣는다", () => {
    expect(toFlightView(journey(), kst("2026-10-05 12:00"))).toEqual({
      flightNo: "KE123",
      operatingNo: null,
      destName: "뉴욕",
      destCode: "JFK",
      area: "CONCOURSE",
      gate: 127,
      prevGate: null,
      schedTime: "14:30",
      estTime: null,
      delayed: false,
      day: "today",
      cancelled: false,
      status: "",
      close: "open",
      minutesToClose: 140,
      closeAtMs: kst("2026-10-05 14:20").getTime(),
      boardingNow: false,
      urgent: false,
    });
  });

  it("추정 마감 시각(ms)은 출발 10분 전이고, 지연되면 바뀐 출발 시각에서 잰다. open 일 때만 싣는다", () => {
    const closeAt = (over: Partial<Journey>) => toFlightView(journey(over)).closeAtMs;
    expect(config.boardingCloseMin).toBe(10);
    expect(closeAt({})).toBe(kst("2026-10-05 14:20").getTime());
    expect(closeAt({ estAt: kst("2026-10-05 16:10"), delayed: true })).toBe(kst("2026-10-05 16:00").getTime());
    expect(closeAt({ minutesToClose: -1 })).toBeNull();
    expect(closeAt({ status: "탑승마감", boardingClosed: true })).toBeNull();
    expect(closeAt({ status: "결항", cancelled: true, minutesToClose: null })).toBeNull();
    expect(closeAt({ schedAt: null, minutesToClose: null })).toBeNull();
  });

  it(`마감까지 ${config.urgentMin}분 이내이거나 마감이 지났으면 urgent 다`, () => {
    const urgent = (over: Partial<Journey>) => toFlightView(journey(over)).urgent;
    expect(config.urgentMin).toBe(30);
    expect(urgent({ minutesToClose: 31 })).toBe(false);
    expect(urgent({ minutesToClose: 30 })).toBe(true);
    expect(urgent({ minutesToClose: 0 })).toBe(true);
    // 추정 마감 시각이 지났거나(past) 공공데이터가 탑승 마감을 알렸다(closed).
    expect(urgent({ minutesToClose: -1 })).toBe(true);
    expect(urgent({ status: "탑승마감", boardingClosed: true, minutesToClose: 140 })).toBe(true);
  });

  it("결항이거나 운항 정보가 없으면 urgent 가 아니다", () => {
    expect(toFlightView(journey({ status: "결항", cancelled: true, minutesToClose: null })).urgent).toBe(false);
    expect(toFlightView(journey({ cancelled: true, boardingClosed: true })).urgent).toBe(false);
    expect(toFlightView(journey({ schedAt: null, minutesToClose: null })).urgent).toBe(false);
  });

  it("남은 시간이 있으면 open 이고 그 분을 싣는다. 0분도 아직 열려 있다", () => {
    expect(toFlightView(journey({ minutesToClose: 40 }))).toMatchObject({ close: "open", minutesToClose: 40 });
    expect(toFlightView(journey({ minutesToClose: 0 }))).toMatchObject({ close: "open", minutesToClose: 0 });
  });

  it("추정 마감 시각이 지나면 past 이고 남은 분은 싣지 않는다", () => {
    expect(toFlightView(journey({ minutesToClose: -1 }))).toMatchObject({ close: "past", minutesToClose: null });
    expect(toFlightView(journey({ minutesToClose: -50 }))).toMatchObject({ close: "past", minutesToClose: null });
  });

  it("공공데이터가 탑승 마감을 알리면 남은 시간이 있어도 closed 다", () => {
    const v = toFlightView(journey({ status: "탑승마감", boardingClosed: true, minutesToClose: 12 }));
    expect(v).toMatchObject({ close: "closed", minutesToClose: null, status: "탑승마감" });
  });

  it("결항은 cancelled 다. 탑승 마감 표시보다 앞선다", () => {
    const v = toFlightView(journey({ status: "결항", cancelled: true, minutesToClose: null }));
    expect(v).toMatchObject({ close: "cancelled", cancelled: true, minutesToClose: null });
    expect(toFlightView(journey({ cancelled: true, boardingClosed: true })).close).toBe("cancelled");
  });

  it("운항 정보가 없으면 unknown 이고 시각이 없다", () => {
    const v = toFlightView(journey({ schedAt: null, minutesToClose: null, terminal: "", gate: null }));
    expect(v).toMatchObject({ close: "unknown", minutesToClose: null, schedTime: null, estTime: null, area: "", gate: null });
  });

  it("출발 시각이 바뀌면 늦어졌든 앞당겨졌든 바뀐 시각을 싣는다. 지연(delayed)은 늦어졌을 때만이다", () => {
    const est = kst("2026-10-05 16:10");
    expect(toFlightView(journey({ estAt: est, delayed: true }))).toMatchObject({ schedTime: "14:30", estTime: "16:10", delayed: true });
    // 앞당겨진 편도 바뀐 시각을 싣는다. 남은 시간과 마감 시각은 이 시각으로 세므로, 화면의 시각도 같아야 한다.
    expect(toFlightView(journey({ estAt: kst("2026-10-05 14:20"), delayed: false }))).toMatchObject({
      schedTime: "14:30",
      estTime: "14:20",
      delayed: false,
    });
    // 같은 시각이 오거나 초만 다르면 바뀐 것이 아니다. 화면에는 분까지만 보인다.
    expect(toFlightView(journey({ estAt: kst("2026-10-05 14:30"), delayed: false })).estTime).toBeNull();
    expect(toFlightView(journey({ estAt: new Date(kst("2026-10-05 14:30").getTime() + 40_000), delayed: true })).estTime).toBeNull();
  });

  it("실제로 떠나는 날이 만든 때의 내일이면 day 는 tomorrow 다. 등록 화면과 같은 기준이다", () => {
    const now = kst("2026-10-05 16:00");
    const day = (over: Partial<Journey>) => toFlightView(journey(over), now).day;
    expect(day({})).toBe("today");
    expect(day({ schedAt: kst("2026-10-06 14:30") })).toBe("tomorrow");
    // 오늘 23:40 편이 00:15 로 늦어지면 내일 떠난다. 내일 00:10 편이 23:55 로 앞당겨지면 오늘 떠난다.
    expect(day({ schedAt: kst("2026-10-05 23:40"), estAt: kst("2026-10-06 00:15"), delayed: true })).toBe("tomorrow");
    expect(day({ schedAt: kst("2026-10-06 00:10"), estAt: kst("2026-10-05 23:55") })).toBe("today");
    expect(day({ schedAt: null, minutesToClose: null })).toBe("today");
    // 안내 내용을 만들 때도 그 시각으로 정한다.
    const g = buildGuide(journey({ schedAt: kst("2026-10-06 14:30"), minutesToClose: 1340 }), "123456", null, poll, now);
    expect(g.flight.day).toBe("tomorrow");
  });

  it("탑승 중 표시와 공동운항의 실제 운항 편명을 그대로 싣는다", () => {
    const v = toFlightView(journey({ flightNo: "MC830", operatingNo: "MK300", status: "탑승중", boardingNow: true }));
    expect(v).toMatchObject({ flightNo: "MC830", operatingNo: "MK300", boardingNow: true, status: "탑승중" });
  });
});

describe("항공편 판의 날과 마감 문구", () => {
  const ko = textOf("ko");
  const en = textOf("en");
  // 16:00 에 본 내일 14:30 편. 마감(내일 14:20)까지 22시간 20분 남았다.
  const now = kst("2026-10-05 16:00");
  const tomorrow = () => toFlightView(journey({ schedAt: kst("2026-10-06 14:30"), minutesToClose: 1340 }), now);

  it("마감까지 120분이 안 남으면 남은 분을, 그 이상이면 추정 마감 시각을 보여 준다", () => {
    expect(closeText(toFlightView(journey({ minutesToClose: 119 })), ko)).toBe("탑승 마감까지 119분 (추정)");
    // journey() 는 12:00 에 본 14:30 편이다. 마감은 14:20.
    expect(closeText(toFlightView(journey()), ko)).toBe("탑승 마감 14:20 (추정)");
    expect(closeText(toFlightView(journey({ lang: "en" })), en)).toBe("Boarding closes at 14:20 (estimate)");
  });

  it("내일 떠나는 편은 시각 앞에 내일을 붙이고, 마감 시각에도 내일을 붙인다", () => {
    expect(departsTomorrow(tomorrow())).toBe(true);
    expect(closeText(tomorrow(), ko)).toBe("탑승 마감 내일 14:20 (추정)");
    expect(closeText(tomorrow(), en)).toBe("Boarding closes tomorrow at 14:20 (estimate)");
    expect(closeText(tomorrow(), textOf("ko", true))).toBe("비행기 타는 문이 내일 14:20에 닫힙니다 (추정)");
    expect(departsTomorrow(toFlightView(journey(), kst("2026-10-05 12:00")))).toBe(false);
  });

  it("남겨 둔 패스를 다음 날 열어 남은 시간을 다시 세면 내일이 붙지 않는다", () => {
    // 다음 날 09:00 에 다시 센 것처럼 남은 분만 줄인다(PassView 의 liveFlight). 서버가 정한 day 는 그대로 tomorrow 다.
    const next = { ...tomorrow(), minutesToClose: 320 };
    expect(next.day).toBe("tomorrow");
    expect(departsTomorrow(next)).toBe(false);
    expect(closeText(next, ko)).toBe("탑승 마감 14:20 (추정)");
    // 마감이 지났으면 곧 떠나는 편이라 내일을 붙이지 않는다.
    expect(departsTomorrow({ ...tomorrow(), close: "past", minutesToClose: null })).toBe(false);
  });

  it("오늘 23:55 마감, 내일 00:05 출발이면 출발에만 내일을 붙인다", () => {
    const f = toFlightView(journey({ schedAt: kst("2026-10-06 00:05"), minutesToClose: 475 }), now);
    expect(f.day).toBe("tomorrow");
    expect(departsTomorrow(f)).toBe(true);
    expect(closeText(f, ko)).toBe("탑승 마감 23:55 (추정)");
  });

  it("자정 1분 전에 센 남은 시간도 내일을 붙인다. 남은 분을 내림해 센 때가 다음 날 00:00 으로 올라가지 않는다", () => {
    // 23:59:30 에 센 내일 14:30 편. 마감(내일 14:20)까지 860.5분이라 남은 분은 860 이다.
    const late = new Date(kst("2026-10-05 23:59").getTime() + 30_000);
    const f = toFlightView(journey({ schedAt: kst("2026-10-06 14:30"), minutesToClose: 860 }), late);
    expect(f.day).toBe("tomorrow");
    expect(departsTomorrow(f)).toBe(true);
    expect(closeText(f, ko)).toBe("탑승 마감 내일 14:20 (추정)");
    // 자정을 넘겨 00:00:30 에 다시 세면(859분) 오늘 편이다.
    const after = { ...f, minutesToClose: 859 };
    expect(departsTomorrow(after)).toBe(false);
    expect(closeText(after, ko)).toBe("탑승 마감 14:20 (추정)");
  });

  it("소리 안내의 출발 시각도 항공편 판처럼 내일을 말한다. 영어는 문장 가운데라 소문자다", () => {
    expect(departureText(tomorrow(), ko)).toBe("출발 내일 14:30");
    expect(departureText(tomorrow(), en)).toBe("Departure tomorrow 14:30");
    expect(departureText(toFlightView(journey(), kst("2026-10-05 12:00")), ko)).toBe("출발 14:30");
    // 바뀐 출발 시각이 있으면 그 시각을 말한다. 오늘 23:40 편이 내일 00:15 로 늦어졌다.
    const delayed = toFlightView(journey({ schedAt: kst("2026-10-05 23:40"), estAt: kst("2026-10-06 00:15"), delayed: true, minutesToClose: 485 }), now);
    expect(departureText(delayed, ko)).toBe("출발 내일 00:15");
    expect(departureText(toFlightView(journey({ schedAt: null, minutesToClose: null })), ko)).toBe("");
    // 쉬운 말에도 같은 낱말이 있다.
    expect(textOf("en", true).departTomorrow).toBe("tomorrow");
    expect(textOf("ko", true).departTomorrow).toBe("내일");
  });

  it("결항이면 남은 시간이 없으므로 서버가 정한 날을 따른다", () => {
    const f = toFlightView(journey({ schedAt: kst("2026-10-06 14:30"), status: "결항", cancelled: true, minutesToClose: null }), now);
    expect(departsTomorrow(f)).toBe(true);
    expect(closeText(f, ko)).toBe(ko.closeCancelled);
  });
});

describe("안내 내용: 길을 보여주지 못하는 까닭", () => {
  it("키오스크가 아니면 no_place. 길과 시설을 비운다", () => {
    const g = buildGuide(journey({ choices: ["mov_wheelchair_need", "fac_rest"] }), "123456", null, poll);
    expect(g).toMatchObject({ place: null, gateRoute: null, routeNote: "no_place", pace: null, facilities: [] });
  });

  it("보안검색 전 키오스크면 landside. 시설도 비운다", () => {
    const g = buildGuide(journey(), "123456", at("t1-info"), poll);
    expect(g).toMatchObject({ gateRoute: null, routeNote: "landside", pace: null, facilities: [] });
    expect(g.place).toEqual({
      id: "t1-info",
      label: "제1여객터미널 3층 안내데스크",
      labelEn: "Terminal 1, 3F Information Desk",
      level: 3,
      landside: true,
    });
  });

  it("탑승구가 아직 없거나 터미널을 모르면 no_gate. 가까운 시설은 보여준다", () => {
    for (const j of [journey({ gate: null }), journey({ terminal: "" }), journey({ terminal: "T9" })]) {
      const g = buildGuide(j, "123456", at("cc-center"), poll);
      expect(g).toMatchObject({ gateRoute: null, routeNote: "no_gate", pace: null });
      expect(g.facilities).toHaveLength(FACILITY_KINDS.length);
    }
  });

  it("걸어서 갈 수 없는 터미널이면 other_terminal. 지금 있는 곳의 시설은 보여준다", () => {
    const g = buildGuide(journey(), "123456", at("t2-center"), poll);
    expect(g).toMatchObject({ gateRoute: null, routeNote: "other_terminal", pace: null });
    expect(g.facilities).toHaveLength(FACILITY_KINDS.length);
    for (const f of g.facilities) expect(f.nearGate).toBeGreaterThanOrEqual(208);
    // 탑승동에서 제1여객터미널로도 걸어갈 수 없다.
    expect(buildGuide(journey({ terminal: "T1", gate: 20 }), "123456", at("cc-center"), poll).routeNote).toBe("other_terminal");
  });

  it("결항이면 cancelled. 탑승구가 있어도 길을 보여주지 않는다", () => {
    const j = journey({ status: "결항", cancelled: true, minutesToClose: null });
    const g = buildGuide(j, "123456", at("cc-center"), poll);
    expect(g).toMatchObject({ gateRoute: null, routeNote: "cancelled", pace: null });
    expect(g.flight.close).toBe("cancelled");
    expect(g.facilities).toHaveLength(FACILITY_KINDS.length);
  });

  it("까닭이 겹치면 no_place, cancelled, landside, no_gate 순으로 고른다", () => {
    const cancelled = journey({ cancelled: true, gate: null, minutesToClose: null });
    expect(buildGuide(cancelled, "123456", null, poll).routeNote).toBe("no_place");
    expect(buildGuide(cancelled, "123456", at("t1-info"), poll).routeNote).toBe("cancelled");
    expect(buildGuide(journey({ gate: null }), "123456", at("t1-info"), poll).routeNote).toBe("landside");
  });

  it("길이 있으면 까닭은 null 이다", () => {
    const g = buildGuide(journey(), "123456", at("cc-center"), poll);
    expect(g.routeNote).toBeNull();
    expect(g.gateRoute).toMatchObject({ meters: 315, minutes: 5, levelChanges: 0 });
    expect(g.gateRoute?.steps[0]).toMatchObject({ kind: "walk", towardGate: 127 });
  });

  it("제1여객터미널 키오스크에서 탑승동 탑승구까지는 셔틀트레인 길을 보여준다", () => {
    const g = buildGuide(journey(), "123456", at("t1-center"), poll);
    expect(g.routeNote).toBeNull();
    expect(g.gateRoute?.steps.map((s) => s.kind)).toEqual(["escalator", "shuttle", "escalator", "walk"]);
  });
});

describe("안내 내용: 고른 항목에 따라 달라지는 것", () => {
  it("계단이 어렵다고 한 여객의 길은 엘리베이터로 가고 천천히 걷는 시간으로 잰다", () => {
    const usual = buildGuide(journey(), "123456", at("cc-train"), poll);
    const noStairs = buildGuide(journey({ choices: ["mov_no_stairs"] }), "123456", at("cc-train"), poll);
    expect(usual.gateRoute?.steps.map((s) => s.kind)).toEqual(["escalator", "walk"]);
    expect(usual.gateRoute).toMatchObject({ minutes: 6, stepFree: false });
    expect(noStairs.gateRoute?.steps.map((s) => s.kind)).toEqual(["elevator", "walk"]);
    expect(noStairs.gateRoute).toMatchObject({ minutes: 10, stepFree: true });
  });

  it("고른 항목과 언어, 고유 일련 번호, 운항 정보 기준 시각을 그대로 싣는다", () => {
    const g = buildGuide(journey({ choices: ["gd_large", "stf_call"], lang: "en" }), "042917", at("cc-center"), poll);
    expect(g).toMatchObject({ passNo: "042917", lang: "en", choices: ["gd_large", "stf_call"], poll });
  });

  it("만든 시각과 임박 기준(분)을 싣는다. 화면이 남은 시간을 다시 셀 때 쓴다", () => {
    const now = kst("2026-10-05 12:00");
    const g = buildGuide(journey(), "123456", null, poll, now);
    expect(g).toMatchObject({ generatedAt: now.getTime(), urgentMin: config.urgentMin });
    // 시각을 넘기지 않으면 지금 시각으로 적는다.
    const before = Date.now();
    const later = buildGuide(journey(), "123456", null, poll).generatedAt;
    expect(later).toBeGreaterThanOrEqual(before);
    expect(later).toBeLessThanOrEqual(Date.now());
  });

  it("이름 칸은 없다. 싣는 칸은 정해진 열두 가지뿐이다", () => {
    const g = buildGuide(journey(), "123456", at("cc-center"), poll);
    expect(Object.keys(g).sort()).toEqual(
      [
        "choices",
        "facilities",
        "flight",
        "gateRoute",
        "generatedAt",
        "lang",
        "pace",
        "passNo",
        "place",
        "poll",
        "routeNote",
        "urgentMin",
      ].sort(),
    );
    expect(hasKey(g, "name")).toBe(false);
    expect(hasKey(g, "registrationId")).toBe(false);
  });
});

describe("안내 내용: 가까운 시설의 순서", () => {
  const kinds = (choices: string[]) =>
    buildGuide(journey({ choices }), "123456", at("cc-center"), poll).facilities.map((f) => [f.kind, f.chosen]);

  it("고른 것이 없으면 정해진 순서 그대로이고 모두 고르지 않은 것으로 표시한다", () => {
    expect(kinds([])).toEqual(FACILITY_KINDS.map((k) => [k, false]));
  });

  it("고른 시설을 먼저, 나머지를 그 뒤에 둔다", () => {
    expect(kinds(["fac_lounge"])).toEqual([
      ["lounge", true],
      ["restroom", false],
      ["nursing", false],
      ["rest", false],
      ["calm", false],
      ["wheelchair", false],
    ]);
    expect(kinds(["fac_calm", "fac_restroom", "stf_call"])).toEqual([
      ["restroom", true],
      ["calm", true],
      ["nursing", false],
      ["rest", false],
      ["lounge", false],
      ["wheelchair", false],
    ]);
  });

  it("휠체어가 필요하다고 하면 빌리는 곳이 맨 앞, 그다음이 고른 시설, 나머지 순이다", () => {
    expect(kinds(["mov_wheelchair_need", "fac_calm", "fac_rest"])).toEqual([
      ["wheelchair", true],
      ["rest", true],
      ["calm", true],
      ["restroom", false],
      ["nursing", false],
      ["lounge", false],
    ]);
    expect(kinds(["mov_wheelchair_need"])[0]).toEqual(["wheelchair", true]);
  });

  it("자기 휠체어를 이용하는 여객에게는 빌리는 곳을 앞에 두지 않는다", () => {
    expect(kinds(["mov_wheelchair_own"])).toEqual(FACILITY_KINDS.map((k) => [k, false]));
  });

  it("시설마다 그 자리에서 가는 길이 함께 온다", () => {
    const g = buildGuide(journey({ choices: ["mov_wheelchair_need"] }), "123456", at("cc-train"), poll);
    expect(g.facilities[0]).toMatchObject({ kind: "wheelchair", nearGate: 116, level: 3, chosen: true });
    expect(g.facilities[0].route.steps.map((s) => s.kind)).toEqual(["elevator", "walk"]);
  });
});

describe("길 요약 한 줄", () => {
  // 쉬운 말에는 이 문구가 따로 없어 기본 문구를 그대로 쓴다. 네 가지 모두 같은 규칙을 따르는지 본다.
  const texts = [textOf("ko"), textOf("ko", true), textOf("en"), textOf("en", true)];
  const facility = (place: string, kind: string, choices: string[] = []) =>
    buildGuide(journey({ choices }), "123456", at(place), poll).facilities.find((f) => f.kind === kind)!;

  it("가운데 키오스크에서 바로 위층의 라운지는 걷는 거리가 0m 여도 바로 앞이라고 하지 않는다", () => {
    for (const place of ["t1-center", "t2-center"]) {
      for (const choices of [[], ["mov_no_stairs"]]) {
        const { route, level } = facility(place, "lounge", choices);
        // 걷는 구간은 둘 다 15m 가 안 되어 적지 않고, 층만 옮긴다.
        expect(level).toBe(4);
        expect(route).toMatchObject({ meters: 0, levelChanges: 1 });
        expect(route.minutes).toBeGreaterThan(0);
        for (const t of texts) {
          expect(t.routeSummary(route.minutes, route.meters), `${place} ${choices.join(",")}`).not.toMatch(/바로 앞|Right here/);
        }
      }
    }
    const { route } = facility("t1-center", "lounge", ["mov_no_stairs"]);
    expect(textOf("ko").routeSummary(route.minutes, route.meters)).toBe("약 3분");
    expect(textOf("ko", true).routeSummary(route.minutes, route.meters)).toBe("약 3분");
    expect(textOf("en").routeSummary(route.minutes, route.meters)).toBe("About 3 min");
    expect(textOf("en", true).routeSummary(route.minutes, route.meters)).toBe("About 3 min");
  });

  it("구간이 하나도 없는 길만 바로 앞이다", () => {
    // 125번 탑승구 앞 키오스크의 쉴 곳은 그 자리에 있다.
    const { route } = facility("cc-125", "rest");
    expect(route).toMatchObject({ steps: [], meters: 0, minutes: 0 });
    expect(textOf("ko").routeSummary(route.minutes, route.meters)).toBe("바로 앞입니다");
    expect(textOf("ko", true).routeSummary(route.minutes, route.meters)).toBe("바로 앞입니다");
    expect(textOf("en").routeSummary(route.minutes, route.meters)).toBe("Right here");
    expect(textOf("en", true).routeSummary(route.minutes, route.meters)).toBe("Right here");
  });

  it("걷는 구간이 있으면 시간과 거리를 함께 보여 준다", () => {
    const route = buildGuide(journey(), "123456", at("cc-center"), poll).gateRoute!;
    expect(textOf("ko").routeSummary(route.minutes, route.meters)).toBe("약 5분 · 315m");
    expect(textOf("en").routeSummary(route.minutes, route.meters)).toBe("About 5 min · 315 m");
  });
});

describe("안내 내용: 걸리는 시간과 남은 시간", () => {
  // 탑승동 중앙에서 127번 탑승구까지 보통 걸음으로 5분이다.
  const pace = (over: Partial<Journey>) => buildGuide(journey(over), "123456", at("cc-center"), poll).pace;

  it("가고도 15분 이상 남으면 ok", () => {
    expect(pace({ minutesToClose: 140 })).toBe("ok");
    expect(pace({ minutesToClose: 20 })).toBe("ok");
  });

  it("가면 닿지만 15분이 안 남으면 hurry", () => {
    expect(pace({ minutesToClose: 19 })).toBe("hurry");
    expect(pace({ minutesToClose: 5 })).toBe("hurry");
  });

  it("가는 시간이 남은 시간보다 길면 late", () => {
    expect(pace({ minutesToClose: 4 })).toBe("late");
    expect(pace({ minutesToClose: -3 })).toBe("late");
  });

  it("공공데이터가 탑승 마감을 알리면 남은 시간과 무관하게 late", () => {
    expect(pace({ minutesToClose: 140, boardingClosed: true, status: "탑승마감" })).toBe("late");
  });

  it("천천히 걷는 여객은 같은 남은 시간에도 더 서둘러야 한다", () => {
    // 휠체어 이용: 315m 를 7분에 간다. 21분 남으면 여유가 14분이다.
    expect(pace({ minutesToClose: 21 })).toBe("ok");
    expect(pace({ minutesToClose: 21, choices: ["mov_wheelchair_own"] })).toBe("hurry");
    expect(pace({ minutesToClose: 6 })).toBe("hurry");
    expect(pace({ minutesToClose: 6, choices: ["mov_wheelchair_own"] })).toBe("late");
  });

  it("길이 없거나 결항이거나 남은 시간을 모르면 null", () => {
    expect(buildGuide(journey(), "123456", null, poll).pace).toBeNull();
    expect(buildGuide(journey(), "123456", at("t2-center"), poll).pace).toBeNull();
    expect(pace({ cancelled: true, minutesToClose: null })).toBeNull();
    expect(pace({ minutesToClose: null })).toBeNull();
  });
});

describe("등록에서 읽어 온 여정", () => {
  const t0 = kst("2026-10-05 12:00");
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  beforeEach(async () => {
    await resetData(db);
  });

  it("고른 항목과 항공편, 마감까지 남은 분이 들어 있다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 127 })], t0);
    const { registration } = await registerWithPass(db, t0, { choices: ["stf_call", "gd_large"], lang: "en" });
    const j = await getJourney(db, registration.id, t0);
    expect(j).toMatchObject({
      registrationId: registration.id,
      choices: ["gd_large", "stf_call"], // 표 순서
      lang: "en",
      flightNo: "KE123",
      operatingNo: null,
      destName: "뉴욕",
      destCode: "JFK",
      terminal: "CONCOURSE",
      gate: 127,
      prevGate: null,
      minutesToClose: 140,
      cancelled: false,
      delayed: false,
      boardingNow: false,
      boardingClosed: false,
    });
    expect(hasKey(j, "name")).toBe(false);
  });

  it("패스를 받지 않은 등록과 없는 id 는 읽지 않는다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const pending = await register(db, t0);
    expect(await getJourney(db, pending.id, t0)).toBeNull();
    expect(await getJourney(db, "not-a-uuid", t0)).toBeNull();
    expect(await getJourney(db, "00000000-0000-4000-8000-000000000009", t0)).toBeNull();
    expect(await loadJourneys(db, t0)).toEqual([]);
  });

  it("바뀌기 전 탑승구는 탑승구가 실제로 바뀌었을 때만 나온다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 112 })], t0);
    const { registration } = await registerWithPass(db, t0);
    const view = async (now: Date) => toFlightView((await getJourney(db, registration.id, now))!);

    expect(await view(t0)).toMatchObject({ gate: 112, prevGate: null });

    // 같은 탑승구가 다시 오거나 탑승구가 비어 와도 바뀐 것이 아니다.
    const t1 = kst("2026-10-05 12:10");
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 112 })], t1);
    expect(await view(t1)).toMatchObject({ gate: 112, prevGate: null });
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: null })], t1);
    expect(await view(t1)).toMatchObject({ gate: 112, prevGate: null });

    // 실제로 바뀌면 바뀌기 전 번호가 함께 온다.
    const t2 = kst("2026-10-05 12:20");
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 120 })], t2);
    expect(await view(t2)).toMatchObject({ gate: 120, prevGate: 112 });
    expect((await getJourney(db, registration.id, t2))?.gateChangedAt).toEqual(t2);

    // 그 뒤 같은 탑승구가 계속 와도 바뀌기 전 번호는 남는다.
    const t3 = kst("2026-10-05 12:30");
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 120 })], t3);
    expect(await view(t3)).toMatchObject({ gate: 120, prevGate: 112 });
  });

  it("탑승구가 처음 정해진 것은 바뀐 것이 아니다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: null })], t0);
    const { registration } = await registerWithPass(db, t0);
    expect(await getJourney(db, registration.id, t0)).toMatchObject({ gate: null, prevGate: null });
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 105 })], kst("2026-10-05 12:10"));
    expect(await getJourney(db, registration.id, t0)).toMatchObject({ gate: 105, prevGate: null, gateChangedAt: null });
  });

  it("공동운항은 실제 운항 편의 탑승구·시각·상태를 쓰고, 도착지는 여객이 고른 편의 것을 쓴다", async () => {
    await addFlights(
      db,
      [
        flightRow("OP1", "2026-10-05 14:30", { gate: 104, estAt: kst("2026-10-05 15:30"), status: "지연", destName: "하노이" }),
        flightRow("CS1", "2026-10-05 14:30", { masterNo: "OP1", gate: null, destName: "하노이(공동운항)", destCode: "HAN" }),
      ],
      t0,
    );
    const { registration } = await registerWithPass(db, t0, { flightNo: "CS1" });
    const j = await getJourney(db, registration.id, t0);
    expect(j).toMatchObject({
      flightNo: "CS1",
      operatingNo: "OP1",
      destName: "하노이(공동운항)",
      destCode: "HAN",
      gate: 104,
      status: "지연",
      delayed: true,
      minutesToClose: 200, // 15:30 출발, 15:20 마감
    });
    expect(toFlightView(j!)).toMatchObject({ schedTime: "14:30", estTime: "15:30", operatingNo: "OP1" });
  });

  it("실제 운항 편이 테이블에 없으면 여객이 고른 편의 값을 쓴다", async () => {
    await addFlights(db, [flightRow("AA1", "2026-10-05 20:00", { masterNo: "ZZ9", gate: 110 })], t0);
    const { registration } = await registerWithPass(db, t0, { flightNo: "AA1" });
    expect(await getJourney(db, registration.id, t0)).toMatchObject({ flightNo: "AA1", operatingNo: null, gate: 110 });
  });

  it("상태 문구에서 결항·탑승중·탑승마감을 읽는다", async () => {
    await addFlights(
      db,
      [
        flightRow("CX1", "2026-10-05 16:00", { status: "결항" }),
        flightRow("BD1", "2026-10-05 16:00", { status: "탑승중" }),
        flightRow("BD2", "2026-10-05 16:00", { status: "마감예정" }),
        flightRow("CL1", "2026-10-05 13:00", { status: "탑승마감" }),
      ],
      t0,
    );
    const of = async (flightNo: string) => {
      const { registration } = await registerWithPass(db, t0, { flightNo });
      return (await getJourney(db, registration.id, t0))!;
    };
    expect(await of("CX1")).toMatchObject({ cancelled: true, minutesToClose: null });
    expect(await of("BD1")).toMatchObject({ boardingNow: true, boardingClosed: false, minutesToClose: 230 });
    expect(await of("BD2")).toMatchObject({ boardingNow: true, boardingClosed: false });
    expect(await of("CL1")).toMatchObject({ boardingNow: false, boardingClosed: true, minutesToClose: 50 });
  });

  it("예전 구조의 코드가 남아 있어도 아는 항목만 돌려준다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0, { choices: ["fac_rest"] });
    await db.query("update registrations set needs = $2 where id = $1", [
      registration.id,
      ["com_slow", "fac_rest", "cat_senior", "gd_easy"],
    ]);
    expect((await getJourney(db, registration.id, t0))?.choices).toEqual(["gd_easy", "fac_rest"]);
  });

  it("운항 정보가 사라지면 시각과 남은 시간이 비고, 안내는 unknown 으로 나온다", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], t0);
    const { registration } = await registerWithPass(db, t0);
    await db.query("delete from flights");
    const j = (await getJourney(db, registration.id, t0))!;
    expect(j).toMatchObject({ flightNo: "KE123", schedAt: null, gate: null, terminal: "", minutesToClose: null });
    const g = buildGuide(j, "123456", at("cc-center"), poll);
    expect(g.flight.close).toBe("unknown");
    expect(g.routeNote).toBe("no_gate");
  });
});
