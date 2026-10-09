import { describe, expect, it } from "vitest";
import {
  GROUP_EN,
  GROUP_LABEL,
  GROUPS,
  ITEMS,
  groupOf,
  isAdapted,
  itemOf,
  itemsOf,
  knownCodes,
  labelOf,
  prefsOf,
  shortOf,
  validateChoices,
} from "@/lib/catalog";
import { textOf } from "@/lib/i18n";

describe("선택 항목", () => {
  it("16개이고 코드가 겹치지 않는다", () => {
    expect(ITEMS).toHaveLength(16);
    expect(new Set(ITEMS.map((i) => i.code)).size).toBe(16);
  });

  it("묶음은 안내받는 방식, 이동, 찾는 시설, 직원 도움 순이다", () => {
    expect(GROUPS).toEqual(["guide", "move", "facility", "staff"]);
    expect(GROUPS.map((g) => GROUP_LABEL[g])).toEqual(["안내받는 방식", "이동", "찾는 시설", "직원 도움"]);
    // 표에서도 묶음이 이 순서로 이어진다.
    const order = ITEMS.map((i) => GROUPS.indexOf(i.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("묶음별 코드", () => {
    const codes = (g: Parameters<typeof itemsOf>[0]) => itemsOf(g).map((i) => i.code);
    expect(codes("guide")).toEqual(["gd_large", "gd_voice", "gd_picture", "gd_easy"]);
    expect(codes("move")).toEqual([
      "mov_wheelchair_own",
      "mov_wheelchair_need",
      "mov_no_stairs",
      "mov_need_rest",
      "mov_no_standing",
    ]);
    expect(codes("facility")).toEqual(["fac_restroom", "fac_nursing", "fac_rest", "fac_lounge", "fac_calm"]);
    expect(codes("staff")).toEqual(["stf_call", "stf_self"]);
  });

  it("안내받는 방식은 제안서의 문구와 순서를 따른다", () => {
    expect(itemsOf("guide").map((i) => i.label)).toEqual([
      "큰 글씨로 보여주세요",
      "소리로 읽어주세요",
      "글과 그림으로 보여주세요",
      "쉬운 말로 알려주세요",
    ]);
  });

  it("교통약자 구분과 이름을 묻는 항목은 없다", () => {
    for (const i of ITEMS) {
      expect(i.code).not.toMatch(/^cat_/);
      expect(i.label).not.toMatch(/이름|장애가 있습니다|고령자|임신/);
    }
  });

  it("코드로 문구, 줄인 말, 묶음을 찾는다", () => {
    expect(labelOf("mov_no_stairs")).toBe("계단이나 에스컬레이터 이용이 어렵습니다");
    expect(labelOf("mov_no_stairs", "en")).toBe("Stairs and escalators are difficult for me");
    expect(shortOf("mov_no_stairs")).toBe("계단 어려움");
    expect(groupOf("mov_no_stairs")).toBe("move");
    expect(itemOf("stf_call")?.group).toBe("staff");
  });

  it("없는 코드는 빈 글자와 null", () => {
    expect(labelOf("nope")).toBe("");
    expect(labelOf("nope", "en")).toBe("");
    expect(shortOf("nope")).toBe("");
    expect(groupOf("nope")).toBeNull();
    expect(itemOf("nope")).toBeNull();
  });

  it("항목마다 줄인 말이 있고 서로 겹치지 않는다", () => {
    const shorts = ITEMS.map((i) => i.short);
    for (const s of shorts) expect(s.trim().length).toBeGreaterThan(0);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});

describe("아는 항목만 고르기", () => {
  it("모르는 코드는 버리고 표 순서로 돌려준다", () => {
    expect(knownCodes(["stf_call", "cat_senior", "gd_large", "com_slow", "fac_rest"])).toEqual([
      "gd_large",
      "fac_rest",
      "stf_call",
    ]);
    expect(knownCodes([])).toEqual([]);
    expect(knownCodes(["cat_senior"])).toEqual([]);
  });
});

describe("선택 검증", () => {
  it("아무것도 고르지 않아도 된다", () => {
    expect(validateChoices([])).toBeNull();
  });

  it("여러 묶음에서 여러 개를 고를 수 있다", () => {
    expect(validateChoices(["gd_large", "gd_voice", "mov_wheelchair_own", "mov_no_stairs", "fac_restroom", "fac_rest", "stf_self"])).toBeNull();
    expect(validateChoices(ITEMS.map((i) => i.code).filter((c) => c !== "stf_self"))).toBeNull();
  });

  it("직원 도움은 하나만 고를 수 있다", () => {
    expect(validateChoices(["stf_call"])).toBeNull();
    expect(validateChoices(["stf_self"])).toBeNull();
    expect(validateChoices(["stf_call", "stf_self"])).toContain("하나만");
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
    expect(validateChoices(["com_slow"])).not.toBeNull();
  });

  it("같은 코드를 두 번 보내면 거부한다", () => {
    expect(validateChoices(["gd_large", "gd_large"])).not.toBeNull();
  });
});

describe("화면 설정으로 바꾸기", () => {
  it("안내받는 방식을 하나라도 켰는지 본다", () => {
    expect(isAdapted([])).toBe(false);
    expect(isAdapted(["mov_no_stairs", "fac_rest", "stf_call"])).toBe(false);
    for (const i of itemsOf("guide")) expect(isAdapted(["mov_no_stairs", i.code])).toBe(true);
  });

  it("고른 항목에서 화면 설정을 만든다", () => {
    expect(prefsOf([])).toEqual({ large: false, voice: false, picture: false, easy: false, wantsStaff: false });
    expect(prefsOf(["gd_large", "gd_easy", "stf_call", "mov_no_stairs"])).toEqual({
      large: true,
      voice: false,
      picture: false,
      easy: true,
      wantsStaff: true,
    });
    expect(prefsOf(["gd_voice", "gd_picture", "stf_self"])).toEqual({
      large: false,
      voice: true,
      picture: true,
      easy: false,
      wantsStaff: false,
    });
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
