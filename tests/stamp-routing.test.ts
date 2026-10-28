import { describe, expect, it } from "vitest";
import { CHECKPOINTS, GOAL } from "@/lib/stamp-book";
import {
  courseFits,
  makeCourse,
  stampEligibility,
  stampRoute,
} from "@/lib/stamp-routing";

const codes = (gate: string, from: string) =>
  stampRoute(gate, from).indices.map((i) => CHECKPOINTS[i].code);
const near = (i: number) => CHECKPOINTS[i].near;
// 시험마다 같은 코스가 나오게 하는 고정 난수
const seeded = (seed: number) => () =>
  (seed = (seed * 16807) % 2147483647) / 2147483647;

describe("airside stamp checkpoints", () => {
  it("has 20-30 airside checkpoints per terminal with unique codes", () => {
    for (const area of ["T1", "CONCOURSE", "T2"] as const) {
      const n = CHECKPOINTS.filter((c) => c.area === area).length;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(30);
    }
    expect(new Set(CHECKPOINTS.map((c) => c.code)).size).toBe(
      CHECKPOINTS.length,
    );
  });
});

describe("route mode: current location to the gate", () => {
  it("visits 5-6 checkpoints in walking order and ends next to the gate", () => {
    const r = stampRoute("46", "t1-east");
    expect(r.indices.length).toBeGreaterThanOrEqual(5);
    expect(r.indices.length).toBeLessThanOrEqual(GOAL);
    const gates = r.indices.map(near);
    expect([...gates].sort((a, b) => a - b)).toEqual(gates);
    expect(Math.abs(gates[gates.length - 1] - 46)).toBeLessThanOrEqual(2);
  });
  it("goes through both shuttle train escalators for a concourse gate", () => {
    const route = codes("125", "t1-east");
    const t1Train = route.indexOf("A12");
    const ccTrain = route.indexOf("B10");
    expect(t1Train).toBeGreaterThanOrEqual(0);
    expect(ccTrain).toBe(t1Train + 1);
    expect(route.slice(ccTrain).every((c) => c.startsWith("B"))).toBe(true);
  });
  it("never doubles back behind the concourse arrival escalator", () => {
    const route = codes("103", "t1-west");
    const afterTrain = route
      .slice(route.indexOf("B10"))
      .map((c) => CHECKPOINTS.find((p) => p.code === c)!.near);
    expect([...afterTrain].sort((a, b) => b - a)).toEqual(afterTrain);
  });
  it("starts from a chosen checkpoint", () => {
    expect(codes("25", "A20")[0]).toBe("A20");
  });
  it("keeps T2 in T2 and never returns from the concourse", () => {
    expect(codes("285", "t2-east").every((c) => c.startsWith("C"))).toBe(true);
    expect(stampRoute("25", "t2-east").reason).toBeTruthy();
    expect(stampRoute("250", "t1-east").reason).toBeTruthy();
    expect(stampRoute("20", "cc-train").reason).toBeTruthy();
  });
  it("does not create an empty itinerary", () => {
    expect(stampRoute("", "t1-east").indices).toHaveLength(0);
    expect(stampRoute("999", "t1-east").reason).toBeTruthy();
    expect(stampRoute("25", "nowhere").reason).toBeTruthy();
  });
  it("prioritizes boarding over collecting stamps", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    expect(
      stampRoute("116", "t1-east", "2026-10-28T01:10:00Z", now).reason,
    ).toBeTruthy();
    expect(
      stampRoute("116", "t1-east", "2026-10-28T05:00:00Z", now).reason,
    ).toBe("");
  });
});

describe("play mode: a compact random course near the traveller", () => {
  it("picks six nearby checkpoints in the same area, ordered in one direction", () => {
    for (const from of [
      "t1-east",
      "t1-west",
      "cc-train",
      "t2-east",
      "t2-west",
      "A12",
    ]) {
      for (let k = 1; k <= 5; k++) {
        const course = makeCourse(from, seeded(k * 97 + from.length));
        expect(courseFits(course, from)).toBe(true);
        const gates = course.map(near);
        const asc = [...gates].sort((a, b) => a - b);
        expect(
          gates.join() === asc.join() ||
            gates.join() === [...asc].reverse().join(),
        ).toBe(true);
        // 한 코스가 탑승구 30개 넘게 퍼지지 않는다(제2여객터미널은 탑승구 간격이 좁아 번호 차이가 크다)
        expect(asc[asc.length - 1] - asc[0]).toBeLessThanOrEqual(30);
      }
    }
  });
  it("varies between courses", () => {
    const seen = new Set(
      Array.from({ length: 10 }, (_, k) =>
        makeCourse("t1-east", seeded(k + 1)).join(),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
  it("uses the stored course and requires a location", () => {
    const course = makeCourse("t2-west", seeded(3));
    expect(
      stampEligibility({ mode: "play", gate: "", startHub: "t2-west", course })
        .indices,
    ).toEqual(course);
    expect(stampEligibility({ mode: "play", gate: "" }).indices).toEqual([]);
    // 다른 구역으로 옮기면 예전 코스는 쓰지 않는다
    expect(
      stampEligibility({ mode: "play", gate: "", startHub: "t1-east", course })
        .indices,
    ).toEqual([]);
  });
  it("blocks near boarding", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    const course = makeCourse("t2-west", seeded(3));
    expect(
      stampEligibility(
        {
          mode: "play",
          gate: "",
          startHub: "t2-west",
          course,
          boardingAt: "2026-10-28T10:05",
        },
        now,
      ).indices,
    ).toEqual([]);
  });
});

it("rejects duplicate or corrupt saved course indices", () => {
  const course = makeCourse("t2-east", () => 0.5);
  expect(courseFits(Array(GOAL).fill(course[0]), "t2-east")).toBe(false);
  expect(courseFits(course.map(String) as unknown as number[], "t2-east")).toBe(
    false,
  );
});
