// 공항 외부(랜드사이드) 위치: 1층 출입구, 택시·버스 승차장, 셔틀버스 승차장, 주차장 구역.
// 교통·주차 지원(택시 승차, 주차장 현장 지원)을 청하는 여객은 게이트 번호를 볼 수 없다. 그 자리에서 보이는 표지로 위치를 고르게 한다.
//
// 이름과 번호는 인천국제공항 공식 안내(2026-10-27 확인)를 그대로 따른다. 지어낸 번호는 넣지 않는다.
//   택시 승차장        https://www.airport.kr/ap_ko/987/subview.do
//   제1여객터미널 층별  https://www.airport.kr/ap_ko/974/subview.do
//   제2여객터미널 층별  https://www.airport.kr/ap_ko/975/subview.do
//   터미널 간 셔틀버스  https://www.airport.kr/ap_ko/997/subview.do
//   제1여객터미널 주차  https://www.airport.kr/ap_ko/957/subview.do
//   제2여객터미널 주차  https://www.airport.kr/ap_ko/958/subview.do
// 공식 안내에서 확인하지 못한 것(3층 출발층 출입구 번호, 제2여객터미널 장기주차장 셔틀 승차 출입구)은 넣지 않았다.
//
// !! 위치 좌표(x)는 아직 없다 !! 팀이 만드는 인천공항 지도를 붙일 때 이 파일의 x 를 채운다.
// 지금은 모두 0 이고, 공항 외부 위치에서는 길 안내를 계산하지 않는다(landside).
//
// 이 파일은 브라우저에서도 읽는다. 서버 전용 코드를 가져오지 말 것.
import type { Area, Place } from "./airport";

export type LandsideKind = "door" | "taxi" | "bus" | "shuttle" | "parking";

export interface LandsideSpot {
  place: Place;
  kind: LandsideKind;
  /** 검색에 쓰는 표지 값. 출입구는 번호(5), 택시는 승차장 표기(5C), 주차장은 구역(A, P1, 250 등). */
  codes: string[];
  /** 검색에서 이 이름으로도 찾는다. */
  aliases: string[];
}

// 공항 외부 위치의 호출을 받는 자리. 기존 1층 도착장 만남 지점과 같다.
const ZONE = "desk-t1";

const NAME: Record<"T1" | "T2", { ko: string; en: string }> = {
  T1: { ko: "제1여객터미널", en: "Terminal 1" },
  T2: { ko: "제2여객터미널", en: "Terminal 2" },
};

function spot(
  id: string,
  area: "T1" | "T2",
  level: number,
  kind: LandsideKind,
  ko: string,
  en: string,
  codes: string[],
  aliases: string[] = [],
): LandsideSpot {
  return {
    place: {
      id,
      area: area as Area,
      x: 0,
      level,
      label: `${NAME[area].ko} ${ko}`,
      labelEn: `${NAME[area].en} ${en}`,
      landside: true,
      zoneId: ZONE,
    },
    kind,
    codes,
    aliases,
  };
}

// 1층 도착층 출입구. 제1여객터미널 1~14번, 제2여객터미널 1~10번.
const doors = (area: "T1" | "T2", last: number) =>
  Array.from({ length: last }, (_, i) =>
    spot(`${area.toLowerCase()}-door-${i + 1}`, area, 1, "door", `1층 ${i + 1}번 출입구`, `1F, Door ${i + 1}`, [String(i + 1)]),
  );

const taxi = (area: "T1" | "T2", codes: string[], ko: string, en: string) =>
  spot(
    `${area.toLowerCase()}-taxi-${codes.join("-").toLowerCase()}`,
    area,
    1,
    "taxi",
    `1층 ${codes.join("·")} 택시 승차장 (${ko})`,
    `1F, Taxi stand ${codes.join("/")} (${en})`,
    codes,
    ["택시", "taxi", "택시 승차장"],
  );

export const LANDSIDE: LandsideSpot[] = [
  ...doors("T1", 14),
  ...doors("T2", 10),

  // 택시 승차장. 승차장 표기는 공식 택시 안내 그대로다.
  taxi("T1", ["1C", "14C"], "예약택시", "reserved taxi"),
  taxi("T1", ["4C"], "인터내셔널택시", "international taxi"),
  taxi("T1", ["5C"], "일반택시 · 영종", "regular taxi · Yeongjong"),
  taxi("T1", ["6C", "6D"], "일반택시 · 서울", "regular taxi · Seoul"),
  taxi("T1", ["7C"], "모범택시", "deluxe taxi"),
  taxi("T1", ["8C"], "대형택시", "large taxi"),
  taxi("T2", ["1C", "10C"], "예약택시", "reserved taxi"),
  taxi("T2", ["3C"], "인터내셔널·스마트택시", "international and smart taxi"),
  taxi("T2", ["4D"], "일반택시 · 영종도", "regular taxi · Yeongjongdo"),
  taxi("T2", ["5C"], "일반택시 · 시계외", "regular taxi · outside Incheon"),
  taxi("T2", ["5D"], "일반택시 · 인천", "regular taxi · Incheon"),
  taxi("T2", ["6D"], "일반택시 · 경기(부천·광명·김포·고양)", "regular taxi · Gyeonggi"),
  taxi("T2", ["7C"], "일반택시 · 서울", "regular taxi · Seoul"),
  taxi("T2", ["7D"], "모범·대형택시", "deluxe and large taxi"),

  // 버스 승차장. 제1여객터미널은 1층 출입구 바깥, 제2여객터미널 공항버스는 지하 1층 교통센터 버스터미널이다.
  spot("t1-bus-seoul", "T1", 1, "bus", "1층 서울버스 승차장 (3~7번 출구 외부)", "1F, Seoul bus stops (outside Exits 3–7)", [], ["버스", "bus", "서울버스", "공항버스"]),
  spot("t1-bus-gyeonggi", "T1", 1, "bus", "1층 경기버스 승차장 (7~10번 출구 외부)", "1F, Gyeonggi bus stops (outside Exits 7–10)", [], ["버스", "bus", "경기버스", "공항버스"]),
  spot("t1-bus-regional", "T1", 1, "bus", "1층 지방버스 승차장 (11~13번 출구 외부)", "1F, Regional bus stops (outside Exits 11–13)", [], ["버스", "bus", "지방버스", "공항버스"]),
  spot("t1-bus-incheon", "T1", 1, "bus", "1층 인천버스 승차장 (2~3번, 13~14번 출구 외부)", "1F, Incheon bus stops (outside Exits 2–3, 13–14)", [], ["버스", "bus", "인천버스", "시내버스"]),
  spot("t2-bus-seoul", "T2", -1, "bus", "교통센터 지하1층 버스터미널 서울버스 (중앙 11~35번)", "Transportation Center B1, Seoul buses (centre 11–35)", [], ["버스", "bus", "서울버스", "공항버스", "교통센터"]),
  spot("t2-bus-gyeonggi", "T2", -1, "bus", "교통센터 지하1층 버스터미널 경기버스 (동편 36~45번)", "Transportation Center B1, Gyeonggi buses (east 36–45)", [], ["버스", "bus", "경기버스", "공항버스", "교통센터"]),
  spot("t2-bus-regional", "T2", -1, "bus", "교통센터 지하1층 버스터미널 지방버스 (서편 1~10번)", "Transportation Center B1, Regional buses (west 1–10)", [], ["버스", "bus", "지방버스", "공항버스", "교통센터"]),
  spot("t2-bus-city", "T2", 1, "bus", "1층 인천시내버스·단체·호텔버스 승차장", "1F, Incheon city, group and hotel buses", [], ["버스", "bus", "인천버스", "시내버스", "호텔버스"]),

  // 셔틀버스.
  spot("t1-shuttle-terminal", "T1", 3, "shuttle", "3층 중앙 8번 출구 터미널 간 셔틀버스 승차장", "3F, Exit 8, inter-terminal shuttle bus", [], ["셔틀", "shuttle", "순환버스", "터미널 간"]),
  spot("t2-shuttle-terminal", "T2", 3, "shuttle", "3층 중앙 4·5번 출구 사이 터미널 간 셔틀버스 승차장", "3F, between Exits 4 and 5, inter-terminal shuttle bus", [], ["셔틀", "shuttle", "순환버스", "터미널 간"]),
  spot("t1-shuttle-longterm", "T1", 1, "shuttle", "1층 장기주차장행 셔틀버스 승차장 (3·13번 출구 외부)", "1F, long-term car park shuttle (outside Exits 3 and 13)", [], ["셔틀", "shuttle", "순환버스", "장기주차장"]),

  // 제1여객터미널 단기주차장(층별 구역)과 장기주차장. P4 는 상주직원 전용이라 넣지 않는다.
  ...(
    [
      [1, "지상1층", "1F", "A"],
      [1, "지상1층", "1F", "H"],
      [-1, "지하1층", "B1", "A"],
      [-1, "지하1층", "B1", "D"],
      [-1, "지하1층", "B1", "C"],
      [-1, "지하1층", "B1", "H"],
      [-2, "지하2층", "B2", "A"],
      [-2, "지하2층", "B2", "H"],
      [-3, "지하3층", "B3", "A"],
      [-3, "지하3층", "B3", "H"],
    ] as const
  ).map(([level, ko, en, zone]) =>
    spot(
      `t1-park-short-${en.toLowerCase()}-${zone.toLowerCase()}`,
      "T1",
      level,
      "parking",
      `단기주차장 ${ko} ${zone}구역${level === -3 && zone === "A" ? " (주차대행 인도장)" : ""}`,
      `short-term car park ${en} Zone ${zone}${level === -3 && zone === "A" ? " (valet return)" : ""}`,
      [zone],
      ["주차장", "단기주차장", "parking", "car park"],
    ),
  ),
  spot("t1-park-long-p1", "T1", 1, "parking", "장기주차장 P1", "long-term car park P1", ["P1"], ["주차장", "장기주차장", "parking"]),
  spot("t1-park-long-p2", "T1", 1, "parking", "장기주차장 P2", "long-term car park P2", ["P2"], ["주차장", "장기주차장", "parking"]),
  spot("t1-park-long-p3", "T1", 1, "parking", "장기주차장 P3 (카드 전용)", "long-term car park P3 (card only)", ["P3"], ["주차장", "장기주차장", "parking"]),
  spot("t1-park-long-p5", "T1", 1, "parking", "장기주차장 P5 (예약주차장)", "long-term car park P5 (reserved)", ["P5"], ["주차장", "장기주차장", "예약주차장", "parking"]),

  // 제2여객터미널 단기주차장. 층과 동편·서편마다 구역 번호의 범위가 정해져 있다. 지하M층은 층 번호 0 으로 둔다.
  ...(
    [
      [4, "4층", "4F", 260, 160],
      [3, "3층", "3F", 250, 150],
      [2, "2층", "2F", 240, 140],
      [1, "1층", "1F", 230, 130],
      [0, "지하M층", "BM", 220, 120],
      [-1, "지하1층", "B1", 210, 110],
    ] as const
  ).flatMap(([level, ko, en, east, west]) =>
    (
      [
        ["east", "동편", "east", east],
        ["west", "서편", "west", west],
      ] as const
    ).map(([side, sideKo, sideEn, from]) =>
      spot(
        `t2-park-short-${en.toLowerCase()}-${side}`,
        "T2",
        level,
        "parking",
        `단기주차장 ${ko} ${sideKo} (${from}~${from + 9}구역)${level === -1 ? ` · 주차대행 ${side === "west" ? "접수장" : "인도장"}` : ""}`,
        `short-term car park ${en} ${sideEn} (Zones ${from}–${from + 9})`,
        Array.from({ length: 10 }, (_, i) => String(from + i)),
        ["주차장", "단기주차장", "parking", "car park"],
      ),
    ),
  ),
];

export const LANDSIDE_PLACES: Place[] = LANDSIDE.map((s) => s.place);

export function landsideOf(id: string): LandsideSpot | null {
  return LANDSIDE.find((s) => s.place.id === id) ?? null;
}
