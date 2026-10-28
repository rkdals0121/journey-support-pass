import { describe, expect, it } from "vitest";
import { GATE_XY, gateArea, isGate, walkM } from "@/lib/gates";
import { CHECKPOINTS, GOAL } from "@/lib/stamp-book";
import { EXITS, courseFits, gateProblem, makeCourse, stampEligibility, stampRoute } from "@/lib/stamp-routing";

const codes = (gate: string, from: string) => stampRoute(gate, from).indices.map((i) => CHECKPOINTS[i].code);
const near = (i: number) => CHECKPOINTS[i].near;
// 시험마다 같은 코스가 나오게 하는 고정 난수
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe("real gates and walking distance", () => {
  it("knows which gates exist", () => {
    for (const g of [1, 50, 101, 110, 132, 208, 225, 291]) expect(isGate(g), String(g)).toBe(true);
    for (const g of [0, 4, 5, 13, 29, 44, 116, 120, 244, 271, 999]) expect(isGate(g), String(g)).toBe(false);
  });
  it("walks along the building instead of across the apron", () => {
    const [a, b] = [GATE_XY[247], GATE_XY[285]];
    expect(walkM(247, 285)).toBeGreaterThan(Math.hypot(a[0] - b[0], a[1] - b[1]) * 1.2);
    expect(walkM(247, 285)).toBe(walkM(285, 247));
    expect(walkM(10, 121)).toBe(Infinity);
  });
});

describe("airside stamp checkpoints", () => {
  it("has 20-30 checkpoints per terminal at real gates, with unique codes", () => {
    for (const area of ["T1", "CONCOURSE", "T2"] as const) {
      const n = CHECKPOINTS.filter((c) => c.area === area).length;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(30);
    }
    for (const c of [...CHECKPOINTS, ...EXITS]) {
      expect(isGate(c.near), `${"code" in c ? c.code : c.id} ${c.near}`).toBe(true);
      expect(gateArea(c.near)).toBe(c.area);
    }
    expect(new Set(CHECKPOINTS.map((c) => c.code)).size).toBe(CHECKPOINTS.length);
  });
});

describe("departure exits and gate input", () => {
  it("lists every immigration exit (T1 1-6, T2 1-2) and none in the concourse", () => {
    expect(EXITS.map((e) => e.id)).toEqual(["t1-1", "t1-2", "t1-3", "t1-4", "t1-5", "t1-6", "t2-1", "t2-2"]);
  });
  it("rejects empty and non-existent gates", () => {
    expect(gateProblem("")).toMatch(/입력/);
    for (const g of ["4", "13", "44", "116", "244", "271", "999"]) expect(gateProblem(g), g).toMatch(/없는 탑승구/);
    for (const g of ["1", "50", "101", "132", "208", "291"]) expect(gateProblem(g), g).toBe("");
  });
});

describe("route mode: current location to the gate", () => {
  it("visits 5-6 checkpoints and ends at the checkpoint nearest the gate", () => {
    for (const [gate, from] of [["46", "t1-1"], ["2", "t1-6"], ["285", "t2-1"], ["210", "t2-2"]]) {
      const r = stampRoute(gate, from);
      expect(r.indices.length).toBeGreaterThanOrEqual(5);
      expect(r.indices.length).toBeLessThanOrEqual(GOAL);
      const last = near(r.indices.at(-1)!);
      for (const c of CHECKPOINTS.filter((c) => c.area === gateArea(Number(gate))))
        expect(walkM(last, Number(gate))).toBeLessThanOrEqual(walkM(c.near, Number(gate)));
    }
  });
  it("heads toward the gate without wandering back", () => {
    for (const [gate, from] of [["46", "t1-1"], ["285", "t2-1"], ["210", "t2-2"]]) {
      const left = stampRoute(gate, from).indices.map((i) => walkM(near(i), Number(gate)));
      expect([...left].sort((a, b) => b - a)).toEqual(left);
    }
  });
  it("goes through both shuttle train escalators for a concourse gate", () => {
    for (const [gate, from] of [["125", "t1-1"], ["103", "t1-6"]]) {
      const route = codes(gate, from);
      const t1Train = route.indexOf("A12");
      expect(t1Train).toBeGreaterThanOrEqual(0);
      expect(route[t1Train + 1]).toBe("B10");
      expect(route.slice(t1Train + 1).every((c) => c.startsWith("B"))).toBe(true);
    }
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
    expect(stampRoute("44", "t1-1").reason).toMatch(/없는 탑승구/);
    expect(stampRoute("25", "nowhere").reason).toBeTruthy();
  });
  it("prioritizes boarding over collecting stamps", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    expect(stampRoute("117", "t1-1", "2026-10-28T01:10:00Z", now).reason).toBeTruthy();
    expect(stampRoute("117", "t1-1", "2026-10-28T05:00:00Z", now).reason).toBe("");
  });
});

describe("play mode: wander around the airport, finish near the gate", () => {
  const gates = ["2", "25", "47", "101", "125", "132", "208", "250", "291"];
  it("spreads six checkpoints over the gate's area and ends next to the gate", () => {
    for (const gate of gates)
      for (let k = 1; k <= 4; k++) {
        const course = makeCourse(gate, seeded(k * 97 + Number(gate)));
        expect(courseFits(course, gate)).toBe(true);
        for (const i of course) for (const j of course) if (i !== j) expect(walkM(near(i), near(j))).toBeGreaterThanOrEqual(150);
        expect(stampEligibility({ mode: "play", gate, course }).minutes).toBeGreaterThan(0);
      }
  });
  it("does not just sweep in one direction", () => {
    const oneWay = (c: number[]) => {
      const g = c.map(near);
      const asc = [...g].sort((a, b) => a - b).join();
      return g.join() === asc || [...g].reverse().join() === asc;
    };
    const courses = Array.from({ length: 20 }, (_, k) => makeCourse("250", seeded(k + 1)));
    expect(courses.filter((c) => !oneWay(c)).length).toBeGreaterThan(5);
    expect(new Set(courses.map((c) => c.join())).size).toBeGreaterThan(10);
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
