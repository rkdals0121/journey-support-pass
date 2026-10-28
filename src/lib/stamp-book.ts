import type { Area } from "./airport";
// 가족 여행객 전자 스탬프북(구상안 「가족 여행객 스탬프북 × 안내로봇 미팅포인트」).
// 체크포인트는 안내로봇 미팅포인트를 겸하는 오프라인 거점이다. 도장 기록은 그 휴대전화 안에만 둔다(서버에 보내지 않는다).

export type ThemeId = "flight" | "explorer" | "friend";

export interface Checkpoint {
  /** QR 과 인쇄물에 찍히는 짧은 번호. 휴대전화 카메라가 안 될 때 손으로 누른다. 터미널 글자(A·B·C) + 두 자리. */
  code: string;
  area: Area;
  /** 가장 가까운 실제 탑승구 번호. 그 탑승구 좌표(gates.ts)를 체크포인트 자리로 쓴다. */
  near: number;
  /** 거점 위치 설명 */
  place: string;
  /** 셔틀트레인 승강장 에스컬레이터. 탑승동으로 가는 경로형은 꼭 들른다. */
  train?: boolean;
}

// 체크포인트는 모두 에어사이드(출국심사를 마친 뒤 면세구역~탑승구)에만 둔다. 안내로봇 미팅포인트를 겸한다.
// 자리는 실제 탑승구 좌표를 따른다(동·서는 지리 방위 기준: 제1여객터미널·탑승동은 번호가 작은 쪽이 동편, 제2여객터미널은 서편).
// ponytail: 매장·놀이공간 이름은 시연용 모의 배치다. 실제 도입 때는 공항 실내 지도의 매장·시설 위치로 바꾼다.
const cp = (area: Area, prefix: string, rows: [number, string, boolean?][]): Checkpoint[] =>
  rows.map(([near, place, train], i) => ({ code: prefix + String(i + 1).padStart(2, "0"), area, near, place, ...(train ? { train } : {}) }));

export const CHECKPOINTS: Checkpoint[] = [
  ...cp("T1", "A", [
    [2, "2번 탑승구 앞"],
    [6, "6번 탑승구 앞 · 동편 끝 활주로 창가"],
    [9, "동편 어린이 놀이공간 앞"],
    [10, "10번 탑승구 앞"],
    [11, "동편 화장품 면세점 앞"],
    [14, "14번 탑승구 앞"],
    [16, "동편 푸드코트 입구"],
    [18, "18번 탑승구 앞"],
    [20, "전통문화 체험관 앞"],
    [22, "22번 탑승구 앞"],
    [24, "중앙 면세거리 큰 시계 앞"],
    [26, "탑승동 셔틀트레인 승강장 내려가는 에스컬레이터 앞", true],
    [27, "중앙 실내 정원 앞"],
    [28, "28번 탑승구 앞"],
    [30, "30번 탑승구 앞"],
    [32, "서편 패션 면세점 앞"],
    [33, "33번 탑승구 앞"],
    [35, "서편 항공사 라운지 입구 앞"],
    [37, "37번 탑승구 앞"],
    [40, "서편 기념품 매장 앞"],
    [42, "서편 어린이 놀이공간 앞"],
    [43, "43번 탑승구 앞"],
    [45, "서편 푸드코트 입구"],
    [46, "46번 탑승구 앞"],
    [48, "48번 탑승구 앞"],
    [50, "50번 탑승구 앞 · 서편 끝 활주로 창가"],
  ]),
  ...cp("CONCOURSE", "B", [
    [101, "101번 탑승구 앞"],
    [103, "103번 탑승구 앞"],
    [105, "105번 탑승구 앞 · 활주로 창가"],
    [107, "동편 어린이 놀이공간 앞"],
    [108, "108번 탑승구 앞"],
    [110, "110번 탑승구 앞"],
    [111, "동편 푸드코트 입구"],
    [112, "112번 탑승구 앞"],
    [114, "114번 탑승구 앞"],
    [115, "셔틀트레인 도착층에서 올라오는 에스컬레이터 앞", true],
    [117, "중앙 면세거리 앞"],
    [118, "118번 탑승구 앞"],
    [119, "119번 탑승구 앞"],
    [121, "서편 휴게 라운지 앞"],
    [122, "122번 탑승구 앞"],
    [124, "124번 탑승구 앞"],
    [125, "서편 어린이 놀이공간 앞"],
    [126, "126번 탑승구 앞"],
    [128, "128번 탑승구 앞"],
    [130, "130번 탑승구 앞"],
    [132, "132번 탑승구 앞 · 서편 끝 활주로 창가"],
  ]),
  ...cp("T2", "C", [
    [210, "210번 탑승구 앞"],
    [214, "214번 탑승구 앞"],
    [218, "서편 어린이 놀이공간 앞"],
    [221, "221번 탑승구 앞"],
    [224, "서편 푸드코트 입구"],
    [230, "230번 탑승구 앞"],
    [231, "231번 탑승구 앞"],
    [234, "서편 화장품 면세점 앞"],
    [237, "237번 탑승구 앞"],
    [240, "문화공연 무대 앞"],
    [243, "243번 탑승구 앞"],
    [246, "중앙 면세거리 앞"],
    [249, "중앙 실내 정원 앞"],
    [252, "252번 탑승구 앞"],
    [255, "동편 패션 면세점 앞"],
    [258, "258번 탑승구 앞"],
    [262, "동편 기념품 매장 앞"],
    [265, "265번 탑승구 앞"],
    [268, "동편 푸드코트 입구"],
    [270, "270번 탑승구 앞"],
    [274, "동편 어린이 놀이공간 앞"],
    [277, "277번 탑승구 앞"],
    [280, "280번 탑승구 앞"],
    [284, "284번 탑승구 앞"],
    [287, "287번 탑승구 앞"],
    [290, "290번 탑승구 앞 · 동편 끝 활주로 창가"],
  ]),
];

export const AREA_LABEL: Record<Area, string> = { T1: "제1여객터미널", CONCOURSE: "탑승동", T2: "제2여객터미널" };

/** 한 코스(놀이형)·한 경로(경로형)의 최대 도장 수 */
export const GOAL = 6;

interface Theme {
  /** 표지 위 작은 머리글 */
  kicker: string;
  title: string;
  subtitle: string;
  start: string;
  nameLabel: string;
  gateLabel: string;
  photoSlot: string;
  /** 현재 구역의 도장을 모으면 무엇이 생기는지 */
  promise: string;
  unit: string;
  /** 코스·경로에서 몇 번째 도장인지에 붙는 이름(6개) */
  stops: string[];
  scanHint: (n: number) => string;
  got: (stop: string) => string;
  gotSub: (stop: string, n: number) => string;
  remain: (left: number) => string;
  next: string;
  doneTitle: string;
  idKicker: string;
  /** 인증 ID 에 붙는 영문 머리 글자 */
  idPrefix: string;
  /** 고를 수 있는 필터. 비행수첩형만 둘(기장·승무원) */
  roles: { id: string; label: string; badge: string; filter: string }[];
  takePhoto: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  flight: {
    kicker: "FLIGHT LOG",
    title: "나의 비행 수첩",
    subtitle: "꼬마 기장 · 승무원 스탬프북",
    start: "비행 시작하기",
    nameLabel: "이름",
    gateLabel: "탑승구",
    photoSlot: "인증 사진 자리",
    promise:
      "현재 구역의 도장을 모으면\n기장·승무원 인증 ID가 이 페이지에 채워져요",
    unit: "도장",
    stops: [
      "이륙 준비",
      "활주로 진입",
      "순항 고도",
      "관제탑 교신",
      "착륙 준비",
      "최종 탑승",
    ],
    scanHint: (n) => `체크포인트 ${n}의 QR을 비춰 주세요`,
    got: () => "도장 획득!",
    gotSub: (s, n) => `${s} · ${n}번째 도장`,
    remain: (l) =>
      l
        ? `도장 ${l}개만 더 모으면 인증 필터가 열려요`
        : "인증 필터가 열렸어요!",
    next: "다음 체크포인트 보기",
    doneTitle: "비행 완료!",
    idKicker: "FLIGHT ID",
    idPrefix: "FL",
    roles: [
      { id: "captain", label: "기장", badge: "기장 인증", filter: "기장 필터" },
      {
        id: "crew",
        label: "승무원",
        badge: "승무원 인증",
        filter: "승무원 필터",
      },
    ],
    takePhoto: "사진 찍고 인증 ID 받기",
  },
  explorer: {
    kicker: "EXPLORER'S LOG",
    title: "공항 탐험 수첩",
    subtitle: "꼬마 탐험대 스탬프북",
    start: "탐험 시작하기",
    nameLabel: "탐험대원",
    gateLabel: "목적지 탑승구",
    photoSlot: "인증 사진 자리",
    promise:
      "현재 구역의 거점을 발견하면\n마스터 모험가 인증 ID가 이 페이지에 채워져요",
    unit: "발견",
    stops: [
      "출발 캠프",
      "비밀 통로",
      "반짝 광장",
      "큰 날개 구경",
      "쉼 오아시스",
      "도착 베이스",
    ],
    scanHint: (n) => `탐험지 ${n}의 QR을 비춰 주세요`,
    got: () => "새로운 곳을 발견했어요!",
    gotSub: (s, n) => `${s} · ${n}번째 발견`,
    remain: (l) =>
      l
        ? `${l}곳을 더 발견하면 모험가 인증이 열려요`
        : "모험가 인증이 열렸어요!",
    next: "다음 탐험지 보기",
    doneTitle: "탐험 완료!",
    idKicker: "EXPLORER ID",
    idPrefix: "EX",
    roles: [
      {
        id: "explorer",
        label: "모험가",
        badge: "마스터 모험가 인증",
        filter: "모험가 필터",
      },
    ],
    takePhoto: "사진 찍고 인증 ID 받기",
  },
  friend: {
    kicker: "하늘이와 함께하는",
    title: "공항 도장 놀이",
    subtitle: "하늘이랑 별 도장 모으기",
    start: "놀이 시작하기",
    nameLabel: "내 이름",
    gateLabel: "우리 탑승구",
    photoSlot: "친구 사진 자리",
    promise:
      "현재 구역의 별을 모으면\n하늘이 단짝 인증 ID가 이 페이지에 채워져요",
    unit: "별",
    stops: [
      "인사 도장",
      "구름 도장",
      "별 도장",
      "바람 도장",
      "무지개 도장",
      "도착 도장",
    ],
    scanHint: () => "반짝이는 QR을 비춰 주세요",
    got: (s) => `${s} 획득!`,
    gotSub: (_, n) => `${n}번째 도장이에요`,
    remain: (l) =>
      l
        ? `별 ${l}개를 더 모으면 친구들과 사진을 찍어요`
        : "친구들과 사진을 찍을 수 있어요!",
    next: "다음 도장 찾으러 가기",
    doneTitle: "공항 친구 완성!",
    idKicker: "FRIEND ID",
    idPrefix: "FR",
    roles: [
      {
        id: "friend",
        label: "단짝",
        badge: "하늘이 단짝 인증",
        filter: "하늘이 필터",
      },
    ],
    takePhoto: "친구들과 사진 찍기",
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/**
 * QR 에서 읽은 글자에서 체크포인트 순번을 찾는다. 없으면 -1.
 * 인쇄물 QR 은 `…/stamp/c/K7Q` 주소라 휴대전화 기본 카메라로 찍어도 스탬프북이 열린다. 손으로 누른 번호(k7q)도 받는다.
 */
export function checkpointOf(text: string): number {
  const raw = text.trim();
  const code = (
    raw.match(/\/stamp\/c\/([A-Za-z0-9]+)/)?.[1] ?? raw
  ).toUpperCase();
  return CHECKPOINTS.findIndex((c) => c.code === code);
}

export const checkpointUrl = (origin: string, i: number) =>
  `${origin}/stamp/c/${CHECKPOINTS[i].code}`;

export interface BookState {
  checkpointVersion?: number;
  /** 놀이형 코스. 체크포인트 순번 6개 */
  course?: number[];
  theme: ThemeId | null;
  name: string;
  gate: string;
  mode: "play" | "route";
  startHub?: string;
  boardingAt?: string;
  certGoal?: number;
  telemetry?: string[];
  /** 체크포인트 순번 → 찍은 시각(epoch ms) */
  stamps: Record<number, number>;
  role: string;
  /** 완성 사진(JPEG data URL). 이 기기 안에만 있다 */
  photo: string;
  certId: string;
  certAt: number;
}

export const EMPTY: BookState = {
  checkpointVersion: 3,
  theme: null,
  name: "",
  gate: "",
  mode: "play",
  stamps: {},
  role: "",
  photo: "",
  certId: "",
  certAt: 0,
};

export const countOf = (s: BookState) => Object.keys(s.stamps).length;

/** 인증 ID. 예: FL-2026-7KQ3. 헷갈리는 글자(0·O·1·I)는 뺀다. */
export function makeCertId(
  theme: ThemeId,
  now: Date,
  rand: () => number = Math.random,
): string {
  const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += abc[Math.floor(rand() * abc.length)];
  return `${THEMES[theme].idPrefix}-${now.getFullYear()}-${tail}`;
}
