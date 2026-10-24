import { describe, expect, it } from "vitest";
import { ageOn, checkDigit, classify, judge, parseMrz } from "@/lib/docscan";

const today = new Date(2026, 9, 24); // 2026-10-24

// ICAO 9303 문서의 공개 견본(가상의 나라 UTO). 실제 사람의 여권이 아니다.
const SPECIMEN = ["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10"].join("\n");

/** 생년월일만 바꾼 견본 두 번째 줄. 검증숫자를 새로 계산한다. */
function line2(birth: string): string {
  const no = "L898902C3";
  const exp = "301231";
  return `${no}${checkDigit(no)}UTO${birth}${checkDigit(birth)}F${exp}${checkDigit(exp)}<<<<<<<<<<<<<<00`;
}

describe("여권 기계판독줄", () => {
  it("견본 여권의 검증숫자가 맞고 생년월일을 읽는다", () => {
    expect(checkDigit("740812")).toBe(2);
    expect(checkDigit("120415")).toBe(9);
    expect(checkDigit("L898902C3")).toBe(6);
    expect(parseMrz(SPECIMEN, today)).toEqual({ y: 1974, m: 8, d: 12 });
  });

  it("글자 사이 빈칸, « 기호, 숫자 자리의 O·I 같은 잘못 읽은 글자를 견딘다", () => {
    const noisy = "L898902C3 6UTO74O8122F12O4159ZE184226B«««««10";
    expect(parseMrz(noisy, today)).toEqual({ y: 1974, m: 8, d: 12 });
  });

  it("검증숫자가 틀리면 받지 않는다", () => {
    expect(parseMrz("L898902C36UTO7408123F1204159ZE184226B<<<<<10", today)).toBeNull();
    expect(parseMrz("아무 글자", today)).toBeNull();
  });

  it("두 자리 해는 올해를 넘으면 1900년대로 읽는다", () => {
    expect(parseMrz(line2("200301"), today)).toEqual({ y: 2020, m: 3, d: 1 });
    expect(parseMrz(line2("500301"), today)).toEqual({ y: 1950, m: 3, d: 1 });
  });

  it("만 나이는 생일이 지났는지로 센다", () => {
    expect(ageOn({ y: 1956, m: 10, d: 24 }, today)).toBe(70);
    expect(ageOn({ y: 1956, m: 10, d: 25 }, today)).toBe(69);
  });
});

describe("서류 종류와 판정", () => {
  it("여권으로 고령자와 영유아를 나이로 판정한다", () => {
    const old = classify(line2("550101"), today);
    expect(old?.kind).toBe("passport");
    expect(judge("elderly", old, today)).toEqual({ ok: true });
    expect(judge("elderly", classify(line2("600101"), today), today)).toEqual({ ok: false, reason: "age" });
    expect(judge("infant", classify(line2("220101"), today), today)).toEqual({ ok: true });
    expect(judge("infant", classify(line2("150101"), today), today)).toEqual({ ok: false, reason: "age" });
  });

  it("복지카드와 산모수첩은 서류에 찍힌 글자로 알아본다", () => {
    expect(judge("disabled", classify("장 애 인 복지카드\n성명 홍길동", today), today)).toEqual({ ok: true });
    expect(judge("pregnant", classify("임산부 산모수첩", today), today)).toEqual({ ok: true });
    expect(judge("pregnant", classify("모자보건수첩", today), today)).toEqual({ ok: true });
  });

  it("가족관계증명서는 적힌 생년월일로 영유아·고령자를 판정한다", () => {
    const cert = "가족관계증명서\n본인 1990년 05월 01일\n자녀 2022년 3월 9일";
    expect(classify(cert, today)).toEqual({
      kind: "family",
      births: [
        { y: 1990, m: 5, d: 1 },
        { y: 2022, m: 3, d: 9 },
      ],
    });
    expect(judge("infant", classify(cert, today), today)).toEqual({ ok: true });
    expect(judge("elderly", classify(cert, today), today)).toEqual({ ok: false, reason: "age" });
  });

  it("고른 대상과 맞지 않는 서류, 알아볼 수 없는 서류는 받지 않는다", () => {
    expect(judge("disabled", classify("임산부 산모수첩", today), today)).toEqual({ ok: false, reason: "wrong_doc" });
    expect(judge("pregnant", classify(SPECIMEN, today), today)).toEqual({ ok: false, reason: "wrong_doc" });
    expect(judge("elderly", classify("영수증 합계 12,000원", today), today)).toEqual({ ok: false, reason: "unknown" });
    // "장애인"만 있고 복지카드·등록증이라는 말이 없으면 복지카드로 보지 않는다(안내문 등).
    expect(classify("장애인 화장실 안내", today)).toBeNull();
  });
});
