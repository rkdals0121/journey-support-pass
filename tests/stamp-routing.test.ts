import { describe, expect, it } from "vitest";
import { CHECKPOINTS, GOAL } from "@/lib/stamp-book";
import { EXITS, courseFits, gateProblem, makeCourse, stampEligibility, stampRoute } from "@/lib/stamp-routing";

const codes = (gate: string, from: string) => stampRoute(gate, from).indices.map((i) => CHECKPOINTS[i].code);
const near = (i: number) => CHECKPOINTS[i].near;
// 시험마다 같은 코스가 나오게 하는 고정 난수
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe("airside stamp checkpoints", () => {
  it("has 20-30 airside checkpoints per terminal with unique codes", () => {
    for (const area of ["T1", "CONCOURSE", "T2"] as const) {
      const n = CHECKPOINTS.filter((c) => c.area === area).length;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(30);
    }
    expect(new Set(CHECKPOINTS.map((c) => c.code)).size).toBe(CHECKPOINTS.length);
  });
});

describe("route mode: current location to the gate", () => {
  it("visits 5-6 checkpoints in walking order and ends next to the gate", () => {
    const r = stampRoute("46", "t1-1");
    expect(r.indices.length).toBeGreaterThanOrEqual(5);
    expect(r.indices.length).toBeLessThanOrEqual(GOAL);
    const gates = r.indices.map(near);
    expect([...gates].sort((a, b) => a - b)).toEqual(gates);
    expect(Math.abs(gates[gates.length - 1] - 46)).toBeLessThanOrEqual(2);
  });
  it("goes through both shuttle train escalators for a concourse gate", () => {
    const route = codes("125", "t1-1");
    const t1Train = route.indexOf("A12");
    const ccTrain = route.indexOf("B10");
    expect(t1Train).toBeGreaterThanOrEqual(0);
    expect(ccTrain).toBe(t1Train + 1);
    expect(route.slice(ccTrain).every((c) => c.startsWith("B"))).toBe(true);
  });
  it("never doubles back behind the concourse arrival escalator", () => {
    const route = codes("103", "t1-6");
    const afterTrain = route.slice(route.indexOf("B10")).map((c) => CHECKPOINTS.find((p) => p.code === c)!.near);
    expect([...afterTrain].sort((a, b) => b - a)).toEqual(afterTrain);
  });
  it("starts from a chosen checkpoint", () => {
    expect(codes("25", "A20")[0]).toBe("A20");
  });
  it("keeps T2 in T2 and never returns from the concourse", () => {
    expect(codes("285", "t2-1").every((c) => c.startsWith("C"))).toBe(true);
    expect(stampRoute("25", "t2-1").reason).toBeTruthy();
    expect(stampRoute("250", "t1-1").reason).toBeTruthy();
    expect(stampRoute("20", "B10").reason).toBeTruthy();
  });
  it("does not create an empty itinerary", () => {
    expect(stampRoute("", "t1-1").indices).toHaveLength(0);
    expect(stampRoute("999", "t1-1").reason).toBeTruthy();
    expect(stampRoute("44", "t1-1").reason).toMatch(/없는 탑승구/);
    expect(stampRoute("25", "nowhere").reason).toBeTruthy();
  });
  it("prioritizes boarding over collecting stamps", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    expect(stampRoute("116", "t1-1", "2026-10-28T01:10:00Z", now).reason).toBeTruthy();
    expect(stampRoute("116", "t1-1", "2026-10-28T05:00:00Z", now).reason).toBe("");
  });
});

describe("departure exits and gates", () => {
  it("lists every immigration exit (T1 1-6, T2 1-2) and none in the concourse", () => {
    expect(EXITS.map((e) => e.id)).toEqual(["t1-1", "t1-2", "t1-3", "t1-4", "t1-5", "t1-6", "t2-1", "t2-2"]);
  });
  it("rejects empty and non-existent gates", () => {
    expect(gateProblem("")).toMatch(/입력/);
    for (const g of ["0", "4", "13", "44", "51", "100", "133", "244", "999"]) expect(gateProblem(g), g).toMatch(/없는 탑승구/);
    for (const g of ["1", "50", "101", "132", "208", "291"]) expect(gateProblem(g), g).toBe("");
  });
});

describe("play mode: a random course across the airport that ends near the gate", () => {
  it("picks six checkpoints in the gate's area, one direction, last one next to the gate", () => {
    for (const gate of ["1", "25", "50", "101", "116", "132", "208", "250", "291"]) {
      for (let k = 1; k <= 5; k++) {
        const course = makeCourse(gate, seeded(k * 97 + Number(gate)));
        expect(courseFits(course, gate)).toBe(true);
        const gates = course.map(near);
        const asc = [...gates].sort((a, b) => a - b);
        expect(gates.join() === asc.join() || gates.join() === [...asc].reverse().join()).toBe(true);
      }
    }
  });
  it("varies between courses", () => {
    const seen = new Set(Array.from({ length: 10 }, (_, k) => makeCourse("30", seeded(k + 1)).join()));
    expect(seen.size).toBeGreaterThan(3);
  });
  it("needs a real gate and uses the stored course", () => {
    const course = makeCourse("250", seeded(3));
    expect(stampEligibility({ mode: "play", gate: "250", course }).indices).toEqual(course);
    expect(stampEligibility({ mode: "play", gate: "" }).indices).toEqual([]);
    expect(stampEligibility({ mode: "play", gate: "244", course }).reason).toMatch(/없는 탑승구/);
    // 탑승구를 바꾸면 예전 코스는 쓰지 않는다
    expect(stampEligibility({ mode: "play", gate: "20", course }).indices).toEqual([]);
  });
  it("blocks near boarding", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    const course = makeCourse("250", seeded(3));
    expect(stampEligibility({ mode: "play", gate: "250", course, boardingAt: "2026-10-28T10:05" }, now).indices).toEqual([]);
  });
});
