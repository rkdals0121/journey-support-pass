import { describe, expect, it } from "vitest";
import { ITEMS, itemsOf, labelOf, supportGroups, validateSelection } from "@/lib/catalog";

describe("선택 항목", () => {
  it("19개이고 코드가 겹치지 않는다", () => {
    expect(ITEMS).toHaveLength(19);
    expect(new Set(ITEMS.map((i) => i.code)).size).toBe(19);
  });

  it("교통약자 구분은 명세의 문구와 순서를 따른다", () => {
    expect(itemsOf("category").map((i) => i.label)).toEqual([
      "장애가 있습니다",
      "고령자입니다",
      "임신 중입니다",
      "영유아와 함께합니다",
      "어린이와 함께합니다",
    ]);
  });

  it("묶음별 개수", () => {
    expect(itemsOf("move")).toHaveLength(6);
    expect(itemsOf("comm")).toHaveLength(5);
    expect(itemsOf("env")).toHaveLength(1);
    expect(itemsOf("accompany")).toHaveLength(2);
  });

  it("코드로 문구를 찾는다", () => {
    expect(labelOf("mov_no_stairs")).toBe("계단이나 에스컬레이터 이용이 어렵습니다");
    expect(labelOf("nope")).toBe("");
  });
});

describe("지원 종류 환산", () => {
  it("묶음 이름만, 표 순서로, 중복 없이 남긴다", () => {
    expect(supportGroups(["com_slow", "mov_no_stairs", "mov_escort"])).toEqual(["이동", "감각·소통"]);
    expect(supportGroups([])).toEqual([]);
    expect(supportGroups(["acc_stroller", "env_quiet"])).toEqual(["환경", "동반"]);
  });
});

describe("선택 검증", () => {
  it("구분을 하나 이상 골라야 한다", () => {
    expect(validateSelection([], [])).not.toBeNull();
    expect(validateSelection(["cat_senior"], [])).toBeNull();
  });

  it("구분 칸에는 구분 코드만, 도움 칸에는 도움 코드만", () => {
    expect(validateSelection(["mov_escort"], [])).not.toBeNull();
    expect(validateSelection(["cat_senior"], ["cat_child"])).not.toBeNull();
    expect(validateSelection(["cat_senior"], ["nope"])).not.toBeNull();
    expect(validateSelection(["cat_senior", "cat_child"], ["mov_escort", "com_slow"])).toBeNull();
  });

  it("같은 코드를 두 번 보내면 거부한다", () => {
    expect(validateSelection(["cat_senior", "cat_senior"], [])).not.toBeNull();
  });
});

import { GROUP_EN, ITEM_EN, TEXT } from "@/lib/i18n";
import { GROUP_LABEL, ITEMS as ALL_ITEMS } from "@/lib/catalog";

describe("영어 문구", () => {
  it("선택 항목과 묶음마다 영어 문구가 하나씩 있다", () => {
    expect(Object.keys(ITEM_EN).sort()).toEqual(ALL_ITEMS.map((i) => i.code).sort());
    expect(Object.keys(GROUP_EN).sort()).toEqual(Object.keys(GROUP_LABEL).sort());
    for (const v of Object.values(ITEM_EN)) expect(v.trim().length).toBeGreaterThan(5);
  });

  it("화면 문구는 한국어와 영어의 항목이 같고 빈 값이 없다", () => {
    expect(Object.keys(TEXT.en).sort()).toEqual(Object.keys(TEXT.ko).sort());
    for (const [k, v] of Object.entries(TEXT.en)) {
      const text = Array.isArray(v) ? v.join("") : v;
      expect(text.trim().length, k).toBeGreaterThan(0);
    }
    expect(TEXT.en.steps).toHaveLength(TEXT.ko.steps.length);
  });
});
