// 교통·주차 지원의 공항 외부 위치(출입구, 택시·버스 승차장, 주차장 구역)와 그 검색.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PICKUP_PLACES, placeOf } from "@/lib/airport";
import type { Db } from "@/lib/db";
import { LANDSIDE, LANDSIDE_PLACES } from "@/lib/landside-places";
import { matchPlaces } from "@/lib/place-search";
import { createServiceRequest } from "@/lib/service-requests";
import type { ServiceRequestView } from "@/lib/service-request-model";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";

const ids = (text: string, area: Parameters<typeof matchPlaces>[1] = "all") => matchPlaces(text, area).candidates.map((c) => c.place.id);

describe("공항 외부 위치 자료", () => {
  it("id 가 겹치지 않고, 모두 보안구역 밖이며, 고를 수 있는 위치 목록에 들어 있다", () => {
    expect(new Set(LANDSIDE_PLACES.map((p) => p.id)).size).toBe(LANDSIDE_PLACES.length);
    for (const p of LANDSIDE_PLACES) {
      expect(p.landside, p.id).toBe(true);
      expect(placeOf(p.id), p.id).toEqual(p);
    }
    expect(new Set(PICKUP_PLACES.map((p) => p.id)).size).toBe(PICKUP_PLACES.length);
  });

  it("1층 출입구는 공식 안내대로 제1여객터미널 1~14번, 제2여객터미널 1~10번이다", () => {
    const doors = (area: string) => LANDSIDE.filter((s) => s.kind === "door" && s.place.area === area).map((s) => s.codes[0]);
    expect(doors("T1")).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)));
    expect(doors("T2")).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)));
  });

  it("택시 승차장 표기는 공식 택시 안내와 같다", () => {
    const codes = (area: string) => LANDSIDE.filter((s) => s.kind === "taxi" && s.place.area === area).flatMap((s) => s.codes);
    expect(codes("T1")).toEqual(["1C", "14C", "4C", "5C", "6C", "6D", "7C", "8C"]);
    expect(codes("T2")).toEqual(["1C", "10C", "3C", "4D", "5C", "5D", "6D", "7C", "7D"]);
  });

  it("상주직원 전용인 장기주차장 P4 는 넣지 않는다. 제2여객터미널 단기주차장은 110~269 구역을 빠짐없이 덮는다", () => {
    expect(LANDSIDE.some((s) => s.codes.includes("P4"))).toBe(false);
    const t2 = LANDSIDE.filter((s) => s.kind === "parking" && s.place.area === "T2").flatMap((s) => s.codes.map(Number));
    expect(t2.sort((a, b) => a - b)).toEqual(
      [...Array.from({ length: 60 }, (_, i) => 110 + i), ...Array.from({ length: 60 }, (_, i) => 210 + i)].sort((a, b) => a - b),
    );
  });
});

describe("공항 외부 위치 검색", () => {
  it("출입구 번호는 탑승구로 읽지 않는다 (예전에는 '3번 출입구'가 면세구역 3번 탑승구로 잡혔다)", () => {
    expect(ids("3번 출입구")).toEqual(["t1-door-3", "t2-door-3"]);
    expect(ids("3번 출입구", "T2")).toEqual(["t2-door-3"]);
    expect(ids("EXIT 5")).toEqual(["t1-door-5", "t2-door-5"]);
    expect(matchPlaces("3번 출입구").gates).toEqual([]);
  });

  it("택시 승차장 표기로 찾는다. 터미널마다 있는 표기만 나온다", () => {
    expect(ids("6C")).toEqual(["t1-taxi-6c-6d"]);
    expect(ids("6C 택시 승차장")).toEqual(["t1-taxi-6c-6d"]);
    expect(ids("제2터미널 7C")).toEqual(["t2-taxi-7c"]);
    expect(ids("5C")).toEqual(["t1-taxi-5c", "t2-taxi-5c"]);
  });

  it("주차장 구역으로 찾는다", () => {
    expect(ids("단기주차장 지하1층 A구역")).toEqual(["t1-park-short-b1-a"]);
    expect(ids("주차장 250구역")).toEqual(["t2-park-short-3f-east"]);
    expect(ids("P1")).toEqual(["t1-park-long-p1"]);
  });

  it("이름으로 찾을 때는 가장 잘 맞는 곳만 보인다", () => {
    expect(ids("셔틀버스")).toEqual(["t1-shuttle-terminal", "t2-shuttle-terminal", "t1-shuttle-longterm"]);
    expect(ids("교통센터")).toEqual(["t2-bus-seoul", "t2-bus-gyeonggi", "t2-bus-regional"]);
  });

  it("게이트 검색은 예전 그대로다", () => {
    expect(ids("130")).toEqual(["cc-130"]);
    expect(ids("116번 게이트")).toEqual(["cc-center"]);
    expect(ids("Gate 130")).toEqual(["cc-130"]);
  });
});

describe("공항 외부 위치로 교통·주차 지원 요청", () => {
  const now = kst("2026-10-27 14:00");
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
    await seedZones(db, () => "x:y");
  });
  beforeEach(async () => {
    await db.exec("truncate service_requests,service_request_limits restart identity cascade");
  });

  it("택시 승차장에서 청하면 그 터미널의 교통관리 담당에게 간다", async () => {
    const res = await createServiceRequest(
      db,
      null,
      {
        receipt: "a".repeat(64),
        placeId: "t2-taxi-7c",
        service: "guidance",
        topicId: "traffic",
        serviceDetails: { task: "taxi-help", fields: { destination: "서울" } },
        party: 1,
        choices: [],
        note: "",
        lang: "ko",
        consent: true,
      },
      "ip:phone",
      now,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const r = (res.body as { request: ServiceRequestView }).request;
    expect(r.businessId).toBe("traffic-t2");
  });
});
