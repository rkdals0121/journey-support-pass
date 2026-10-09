import { describe, expect, it } from "vitest";
import {
  FACILITIES,
  FACILITY_KINDS,
  FACILITY_OF_CODE,
  GATE_LEVEL,
  PLACES,
  gateX,
  isArea,
  nearestFacilities,
  nearestGate,
  placeOf,
  routeBetween,
  routeOptionsOf,
  routeToGate,
  type Area,
  type Place,
  type RouteOptions,
  type Spot,
} from "@/lib/airport";
import { itemsOf } from "@/lib/catalog";
import { DEMO } from "@/lib/demo";
import { readSeedZones } from "@/lib/zones";

// 이 파일의 거리와 시간은 airport.ts 의 모의 자료에서 나온 값이다. 자료를 실제 것으로 바꾸면 숫자도 함께 바꾼다.
const plain: RouteOptions = { stepFree: false, slow: false, alongKinds: [] };
const stepFree: RouteOptions = { ...plain, stepFree: true };
const slow: RouteOptions = { ...plain, slow: true };

const at = (id: string): Place => {
  const p = placeOf(id);
  if (!p) throw new Error(`없는 자리: ${id}`);
  return p;
};
const gateSpot = (area: Area, gate: number): Spot => ({ area, x: gateX(area, gate), level: GATE_LEVEL });
const RANGES: Record<Area, [number, number]> = { T1: [1, 50], CONCOURSE: [101, 132], T2: [208, 291] };

describe("탑승구 위치", () => {
  it("가운데가 0 이고 번호가 커질수록 오른쪽이다", () => {
    expect(gateX("T1", 1)).toBe(-539);
    expect(gateX("T1", 25)).toBe(-11);
    expect(gateX("T1", 26)).toBe(11);
    expect(gateX("T1", 50)).toBe(539);
    expect(gateX("CONCOURSE", 101)).toBe(-465);
    expect(gateX("CONCOURSE", 116)).toBe(-15);
    expect(gateX("CONCOURSE", 127)).toBe(315);
    expect(gateX("CONCOURSE", 132)).toBe(465);
    expect(gateX("T2", 208)).toBe(-581);
    expect(gateX("T2", 250)).toBe(7);
    expect(gateX("T2", 291)).toBe(581);
  });

  it("범위를 벗어난 번호는 가장 가까운 끝으로 본다", () => {
    expect(gateX("T1", 0)).toBe(gateX("T1", 1));
    expect(gateX("T1", 118)).toBe(gateX("T1", 50));
    expect(gateX("CONCOURSE", 20)).toBe(gateX("CONCOURSE", 101));
    expect(gateX("T2", 999)).toBe(gateX("T2", 291));
  });

  it("위치에서 가장 가까운 탑승구를 찾는다. 탑승구의 위치를 넣으면 그 탑승구가 나온다", () => {
    for (const area of Object.keys(RANGES) as Area[]) {
      const [from, to] = RANGES[area];
      for (let g = from; g <= to; g++) expect(nearestGate(area, gateX(area, g)), `${area} ${g}`).toBe(g);
    }
    expect(nearestGate("CONCOURSE", 300)).toBe(127);
    expect(nearestGate("CONCOURSE", -9999)).toBe(101);
    expect(nearestGate("T2", 9999)).toBe(291);
  });

  it("구역 이름을 가려낸다", () => {
    expect(isArea("T1") && isArea("CONCOURSE") && isArea("T2")).toBe(true);
    expect(isArea("")).toBe(false);
    expect(isArea("t1")).toBe(false);
  });
});

describe("키오스크 자리", () => {
  it("id 가 겹치지 않고 id 로 찾는다", () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    expect(placeOf("cc-train")?.label).toBe("탑승동 지하 1층 셔틀트레인 도착층");
    expect(placeOf("nope")).toBeNull();
    expect(placeOf(null)).toBeNull();
    expect(placeOf(undefined)).toBeNull();
  });

  it("자리마다 호출을 받을 구역이 구역 목록에 있다. 공통 자리와 키오스크 자리는 받지 않는다", () => {
    const zones = readSeedZones();
    for (const p of PLACES) {
      const zone = zones.find((z) => z.id === p.zoneId);
      expect(zone, p.id).toBeDefined();
      expect(zone?.active, p.id).toBe(true);
      expect(zone?.isCommon === true || zone?.isKiosk === true, p.id).toBe(false);
    }
  });

  it("직원이 근무하는 구역마다 키오스크 자리가 하나는 있다. 자리가 없는 구역은 호출을 받지 못한다", () => {
    const zones = readSeedZones();
    const work = zones.filter((z) => !z.isDesk && !z.isCommon && !z.isKiosk);
    expect(work.length).toBeGreaterThan(0);
    for (const z of work) {
      expect(PLACES.some((p) => p.zoneId === z.id), z.id).toBe(true);
    }
    // 자리가 가리키는 구역은 모두 구역 목록에 있다.
    const ids = new Set(zones.map((z) => z.id));
    for (const p of PLACES) expect(ids.has(p.zoneId), p.id).toBe(true);
  });

  it("끝단 구역에 놓은 자리", () => {
    expect(at("cc-103")).toMatchObject({ area: "CONCOURSE", zoneId: "cc-end", landside: false });
    expect(at("cc-130")).toMatchObject({ area: "CONCOURSE", zoneId: "cc-end", landside: false });
    expect(at("t2-212")).toMatchObject({ area: "T2", zoneId: "t2-wend", landside: false });
    expect(at("t2-286")).toMatchObject({ area: "T2", zoneId: "t2-eend", landside: false });
  });

  it("보안검색 전 자리는 안내데스크가 받고, 면세구역 자리는 그 탑승구의 구역이 받는다", () => {
    const zones = readSeedZones();
    for (const p of PLACES) {
      const zone = zones.find((z) => z.id === p.zoneId);
      if (p.landside) expect(zone?.isDesk, p.id).toBe(true);
      else expect(zone?.terminal, p.id).toBe(p.area);
    }
  });

  it("셔틀트레인 도착층만 지하 1층이고 나머지는 탑승구 층이다", () => {
    expect(at("cc-train")).toMatchObject({ area: "CONCOURSE", x: 0, level: -1, landside: false, zoneId: "cc-center" });
    for (const p of PLACES.filter((p) => p.id !== "cc-train")) expect(p.level, p.id).toBe(GATE_LEVEL);
  });

  it("자리마다 영어 이름이 있다", () => {
    for (const p of PLACES) {
      expect(p.labelEn.trim().length, p.id).toBeGreaterThan(5);
      expect(p.labelEn, p.id).not.toMatch(/[가-힣]/);
    }
  });
});

describe("시설", () => {
  it("구역마다 여섯 종류가 모두 있고, 탑승구 번호는 그 구역의 것이다", () => {
    for (const area of Object.keys(RANGES) as Area[]) {
      const here = FACILITIES.filter((f) => f.area === area);
      expect(new Set(here.map((f) => f.kind)), area).toEqual(new Set(FACILITY_KINDS));
      for (const f of here) {
        expect(f.nearGate).toBeGreaterThanOrEqual(RANGES[area][0]);
        expect(f.nearGate).toBeLessThanOrEqual(RANGES[area][1]);
        expect(f.x).toBe(gateX(area, f.nearGate));
      }
    }
  });

  it("라운지만 4층이다", () => {
    for (const f of FACILITIES) expect(f.level, `${f.kind} ${f.nearGate}`).toBe(f.kind === "lounge" ? 4 : GATE_LEVEL);
  });

  it("등록에서 고르는 찾는 시설 항목마다 시설 종류가 하나씩 있다", () => {
    expect(Object.keys(FACILITY_OF_CODE).sort()).toEqual(itemsOf("facility").map((i) => i.code).sort());
    for (const kind of Object.values(FACILITY_OF_CODE)) expect(FACILITY_KINDS).toContain(kind);
  });
});

describe("같은 층의 길", () => {
  it("걷는 구간 하나로 끝난다. 층을 옮기지 않으니 계단 없는 길이다", () => {
    const r = routeToGate(at("cc-center"), "CONCOURSE", 127, plain);
    expect(r).toEqual({
      steps: [
        {
          kind: "walk",
          meters: 315,
          minutes: 5,
          towardGate: 127,
          dir: 1,
          walkTo: "gate",
          fromLevel: 3,
          toLevel: 3,
          along: [],
        },
      ],
      meters: 315,
      minutes: 5,
      levelChanges: 0,
      stepFree: true,
    });
  });

  it("번호가 작아지는 쪽으로 가면 방향이 -1 이다", () => {
    const r = routeToGate(at("cc-125"), "CONCOURSE", 108, plain);
    expect(r?.steps).toHaveLength(1);
    expect(r?.steps[0]).toMatchObject({ kind: "walk", meters: 510, minutes: 8, dir: -1, towardGate: 108 });
  });

  it("천천히 걷는 여객은 같은 길이 더 오래 걸린다", () => {
    const fast = routeToGate(at("cc-125"), "CONCOURSE", 108, plain);
    const slower = routeToGate(at("cc-125"), "CONCOURSE", 108, slow);
    expect(slower?.meters).toBe(fast?.meters);
    expect(slower?.minutes).toBe(12);
    expect(slower!.minutes).toBeGreaterThan(fast!.minutes);
  });

  it("바로 앞이면 걷는 구간을 적지 않는다", () => {
    const r = routeToGate(at("cc-108"), "CONCOURSE", 108, plain);
    expect(r).toEqual({ steps: [], meters: 0, minutes: 0, levelChanges: 0, stepFree: true });
  });

  it("짧은 걸음도 1분으로 센다", () => {
    const r = routeToGate(at("cc-108"), "CONCOURSE", 109, plain);
    expect(r?.steps[0]).toMatchObject({ meters: 30, minutes: 1 });
  });

  it("범위를 벗어난 탑승구 번호도 표지판에는 그 번호로 적는다", () => {
    const r = routeToGate(at("t1-center"), "T1", 118, plain);
    expect(r?.steps[0]).toMatchObject({ kind: "walk", towardGate: 118, meters: 550 });
  });
});

describe("층을 옮기는 길", () => {
  const train = () => at("cc-train");

  it("계단 없는 길을 고르면 엘리베이터를 탄다", () => {
    const r = routeToGate(train(), "CONCOURSE", 127, stepFree);
    expect(r?.steps.map((s) => s.kind)).toEqual(["elevator", "walk"]);
    expect(r?.steps[0]).toMatchObject({ kind: "elevator", fromLevel: -1, toLevel: 3, minutes: 3, meters: 0, walkTo: null });
    expect(r).toMatchObject({ levelChanges: 1, stepFree: true, meters: 315, minutes: 8 });
  });

  it("고르지 않으면 에스컬레이터를 타고, 계단 없는 길이 아니다", () => {
    const r = routeToGate(train(), "CONCOURSE", 127, plain);
    expect(r?.steps.map((s) => s.kind)).toEqual(["escalator", "walk"]);
    expect(r?.steps[0]).toMatchObject({ kind: "escalator", fromLevel: -1, toLevel: 3, minutes: 1 });
    expect(r).toMatchObject({ levelChanges: 1, stepFree: false, minutes: 6 });
  });

  it("엘리베이터는 기다리는 시간만큼 더 걸린다", () => {
    const esc = routeToGate(train(), "CONCOURSE", 127, plain);
    const ele = routeToGate(train(), "CONCOURSE", 127, stepFree);
    expect(ele!.minutes - esc!.minutes).toBe(2);
  });

  it("4층 라운지로 갈 때는 걷는 거리가 가장 짧아지는 엘리베이터까지 걸은 뒤 올라간다", () => {
    const lounge = FACILITIES.find((f) => f.area === "CONCOURSE" && f.kind === "lounge")!;
    const r = routeBetween(at("cc-125"), lounge, "facility", stepFree, lounge.nearGate);
    expect(r?.steps.map((s) => [s.kind, s.walkTo, s.meters])).toEqual([
      ["walk", "lift", 15],
      ["elevator", null, 0],
      ["walk", "facility", 225],
    ]);
    expect(r?.steps[0]).toMatchObject({ fromLevel: 3, toLevel: 3 });
    expect(r?.steps[1]).toMatchObject({ fromLevel: 3, toLevel: 4 });
    expect(r?.steps[2]).toMatchObject({ fromLevel: 4, toLevel: 4, towardGate: 117, dir: -1 });
  });
});

describe("터미널 사이의 길", () => {
  it("제1여객터미널에서 탑승동으로는 셔틀트레인으로 가고, 양쪽에서 한 번씩 층을 옮긴다", () => {
    const r = routeToGate(at("t1-center"), "CONCOURSE", 127, plain);
    expect(r?.steps.map((s) => s.kind)).toEqual(["escalator", "shuttle", "escalator", "walk"]);
    expect(r?.steps[0]).toMatchObject({ fromLevel: 3, toLevel: -1 });
    expect(r?.steps[1]).toMatchObject({ kind: "shuttle", minutes: 7, meters: 0, fromLevel: -1, toLevel: -1 });
    expect(r?.steps[2]).toMatchObject({ fromLevel: -1, toLevel: 3 });
    expect(r?.steps[3]).toMatchObject({ kind: "walk", walkTo: "gate", towardGate: 127, meters: 315 });
    expect(r).toMatchObject({ levelChanges: 2, stepFree: false, minutes: 1 + 7 + 1 + 5 });
  });

  it("계단 없는 길이면 양쪽 모두 엘리베이터다", () => {
    const r = routeToGate(at("t1-center"), "CONCOURSE", 127, { ...stepFree, slow: true });
    expect(r?.steps.map((s) => s.kind)).toEqual(["elevator", "shuttle", "elevator", "walk"]);
    expect(r).toMatchObject({ levelChanges: 2, stepFree: true, minutes: 3 + 7 + 3 + 7 });
  });

  it("터미널 끝에서는 먼저 내려가는 곳까지 걷는다", () => {
    const r = routeToGate(at("t1-east"), "CONCOURSE", 110, plain);
    expect(r?.steps.map((s) => s.kind)).toEqual(["walk", "escalator", "shuttle", "escalator", "walk"]);
    expect(r?.steps[0]).toMatchObject({ walkTo: "lift", meters: 341, dir: -1, fromLevel: 3 });
    expect(r?.steps[4]).toMatchObject({ walkTo: "gate", towardGate: 110, dir: -1, meters: 195 });
    expect(r?.levelChanges).toBe(2);
  });

  it("탑승동에서 제1여객터미널로는 길이 없다", () => {
    expect(routeToGate(at("cc-center"), "T1", 20, plain)).toBeNull();
    expect(routeToGate(at("cc-train"), "T1", 20, stepFree)).toBeNull();
  });

  it("제2여객터미널은 다른 곳과 이어지지 않는다", () => {
    expect(routeToGate(at("t2-center"), "T1", 20, plain)).toBeNull();
    expect(routeToGate(at("t2-center"), "CONCOURSE", 127, plain)).toBeNull();
    expect(routeToGate(at("t1-center"), "T2", 250, plain)).toBeNull();
    expect(routeToGate(at("cc-center"), "T2", 250, plain)).toBeNull();
    // 제2여객터미널 안에서는 길이 있다.
    expect(routeToGate(at("t2-center"), "T2", 220, plain)?.steps[0]).toMatchObject({ kind: "walk", meters: 420, dir: -1 });
  });
});

describe("보안검색 전 자리", () => {
  it("탑승구까지의 길을 안내하지 않는다. 같은 터미널의 탑승구여도 같다", () => {
    for (const p of PLACES.filter((p) => p.landside)) {
      expect(routeToGate(p, p.area, RANGES[p.area][0], plain), p.id).toBeNull();
      expect(routeToGate(p, "CONCOURSE", 127, stepFree), p.id).toBeNull();
    }
  });

  it("가까운 시설도 알려 주지 않는다", () => {
    for (const p of PLACES.filter((p) => p.landside)) {
      expect(nearestFacilities(p, { ...plain, alongKinds: ["rest", "restroom"] }), p.id).toEqual([]);
    }
  });
});

describe("가는 길에 있는 시설", () => {
  const from = () => at("cc-108"); // x = -255
  const to = gateSpot("CONCOURSE", 130); // x = 405

  it("알려 달라고 한 종류만 넣는다", () => {
    expect(routeBetween(from(), to, "gate", plain, 130)?.steps[0].along).toEqual([]);
    const r = routeBetween(from(), to, "gate", { ...plain, alongKinds: ["rest"] }, 130);
    expect(r?.steps[0].along).toEqual([
      { kind: "rest", nearGate: 114, meters: 180 },
      { kind: "rest", nearGate: 119, meters: 330 },
      { kind: "rest", nearGate: 125, meters: 510 },
    ]);
  });

  it("출발하는 자리와 도착하는 자리에 있는 시설은 넣지 않는다", () => {
    const r = routeBetween(from(), to, "gate", { ...plain, alongKinds: ["rest"] }, 130);
    const gates = r?.steps[0].along.map((a) => a.nearGate);
    expect(gates).not.toContain(108);
    expect(gates).not.toContain(130);
    // 지나치지 않는 쪽(103번 옆)도 없다.
    expect(gates).not.toContain(103);
  });

  it("가까운 순으로 세 곳까지만 넣는다", () => {
    const r = routeBetween(from(), to, "gate", { ...plain, alongKinds: ["rest", "restroom"] }, 130);
    expect(r?.steps[0].along).toEqual([
      { kind: "restroom", nearGate: 110, meters: 60 },
      { kind: "rest", nearGate: 114, meters: 180 },
      { kind: "restroom", nearGate: 116, meters: 240 },
    ]);
  });

  it("반대쪽으로 걸어도 걷기 시작한 곳에서 가까운 순이다", () => {
    const r = routeToGate(at("cc-125"), "CONCOURSE", 101, { ...plain, alongKinds: ["rest"] });
    expect(r?.steps[0].along).toEqual([
      { kind: "rest", nearGate: 119, meters: 180 },
      { kind: "rest", nearGate: 114, meters: 330 },
      { kind: "rest", nearGate: 108, meters: 510 },
    ]);
  });

  it("다른 층에 있는 시설은 넣지 않는다", () => {
    const r = routeBetween(from(), to, "gate", { ...plain, alongKinds: ["lounge"] }, 130);
    expect(r?.steps[0].along).toEqual([]);
  });

  it("긴 길에서도 세 곳을 넘지 않는다", () => {
    const r = routeToGate(at("t2-west"), "T2", 291, { ...plain, alongKinds: ["rest", "restroom", "nursing"] });
    expect(r?.steps[0].along).toEqual([
      { kind: "rest", nearGate: 224, meters: 56 },
      { kind: "restroom", nearGate: 228, meters: 112 },
      { kind: "nursing", nearGate: 232, meters: 168 },
    ]);
  });
});

describe("가까운 시설", () => {
  const minutesTo = (p: Place, opts: RouteOptions, kind: string) =>
    FACILITIES.filter((f) => f.area === p.area && f.kind === kind).map(
      (f) => routeBetween(p, f, "facility", { ...opts, alongKinds: [] }, f.nearGate)!.minutes,
    );

  it("종류마다 하나씩, 정해진 순서로 돌려준다", () => {
    for (const p of PLACES.filter((p) => !p.landside)) {
      expect(nearestFacilities(p, plain).map((f) => f.kind), p.id).toEqual(FACILITY_KINDS);
    }
  });

  it("종류마다 가장 빨리 닿는 곳을 고른다", () => {
    for (const p of PLACES.filter((p) => !p.landside)) {
      for (const opts of [plain, stepFree, slow, { ...stepFree, slow: true }]) {
        for (const f of nearestFacilities(p, opts)) {
          expect(f.route.minutes, `${p.id} ${f.kind}`).toBe(Math.min(...minutesTo(p, opts, f.kind)));
        }
      }
    }
  });

  it("그 자리가 있는 구역의 시설만 고른다", () => {
    for (const p of PLACES.filter((p) => !p.landside)) {
      for (const f of nearestFacilities(p, plain)) {
        expect(f.nearGate, `${p.id} ${f.kind}`).toBeGreaterThanOrEqual(RANGES[p.area][0]);
        expect(f.nearGate, `${p.id} ${f.kind}`).toBeLessThanOrEqual(RANGES[p.area][1]);
      }
    }
  });

  it("탑승동 125번 탑승구 앞에서 가까운 곳", () => {
    const found = Object.fromEntries(nearestFacilities(at("cc-125"), plain).map((f) => [f.kind, f]));
    expect(found.restroom).toMatchObject({ nearGate: 123, level: 3 });
    expect(found.restroom.route).toMatchObject({ meters: 60, minutes: 1, levelChanges: 0 });
    expect(found.wheelchair).toMatchObject({ nearGate: 127 });
    expect(found.nursing).toMatchObject({ nearGate: 121 });
    expect(found.calm).toMatchObject({ nearGate: 115 });
    // 쉴 곳은 바로 앞에 있어 걷는 구간이 없다.
    expect(found.rest).toMatchObject({ nearGate: 125 });
    expect(found.rest.route).toMatchObject({ steps: [], minutes: 0 });
  });

  it("라운지는 4층이라 층을 한 번 옮긴다. 계단 없는 길이면 엘리베이터로 간다", () => {
    const lounge = (opts: RouteOptions) => nearestFacilities(at("cc-center"), opts).find((f) => f.kind === "lounge")!;
    expect(lounge(plain)).toMatchObject({ nearGate: 117, level: 4 });
    expect(lounge(plain).route.steps.map((s) => s.kind)).toEqual(["escalator", "walk"]);
    expect(lounge(stepFree).route.steps.map((s) => s.kind)).toEqual(["elevator", "walk"]);
    expect(lounge(stepFree).route).toMatchObject({ levelChanges: 1, stepFree: true });
  });

  it("지하 1층 자리에서는 모든 시설이 층을 옮겨야 닿는다", () => {
    for (const f of nearestFacilities(at("cc-train"), stepFree)) {
      expect(f.route.levelChanges, f.kind).toBe(1);
      expect(f.route.steps[0].kind, f.kind).toBe("elevator");
    }
  });

  it("시설로 가는 길에는 그 시설과 같은 종류를 적지 않는다", () => {
    const found = nearestFacilities(at("t2-west"), { ...plain, alongKinds: ["rest", "restroom"] });
    for (const f of found) {
      for (const s of f.route.steps) expect(s.along.map((a) => a.kind), f.kind).not.toContain(f.kind);
    }
    // 다른 종류는 적는다. 서편에서 가장 가까운 수유실(232번 옆)로 가는 길에 쉴 곳과 화장실이 있다.
    const nursing = found.find((f) => f.kind === "nursing")!;
    expect(nursing.nearGate).toBe(232);
    expect(nursing.route.steps[0].along).toEqual([
      { kind: "rest", nearGate: 224, meters: 56 },
      { kind: "restroom", nearGate: 228, meters: 112 },
    ]);
  });
});

describe("고른 항목에서 길 계산 조건 만들기", () => {
  it("아무것도 고르지 않으면 보통 걸음, 에스컬레이터, 알려 줄 시설 없음", () => {
    expect(routeOptionsOf([])).toEqual({ stepFree: false, slow: false, alongKinds: [] });
    expect(routeOptionsOf(["gd_large", "gd_voice", "stf_call", "fac_lounge", "fac_calm"])).toEqual({
      stepFree: false,
      slow: false,
      alongKinds: [],
    });
  });

  it("휠체어와 계단이 어려운 여객은 계단 없는 길로, 천천히 걷는 시간으로 잰다", () => {
    for (const c of ["mov_wheelchair_own", "mov_wheelchair_need", "mov_no_stairs"]) {
      expect(routeOptionsOf([c]), c).toMatchObject({ stepFree: true, slow: true });
    }
  });

  it("쉬어 가야 하거나 오래 서 있기 어려운 여객은 천천히 걷는 시간으로 재고 쉴 곳을 알려 준다", () => {
    for (const c of ["mov_need_rest", "mov_no_standing"]) {
      expect(routeOptionsOf([c]), c).toEqual({ stepFree: false, slow: true, alongKinds: ["rest"] });
    }
  });

  it("찾는 시설을 고르면 가는 길에 있는 그 시설을 알려 준다", () => {
    expect(routeOptionsOf(["fac_rest"]).alongKinds).toEqual(["rest"]);
    expect(routeOptionsOf(["fac_restroom"]).alongKinds).toEqual(["restroom"]);
    expect(routeOptionsOf(["fac_nursing"]).alongKinds).toEqual(["nursing"]);
    expect(routeOptionsOf(["fac_nursing", "fac_restroom", "fac_rest"]).alongKinds).toEqual(["rest", "restroom", "nursing"]);
  });

  it("휠체어를 이용하는 여객에게는 고르지 않아도 장애인 화장실을 알려 준다", () => {
    expect(routeOptionsOf(["mov_wheelchair_own"]).alongKinds).toEqual(["restroom"]);
    expect(routeOptionsOf(["mov_wheelchair_need"]).alongKinds).toEqual([]);
  });
});

describe("제안서의 예시 장면", () => {
  // 휠체어를 이용하는 여객이 탑승동 지하 1층 셔틀트레인 도착층의 키오스크에 패스를 찍는다. 탑승구는 127번이다.
  const scene = DEMO[0];

  it("시연용 첫 장면이 이 여객이다", () => {
    expect(scene.flightNo).toBe("MK127");
    expect(scene.choices).toEqual(expect.arrayContaining(["mov_wheelchair_own", "fac_restroom"]));
  });

  it("엘리베이터로 3층에 올라간 뒤 127번 탑승구 쪽으로 걷고, 가는 길의 장애인 화장실을 알려 준다", () => {
    const opts = routeOptionsOf(scene.choices);
    expect(opts).toEqual({ stepFree: true, slow: true, alongKinds: ["restroom"] });

    const r = routeToGate(at("cc-train"), "CONCOURSE", 127, opts);
    expect(r).toEqual({
      steps: [
        {
          kind: "elevator",
          meters: 0,
          minutes: 3,
          towardGate: null,
          dir: 0,
          walkTo: null,
          fromLevel: -1,
          toLevel: 3,
          along: [],
        },
        {
          kind: "walk",
          meters: 315,
          minutes: 7,
          towardGate: 127,
          dir: 1,
          walkTo: "gate",
          fromLevel: 3,
          toLevel: 3,
          along: [{ kind: "restroom", nearGate: 123, meters: 195 }],
        },
      ],
      meters: 315,
      minutes: 10,
      levelChanges: 1,
      stepFree: true,
    });
  });

  it("에스컬레이터나 셔틀트레인은 나오지 않는다", () => {
    const r = routeToGate(at("cc-train"), "CONCOURSE", 127, routeOptionsOf(scene.choices));
    expect(r?.steps.map((s) => s.kind)).not.toContain("escalator");
    expect(r?.steps.map((s) => s.kind)).not.toContain("shuttle");
  });
});
