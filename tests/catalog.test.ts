import { describe, expect, it } from "vitest";
import {
  branchesOf,
  cleanExtra,
  GROUP_EN,
  GROUP_LABEL,
  GROUPS,
  groupsOfBranch,
  ITEMS,
  groupOf,
  isAdapted,
  itemOf,
  itemsOf,
  knownCodes,
  labelOf,
  mobilityNeeds,
  prefsOf,
  pruneChoices,
  shortOf,
  supportNeeds,
  toggleChoice,
  validateChoices,
} from "@/lib/catalog";
import { textOf } from "@/lib/i18n";

describe("선택 항목 (공항 이용 도움 체크리스트)", () => {
  it("코드가 겹치지 않는다", () => {
    expect(new Set(ITEMS.map((i) => i.code)).size).toBe(ITEMS.length);
  });

  it("묶음은 1쪽 불편 → 2쪽 가지 → 3쪽 세 가지 순이고, 표에서도 이 순서로 이어진다", () => {
    expect(GROUPS).toEqual(["trouble", "walk", "buggy", "stand", "see", "hear", "understand", "child", "unsure", "companion", "help", "stops"]);
    const order = ITEMS.map((i) => GROUPS.indexOf(i.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("1쪽 「어떤 점이 불편하세요?」는 체크리스트의 여덟 가지와 순서를 따른다", () => {
    expect(itemsOf("trouble").map((i) => i.label)).toEqual([
      "걷기",
      "서서 기다리기",
      "보기",
      "듣기 · 말하기",
      "안내 이해하기",
      "아이와 함께 가기",
      "잘 모르겠어요",
      "지금은 없어요",
    ]);
  });

  it("가지 안의 문구는 체크리스트와 같다", () => {
    const labels = (g: Parameters<typeof itemsOf>[0]) => itemsOf(g).map((i) => i.label);
    expect(labels("walk")).toEqual(["휠체어를 써요", "휠체어를 빌릴래요", "계단과 에스컬레이터는 어려워요", "중간에 쉬어야 해요", "천천히 가요"]);
    expect(labels("buggy")).toEqual(["타고 싶어요", "걷다가 힘들면 그때 부를래요", "괜찮아요"]);
    expect(labels("stand")).toEqual(["앉을 곳을 알려주세요", "앉아서 기다리게 도와주세요"]);
    expect(labels("see")).toEqual([
      "큰 글씨로 보여주세요",
      "소리로 읽어주세요",
      "점자 안내가 있는 곳을 알려주세요",
      "로봇을 잡고 따라갈래요",
      "소리만 따라갈래요",
      "흰지팡이를 써요",
      "안내견과 함께 가요",
    ]);
    expect(labels("hear")).toEqual(["글로 보여주세요", "글로 답할래요", "그림을 가리켜 답할래요", "수어 도움이 필요해요"]);
    expect(labels("understand")).toEqual(["한 번에 하나씩 보여주세요", "그림과 함께 보여주세요", "쉬운 말로 알려주세요", "천천히 설명해 주세요"]);
    expect(labels("child")).toEqual([
      "수유할 곳이 필요해요",
      "분유를 준비할 곳이 필요해요",
      "기저귀 갈 곳이 필요해요",
      "유모차와 함께 가요",
      "유모차를 빌릴래요",
      "아이가 쉴 곳이 필요해요",
    ]);
    expect(labels("unsure")).toEqual(["질문을 하나씩 해 주세요"]);
    expect(labels("companion")).toEqual(["혼자 가요", "함께 가는 분이 있어요", "그중 도움이 필요한 분이 더 있어요"]);
    expect(labels("help")).toEqual(["직원이 먼저 찾아와 주세요", "제가 필요할 때 부를게요", "탑승구까지 함께 가주세요", "로봇과 함께 갈래요"]);
    expect(labels("stops")).toEqual(["화장실", "수유실 · 기저귀 갈 곳", "유모차 빌리는 곳", "약국", "밥 먹을 곳", "조용히 쉴 곳", "들를 곳 없어요"]);
  });

  it("교통약자 구분과 이름을 묻는 항목은 없다", () => {
    for (const i of ITEMS) {
      expect(i.code).not.toMatch(/^cat_/);
      expect(i.label).not.toMatch(/이름|장애가 있습니다|고령자|임신/);
    }
  });

  it("코드로 문구, 줄인 말, 묶음을 찾는다", () => {
    expect(labelOf("mov_no_stairs")).toBe("계단과 에스컬레이터는 어려워요");
    expect(labelOf("mov_no_stairs", "en")).toBe("Stairs and escalators are hard for me");
    expect(shortOf("mov_no_stairs")).toBe("계단 어려움");
    expect(groupOf("mov_no_stairs")).toBe("walk");
    expect(itemOf("stf_call")?.group).toBe("help");
  });

  it("없는 코드는 빈 글자와 null", () => {
    expect(labelOf("nope")).toBe("");
    expect(labelOf("nope", "en")).toBe("");
    expect(shortOf("nope")).toBe("");
    expect(groupOf("nope")).toBeNull();
    expect(itemOf("nope")).toBeNull();
  });

  it("항목마다 줄인 말이 있다", () => {
    for (const i of ITEMS) expect(i.short.trim().length, i.code).toBeGreaterThan(0);
  });
});

describe("가지", () => {
  it("1쪽에서 고른 불편만 가지를 연다", () => {
    expect(branchesOf([])).toEqual([]);
    expect(branchesOf(["tr_none"])).toEqual([]);
    expect(branchesOf(["tr_child", "tr_walk"])).toEqual(["walk", "child"]);
    expect(groupsOfBranch("walk")).toEqual(["walk", "buggy"]);
  });

  it("불편을 풀면 그 가지의 답도 지운다", () => {
    let c = toggleChoice([], "tr_walk");
    c = toggleChoice(c, "mov_no_stairs");
    c = toggleChoice(c, "bug_ride");
    c = toggleChoice(c, "stf_call");
    expect(c).toEqual(["tr_walk", "mov_no_stairs", "bug_ride", "stf_call"]);
    expect(toggleChoice(c, "tr_walk")).toEqual(["stf_call"]);
    expect(pruneChoices(["gd_large", "fac_restroom"])).toEqual(["fac_restroom"]);
  });

  it("「지금은 없어요」「들를 곳 없어요」는 다른 것과 함께 고르지 않는다", () => {
    expect(toggleChoice(["tr_walk", "mov_slow"], "tr_none")).toEqual(["tr_none"]);
    expect(toggleChoice(["tr_none"], "tr_see")).toEqual(["tr_see"]);
    expect(toggleChoice(["fac_restroom", "stp_food"], "stp_none")).toEqual(["stp_none"]);
    expect(toggleChoice(["stp_none"], "stp_food")).toEqual(["stp_food"]);
  });

  it("전동차와 함께 가는 분은 하나만, 로봇 동행 방식과 직원 방문·호출은 둘 중 하나만 고른다", () => {
    expect(toggleChoice(["tr_walk", "bug_ride"], "bug_no")).toEqual(["tr_walk", "bug_no"]);
    expect(toggleChoice(["cmp_alone"], "cmp_with")).toEqual(["cmp_with"]);
    expect(toggleChoice(["tr_see", "robot_hold"], "robot_sound")).toEqual(["tr_see", "robot_sound"]);
    expect(toggleChoice(["stf_visit", "stf_escort"], "stf_call")).toEqual(["stf_escort", "stf_call"]);
  });
});

describe("아는 항목만 고르기", () => {
  it("모르는 코드와 예전 구조의 코드는 버리고 표 순서로 돌려준다", () => {
    expect(knownCodes(["stf_call", "cat_senior", "gd_large", "fac_rest", "stf_self", "tr_see"])).toEqual(["tr_see", "gd_large", "stf_call"]);
    expect(knownCodes([])).toEqual([]);
    expect(knownCodes(["cat_senior"])).toEqual([]);
  });
});

describe("선택 검증", () => {
  it("아무것도 고르지 않아도 된다", () => {
    expect(validateChoices([])).toBeNull();
  });

  it("여러 묶음에서 여러 개를 고를 수 있다", () => {
    expect(
      validateChoices(["tr_walk", "tr_see", "mov_wheelchair_own", "mov_no_stairs", "bug_later", "gd_large", "see_dog", "cmp_with", "stf_call", "stf_escort", "fac_restroom", "stp_food"]),
    ).toBeNull();
  });

  it("하나만 고르는 묶음과 함께 고를 수 없는 것을 거부한다", () => {
    expect(validateChoices(["bug_ride", "bug_no"])).toContain("하나만");
    expect(validateChoices(["cmp_alone", "cmp_with"])).toContain("하나만");
    expect(validateChoices(["tr_none", "tr_walk"])).toContain("함께 고를 수 없습니다");
    expect(validateChoices(["stp_none", "fac_restroom"])).toContain("함께 고를 수 없습니다");
    expect(validateChoices(["robot_hold", "robot_sound"])).toContain("함께 고를 수 없습니다");
    expect(validateChoices(["stf_visit", "stf_call"])).toContain("함께 고를 수 없습니다");
  });

  it("목록이 아니거나 글자가 아닌 값이 섞이면 거부한다", () => {
    expect(validateChoices(null)).not.toBeNull();
    expect(validateChoices(undefined)).not.toBeNull();
    expect(validateChoices("gd_large")).not.toBeNull();
    expect(validateChoices({ 0: "gd_large" })).not.toBeNull();
    expect(validateChoices(["gd_large", 3])).not.toBeNull();
    expect(validateChoices([null])).not.toBeNull();
  });

  it("없는 코드와 예전 구조의 코드는 거부한다", () => {
    expect(validateChoices(["nope"])).not.toBeNull();
    expect(validateChoices(["gd_large", "cat_senior"])).not.toBeNull();
    expect(validateChoices(["fac_rest"])).not.toBeNull();
    expect(validateChoices(["stf_self"])).not.toBeNull();
  });

  it("같은 코드를 두 번 보내면 거부한다", () => {
    expect(validateChoices(["gd_large", "gd_large"])).not.toBeNull();
  });
});

describe("함께 받는 숫자와 말씀", () => {
  it("범위를 벗어난 숫자는 버리고 말씀은 자른다", () => {
    expect(cleanExtra({})).toEqual({ party: null, strollers: null, note: "" });
    expect(cleanExtra({ party: 3, strollers: 1, note: "  엘리베이터를 꼭 타야 해요 " })).toEqual({ party: 3, strollers: 1, note: "엘리베이터를 꼭 타야 해요" });
    expect(cleanExtra({ party: 0, strollers: -1 })).toEqual({ party: null, strollers: null, note: "" });
    expect(cleanExtra({ party: 2.5, strollers: "2" })).toEqual({ party: null, strollers: null, note: "" });
    expect(cleanExtra({ party: 99 }).party).toBeNull();
    expect(cleanExtra({ note: "가".repeat(500) }).note).toHaveLength(200);
    expect(cleanExtra({ note: "줄\n바꿈\u0000" }).note).toBe("줄\n바꿈");
  });
});

describe("화면 설정으로 바꾸기", () => {
  it("맞춤 화면을 하나라도 켰는지 본다", () => {
    expect(isAdapted([])).toBe(false);
    expect(isAdapted(["tr_walk", "mov_no_stairs", "stf_call"])).toBe(false);
    for (const c of ["gd_large", "gd_voice", "gd_picture", "gd_easy", "und_one", "und_slow", "hear_text"]) expect(isAdapted(["mov_no_stairs", c])).toBe(true);
  });

  it("고른 항목에서 화면 설정을 만든다", () => {
    expect(prefsOf([])).toEqual({ large: false, voice: false, picture: false, easy: false, slow: false, wantsStaff: false });
    expect(prefsOf(["gd_large", "gd_easy", "stf_call", "mov_no_stairs"])).toEqual({
      large: true,
      voice: false,
      picture: false,
      easy: true,
      slow: false,
      wantsStaff: true,
    });
    expect(prefsOf(["gd_voice", "gd_picture", "und_slow"])).toEqual({
      large: false,
      voice: true,
      picture: true,
      easy: false,
      slow: true,
      wantsStaff: false,
    });
    expect(prefsOf(["uns_one"]).easy).toBe(true);
    expect(prefsOf(["hear_point"]).picture).toBe(true);
    expect(prefsOf(["stf_visit"]).wantsStaff).toBe(true);
  });
});

describe("직원에게 보이는 항목", () => {
  it("이동지원·우대출구는 걷기·전동차·도움 방식과 이동에 따르는 것만 본다", () => {
    expect(mobilityNeeds(["tr_walk", "mov_wheelchair_own", "bug_ride", "gd_large", "see_dog", "stf_escort", "fac_restroom"])).toEqual([
      "휠체어 이용",
      "전동차 원함",
      "안내견",
      "탑승구 동행",
    ]);
  });

  it("직원 호출은 1쪽의 불편 이름과 「없어요」를 빼고 보인다", () => {
    expect(supportNeeds(["tr_see", "gd_voice", "tr_none", "stp_none", "fac_restroom"])).toEqual(["소리 안내", "화장실"]);
  });
});

describe("영어 문구", () => {
  it("선택 항목과 묶음마다 영어 문구가 있다", () => {
    for (const i of ITEMS) {
      expect(i.en.trim().length, i.code).toBeGreaterThan(5);
      expect(i.en, i.code).not.toMatch(/[가-힣]/);
    }
    expect(Object.keys(GROUP_EN).sort()).toEqual(Object.keys(GROUP_LABEL).sort());
    for (const v of Object.values(GROUP_EN)) expect(v.trim().length).toBeGreaterThan(0);
  });

  it("화면 문구는 한국어와 영어의 항목이 같고 빈 글자가 없다", () => {
    const ko = textOf("ko");
    const en = textOf("en");
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === "string") expect(v.trim().length, k).toBeGreaterThan(0);
      expect(typeof v, k).toBe(typeof (ko as Record<string, unknown>)[k]);
    }
  });

  it("쉬운 말은 있는 문구만 바꾸고 나머지는 그대로 둔다", () => {
    for (const lang of ["ko", "en"] as const) {
      const base = textOf(lang);
      const easy = textOf(lang, true);
      expect(Object.keys(easy).sort()).toEqual(Object.keys(base).sort());
      expect(easy.langName).toBe(base.langName);
    }
  });
});
