// 등록 화면과 안내 화면이 함께 쓰는 선택 항목.
// 문구와 순서는 제안서 1단계 2)의 표와 같아야 한다.
// 항목을 넣는 기준은 하나다. "이 답에 따라 기기가 보여주는 안내가 달라지는가".
// 진단명, 장애 유형, 이름은 묻지 않는다.
// 이 파일은 브라우저에서도 읽는다. 서버 전용 코드를 가져오지 말 것.

export type Group = "guide" | "move" | "facility" | "staff";

export interface Item {
  code: string;
  label: string;
  /** 영어 화면의 문구. */
  en: string;
  /** 직원 호출 화면과 확인 화면에서 쓰는 줄인 말. */
  short: string;
  group: Group;
}

export const GROUPS: Group[] = ["guide", "move", "facility", "staff"];

export const GROUP_LABEL: Record<Group, string> = {
  guide: "안내받는 방식",
  move: "이동",
  facility: "찾는 시설",
  staff: "직원 도움",
};

export const GROUP_EN: Record<Group, string> = {
  guide: "How to show guidance",
  move: "Getting around",
  facility: "Places you look for",
  staff: "Staff help",
};

export const ITEMS: Item[] = [
  { code: "gd_large", label: "큰 글씨로 보여주세요", en: "Show larger text", short: "큰 글씨", group: "guide" },
  { code: "gd_voice", label: "소리로 읽어주세요", en: "Read the screen aloud", short: "소리 안내", group: "guide" },
  { code: "gd_picture", label: "글과 그림으로 보여주세요", en: "Show text with pictures", short: "글·그림", group: "guide" },
  { code: "gd_easy", label: "쉬운 말로 알려주세요", en: "Use simple words", short: "쉬운 말", group: "guide" },

  { code: "mov_wheelchair_own", label: "휠체어를 이용합니다", en: "I use a wheelchair", short: "휠체어 이용", group: "move" },
  { code: "mov_wheelchair_need", label: "휠체어가 필요합니다", en: "I need a wheelchair", short: "휠체어 필요", group: "move" },
  {
    code: "mov_no_stairs",
    label: "계단이나 에스컬레이터 이용이 어렵습니다",
    en: "Stairs and escalators are difficult for me",
    short: "계단 어려움",
    group: "move",
  },
  {
    code: "mov_need_rest",
    label: "오래 걷기 어려워 중간에 쉬어야 합니다",
    en: "I cannot walk far and need to rest on the way",
    short: "쉬어 가기",
    group: "move",
  },
  { code: "mov_no_standing", label: "오래 서 있기 어렵습니다", en: "I cannot stand for long", short: "서 있기 어려움", group: "move" },

  { code: "fac_restroom", label: "장애인 화장실", en: "Accessible toilet", short: "장애인 화장실", group: "facility" },
  { code: "fac_nursing", label: "유아 휴게실·수유실", en: "Baby care and nursing room", short: "수유실", group: "facility" },
  { code: "fac_rest", label: "쉴 곳", en: "A place to rest", short: "쉴 곳", group: "facility" },
  { code: "fac_lounge", label: "교통약자 라운지", en: "Assistance lounge", short: "라운지", group: "facility" },
  { code: "fac_calm", label: "심리안정실", en: "Quiet room", short: "심리안정실", group: "facility" },

  {
    code: "stf_call",
    label: "필요할 때 직원을 부르고 싶습니다",
    en: "I want to call staff when I need help",
    short: "직원 호출 원함",
    group: "staff",
  },
  { code: "stf_self", label: "스스로 이용하겠습니다", en: "I will manage by myself", short: "스스로 이용", group: "staff" },
];

const BY_CODE = new Map(ITEMS.map((i) => [i.code, i]));

export function itemsOf(group: Group): Item[] {
  return ITEMS.filter((i) => i.group === group);
}

export function itemOf(code: string): Item | null {
  return BY_CODE.get(code) ?? null;
}

export function labelOf(code: string, lang: "ko" | "en" = "ko"): string {
  const item = BY_CODE.get(code);
  return item ? (lang === "en" ? item.en : item.label) : "";
}

export function shortOf(code: string): string {
  return BY_CODE.get(code)?.short ?? "";
}

export function groupOf(code: string): Group | null {
  return BY_CODE.get(code)?.group ?? null;
}

/** 아는 항목만, 표 순서로 돌려준다. 예전 구조의 코드가 섞여 있어도 화면이 깨지지 않게 한다. */
export function knownCodes(codes: string[]): string[] {
  return ITEMS.filter((i) => codes.includes(i.code)).map((i) => i.code);
}

/** 한 묶음에서 하나만 고르는 묶음. */
export const SINGLE: Group[] = ["staff"];

export function validateChoices(choices: unknown): string | null {
  if (!Array.isArray(choices) || choices.some((c) => typeof c !== "string")) return "선택 항목 형식이 맞지 않습니다";
  if (new Set(choices).size !== choices.length) return "같은 항목이 두 번 들어 있습니다";
  if (choices.some((c) => !BY_CODE.has(c))) return "선택 항목이 맞지 않습니다";
  for (const g of SINGLE) {
    if (choices.filter((c) => groupOf(c) === g).length > 1) return `${GROUP_LABEL[g]}은 하나만 고를 수 있습니다`;
  }
  return null;
}

/** 안내받는 방식을 하나라도 켰는가. 켰을 때와 껐을 때의 완료 비율을 비교하는 데 쓴다. */
export function isAdapted(choices: string[]): boolean {
  return choices.some((c) => groupOf(c) === "guide");
}

/** 화면이 바로 쓰는 설정. 안내받는 방식과 직원 도움에서 나온다. */
export interface Prefs {
  large: boolean;
  voice: boolean;
  picture: boolean;
  easy: boolean;
  /** 「직원 부르기」를 크게 둘지. */
  wantsStaff: boolean;
}

export function prefsOf(choices: string[]): Prefs {
  const has = (c: string) => choices.includes(c);
  return {
    large: has("gd_large"),
    voice: has("gd_voice"),
    picture: has("gd_picture"),
    easy: has("gd_easy"),
    wantsStaff: has("stf_call"),
  };
}
