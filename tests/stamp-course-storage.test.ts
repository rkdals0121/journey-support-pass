import { describe, expect, it } from "vitest";
import { CHECKPOINTS, GOAL } from "@/lib/stamp-book";
import { courseFits, makeCourse } from "@/lib/stamp-routing";

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe("저장된 놀이형 코스와 탑승구 변경", () => {
  it.each(["25", "125", "250"])("%s번 코스는 같은 난수에서 재현되고 저장 후에도 유효하다", (gate) => {
    const course = makeCourse(gate, seeded(71));
    expect(makeCourse(gate, seeded(71))).toEqual(course);
    expect(course).toHaveLength(GOAL);
    expect(courseFits(JSON.parse(JSON.stringify(course)), gate)).toBe(true);
  });
  it.each(["", "4", "999", "not-a-gate"])("잘못된 탑승구 %s로 코스를 만들거나 재사용하지 않는다", (gate) => {
    expect(makeCourse(gate, seeded(71))).toEqual([]);
    expect(courseFits(makeCourse("25", seeded(71)), gate)).toBe(false);
  });
  it("저장한 코스를 검사할 때 순서와 내용을 바꾸지 않는다", () => {
    const course = Object.freeze(makeCourse("250", seeded(71)));
    const before = [...course];
    expect(courseFits(course as unknown as number[], "250")).toBe(true);
    expect(course).toEqual(before);
  });
  it("길이가 다르거나 없는 저장 코스는 거부한다", () => {
    const course = makeCourse("25", seeded(71));
    for (const saved of [undefined, [], course.slice(1), [...course, course[0]]]) expect(courseFits(saved, "25")).toBe(false);
  });
  it("다른 구역·없는 인덱스·가까운 마지막 도장이 아닌 코스는 거부한다", () => {
    const course = makeCourse("25", seeded(71));
    expect(courseFits(makeCourse("250", seeded(71)), "25")).toBe(false);
    for (const bad of [-1, CHECKPOINTS.length, NaN]) expect(courseFits([bad, ...course.slice(1)], "25")).toBe(false);
    const wrongLast = [...course.slice(1), course[0]];
    expect(courseFits(wrongLast, "25")).toBe(false);
  });
});
