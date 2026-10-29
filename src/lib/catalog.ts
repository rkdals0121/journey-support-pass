// 등록 화면과 안내 화면이 함께 쓰는 선택 항목.
// 문구와 순서는 팀 문서 「공항 이용 도움 체크리스트 (가지뻗기)」와 같아야 한다.
//  1쪽: 「어떤 점이 불편하세요?」 여덟 가지 가운데 고른다(trouble).
//  2쪽: 고른 불편마다 가지(branch)를 하나씩 묻는다. 고르지 않은 가지는 묻지 않는다.
//  3쪽: 모두에게 세 가지를 더 묻는다(함께 가는 분, 도움 받는 방식, 들를 곳).
// 항목을 넣는 기준은 하나다. "이 답에 따라 기기가 보여주는 안내나 직원의 준비가 달라지는가".
// 진단명, 장애 유형, 이름은 묻지 않는다. 장애 유형으로 나누지 않고 불편으로 나눈다.
// 이 파일은 브라우저에서도 읽는다. 서버 전용 코드를 가져오지 말 것.

export type Group =
  | "trouble"
  | "walk"
  | "buggy"
  | "stand"
  | "see"
  | "hear"
  | "understand"
  | "child"
  | "unsure"
  | "companion"
  | "help"
  | "stops";

export interface Item {
  code: string;
  label: string;
  /** 영어 화면의 문구. */
  en: string;
  /** 직원 호출 화면과 확인 화면에서 쓰는 줄인 말. */
  short: string;
  group: Group;
}

export const GROUPS: Group[] = ["trouble", "walk", "buggy", "stand", "see", "hear", "understand", "child", "unsure", "companion", "help", "stops"];

/** 2쪽의 가지. 1쪽에서 고른 불편 하나가 가지 하나를 연다. 걷기 가지에는 전동차 물음이 함께 있다. */
export type Branch = "walk" | "stand" | "see" | "hear" | "understand" | "child" | "unsure";

export const BRANCHES: { branch: Branch; trouble: string; groups: Group[] }[] = [
  { branch: "walk", trouble: "tr_walk", groups: ["walk", "buggy"] },
  { branch: "stand", trouble: "tr_stand", groups: ["stand"] },
  { branch: "see", trouble: "tr_see", groups: ["see"] },
  { branch: "hear", trouble: "tr_hear", groups: ["hear"] },
  { branch: "understand", trouble: "tr_understand", groups: ["understand"] },
  { branch: "child", trouble: "tr_child", groups: ["child"] },
  { branch: "unsure", trouble: "tr_unsure", groups: ["unsure"] },
];

export const GROUP_LABEL: Record<Group, string> = {
  trouble: "불편한 점",
  walk: "걷기",
  buggy: "전동차",
  stand: "서서 기다리기",
  see: "보기",
  hear: "듣기 · 말하기",
  understand: "안내 이해하기",
  child: "아이와 함께 가기",
  unsure: "잘 모르겠어요",
  companion: "함께 가는 분",
  help: "도움 받는 방식",
  stops: "들를 곳",
};

export const GROUP_EN: Record<Group, string> = {
  trouble: "What is difficult",
  walk: "Walking",
  buggy: "Buggy",
  stand: "Standing and waiting",
  see: "Seeing",
  hear: "Hearing and speaking",
  understand: "Understanding guidance",
  child: "Travelling with a child",
  unsure: "Not sure",
  companion: "Travelling with",
  help: "How you get help",
  stops: "Places to stop by",
};

export const ITEMS: Item[] = [
  // 1쪽
  { code: "tr_walk", label: "걷기", en: "Walking", short: "걷기", group: "trouble" },
  { code: "tr_stand", label: "서서 기다리기", en: "Standing and waiting", short: "서서 기다리기", group: "trouble" },
  { code: "tr_see", label: "보기", en: "Seeing", short: "보기", group: "trouble" },
  { code: "tr_hear", label: "듣기 · 말하기", en: "Hearing and speaking", short: "듣기·말하기", group: "trouble" },
  { code: "tr_understand", label: "안내 이해하기", en: "Understanding guidance", short: "안내 이해", group: "trouble" },
  { code: "tr_child", label: "아이와 함께 가기", en: "Travelling with a child", short: "아이 동반", group: "trouble" },
  { code: "tr_unsure", label: "잘 모르겠어요", en: "I am not sure", short: "잘 모름", group: "trouble" },
  { code: "tr_none", label: "지금은 없어요", en: "Nothing for now", short: "없음", group: "trouble" },

  // 2쪽: 걷기
  { code: "mov_wheelchair_own", label: "휠체어를 써요", en: "I use a wheelchair", short: "휠체어 이용", group: "walk" },
  { code: "mov_wheelchair_need", label: "휠체어를 빌릴래요", en: "I want to borrow a wheelchair", short: "휠체어 대여", group: "walk" },
  { code: "mov_no_stairs", label: "계단과 에스컬레이터는 어려워요", en: "Stairs and escalators are hard for me", short: "계단 어려움", group: "walk" },
  { code: "mov_need_rest", label: "중간에 쉬어야 해요", en: "I need to rest on the way", short: "쉬어 가기", group: "walk" },
  { code: "mov_slow", label: "천천히 가요", en: "I walk slowly", short: "천천히 걷기", group: "walk" },
  { code: "bug_ride", label: "타고 싶어요", en: "I want to ride one", short: "전동차 원함", group: "buggy" },
  { code: "bug_later", label: "걷다가 힘들면 그때 부를래요", en: "I will call one if walking gets hard", short: "전동차 필요 시", group: "buggy" },
  { code: "bug_no", label: "괜찮아요", en: "No, thank you", short: "전동차 필요 없음", group: "buggy" },

  // 2쪽: 서서 기다리기
  { code: "mov_no_standing", label: "앉을 곳을 알려주세요", en: "Show me where I can sit", short: "앉을 곳", group: "stand" },
  { code: "std_seat_help", label: "앉아서 기다리게 도와주세요", en: "Help me wait seated", short: "앉아서 대기", group: "stand" },

  // 2쪽: 보기
  { code: "gd_large", label: "큰 글씨로 보여주세요", en: "Show larger text", short: "큰 글씨", group: "see" },
  { code: "gd_voice", label: "소리로 읽어주세요", en: "Read the screen aloud", short: "소리 안내", group: "see" },
  { code: "see_braille", label: "점자 안내가 있는 곳을 알려주세요", en: "Show me where braille guidance is", short: "점자 안내", group: "see" },
  { code: "robot_hold", label: "로봇을 잡고 따라갈래요", en: "I will hold the robot and follow it", short: "로봇 잡고 동행", group: "see" },
  { code: "robot_sound", label: "소리만 따라갈래요", en: "I will follow the robot's sound only", short: "로봇 소리 동행", group: "see" },
  { code: "see_cane", label: "흰지팡이를 써요", en: "I use a white cane", short: "흰지팡이", group: "see" },
  { code: "see_dog", label: "안내견과 함께 가요", en: "I travel with a guide dog", short: "안내견", group: "see" },

  // 2쪽: 듣기 · 말하기
  { code: "hear_text", label: "글로 보여주세요", en: "Show me in writing", short: "글로 안내", group: "hear" },
  { code: "hear_write", label: "글로 답할래요", en: "I will answer in writing", short: "필담", group: "hear" },
  { code: "hear_point", label: "그림을 가리켜 답할래요", en: "I will answer by pointing at pictures", short: "그림 가리키기", group: "hear" },
  { code: "hear_sign", label: "수어 도움이 필요해요", en: "I need sign language help", short: "수어", group: "hear" },

  // 2쪽: 안내 이해하기
  { code: "und_one", label: "한 번에 하나씩 보여주세요", en: "Show me one thing at a time", short: "하나씩", group: "understand" },
  { code: "gd_picture", label: "그림과 함께 보여주세요", en: "Show me with pictures", short: "글·그림", group: "understand" },
  { code: "gd_easy", label: "쉬운 말로 알려주세요", en: "Use simple words", short: "쉬운 말", group: "understand" },
  { code: "und_slow", label: "천천히 설명해 주세요", en: "Explain slowly", short: "천천히 설명", group: "understand" },

  // 2쪽: 아이와 함께 가기
  { code: "chd_feed", label: "수유할 곳이 필요해요", en: "I need a place to breastfeed", short: "수유", group: "child" },
  { code: "chd_formula", label: "분유를 준비할 곳이 필요해요", en: "I need a place to prepare formula", short: "분유 준비", group: "child" },
  { code: "chd_diaper", label: "기저귀 갈 곳이 필요해요", en: "I need a place to change nappies", short: "기저귀", group: "child" },
  { code: "chd_stroller_own", label: "유모차와 함께 가요", en: "I have a stroller", short: "유모차 동반", group: "child" },
  { code: "chd_stroller_need", label: "유모차를 빌릴래요", en: "I want to borrow a stroller", short: "유모차 대여", group: "child" },
  { code: "chd_rest", label: "아이가 쉴 곳이 필요해요", en: "My child needs a place to rest", short: "아이 쉴 곳", group: "child" },

  // 2쪽: 잘 모르겠어요
  { code: "uns_one", label: "질문을 하나씩 해 주세요", en: "Ask me one question at a time", short: "1문 1답", group: "unsure" },

  // 3쪽: 함께 가시는 분
  { code: "cmp_alone", label: "혼자 가요", en: "I am travelling alone", short: "혼자", group: "companion" },
  { code: "cmp_with", label: "함께 가는 분이 있어요", en: "Someone is travelling with me", short: "동행 있음", group: "companion" },
  { code: "cmp_more", label: "그중 도움이 필요한 분이 더 있어요", en: "Others in my group also need help", short: "도움 필요한 동행", group: "companion" },

  // 3쪽: 도움은 어떻게 받으시겠어요?
  { code: "stf_visit", label: "직원이 먼저 찾아와 주세요", en: "Please have staff come to me", short: "직원 방문", group: "help" },
  { code: "stf_call", label: "제가 필요할 때 부를게요", en: "I will call when I need help", short: "필요 시 호출", group: "help" },
  { code: "stf_escort", label: "탑승구까지 함께 가주세요", en: "Please go with me to the gate", short: "탑승구 동행", group: "help" },
  { code: "stf_robot", label: "로봇과 함께 갈래요", en: "I will go with the robot", short: "로봇 동행", group: "help" },

  // 3쪽: 가시는 길에 들르실 곳이 있나요?
  { code: "fac_restroom", label: "화장실", en: "Toilet", short: "화장실", group: "stops" },
  { code: "fac_nursing", label: "수유실 · 기저귀 갈 곳", en: "Nursing and nappy-changing room", short: "수유실", group: "stops" },
  { code: "stp_stroller", label: "유모차 빌리는 곳", en: "Stroller loan desk", short: "유모차 대여소", group: "stops" },
  { code: "stp_pharmacy", label: "약국", en: "Pharmacy", short: "약국", group: "stops" },
  { code: "stp_food", label: "밥 먹을 곳", en: "Somewhere to eat", short: "식당", group: "stops" },
  { code: "fac_calm", label: "조용히 쉴 곳", en: "A quiet place to rest", short: "조용한 곳", group: "stops" },
  { code: "stp_none", label: "들를 곳 없어요", en: "No stops", short: "들를 곳 없음", group: "stops" },
];

const BY_CODE = new Map(ITEMS.map((i) => [i.code, i]));

export function itemsOf(group: Group): Item[] {
  // Keep retired codes readable on existing registrations, but do not offer
  // the proactive staff-visit preference in new selection lists.
  return ITEMS.filter((i) => i.group === group && i.code !== "stf_visit");
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
export const SINGLE: Group[] = ["buggy", "companion"];

/**
 * 함께 고를 수 없는 항목. 하나를 고르면 같은 줄의 나머지는 풀린다.
 * 「지금은 없어요」「들를 곳 없어요」는 그 묶음의 다른 것과 함께 고를 수 없다(SOLO).
 */
export const EXCLUSIVE: string[][] = [
  ["robot_hold", "robot_sound"],
  ["stf_visit", "stf_call"],
];
export const SOLO = ["tr_none", "stp_none"];

/** 이 가지를 여는 불편을 골랐는가. */
export function branchesOf(choices: string[]): Branch[] {
  return BRANCHES.filter((b) => choices.includes(b.trouble)).map((b) => b.branch);
}

export function groupsOfBranch(branch: Branch): Group[] {
  return BRANCHES.find((b) => b.branch === branch)?.groups ?? [];
}

/** 가지에 딸린 묶음이면 그 가지를 연 불편 코드. 가지 밖의 묶음이면 null. */
function troubleOfGroup(group: Group): string | null {
  return BRANCHES.find((b) => b.groups.includes(group))?.trouble ?? null;
}

/**
 * 한 항목을 누른 뒤의 선택. 이미 골랐으면 풀고, 아니면 고르면서 함께 고를 수 없는 것을 푼다.
 * 1쪽의 불편을 풀면 그 가지에서 고른 것도 함께 지운다. 보이지 않는 답이 남지 않게 한다.
 */
export function toggleChoice(list: string[], code: string): string[] {
  const group = groupOf(code);
  if (!group) return list;
  if (list.includes(code)) return pruneChoices(list.filter((c) => c !== code));
  let rest = list;
  if (SINGLE.includes(group)) rest = rest.filter((c) => groupOf(c) !== group);
  if (SOLO.includes(code)) rest = rest.filter((c) => groupOf(c) !== group);
  else rest = rest.filter((c) => !(SOLO.includes(c) && groupOf(c) === group));
  const clash = EXCLUSIVE.find((set) => set.includes(code));
  if (clash) rest = rest.filter((c) => !clash.includes(c));
  return pruneChoices([...rest, code]);
}

/** 고르지 않은 가지에 남은 답을 지운다. */
export function pruneChoices(list: string[]): string[] {
  return list.filter((c) => {
    const g = groupOf(c);
    const trouble = g ? troubleOfGroup(g) : null;
    return trouble === null || list.includes(trouble);
  });
}

export function validateChoices(choices: unknown): string | null {
  if (!Array.isArray(choices) || choices.some((c) => typeof c !== "string")) return "선택 항목 형식이 맞지 않습니다";
  if (new Set(choices).size !== choices.length) return "같은 항목이 두 번 들어 있습니다";
  if (choices.some((c) => !BY_CODE.has(c))) return "선택 항목이 맞지 않습니다";
  for (const g of SINGLE) {
    if (choices.filter((c) => groupOf(c) === g).length > 1) return `${GROUP_LABEL[g]}은 하나만 고를 수 있습니다`;
  }
  for (const solo of SOLO) {
    if (choices.includes(solo) && choices.some((c) => c !== solo && groupOf(c) === groupOf(solo))) {
      return `「${labelOf(solo)}」는 다른 항목과 함께 고를 수 없습니다`;
    }
  }
  for (const set of EXCLUSIVE) {
    if (choices.filter((c) => set.includes(c)).length > 1) return `${set.map((c) => `「${labelOf(c)}」`).join("와 ")}는 함께 고를 수 없습니다`;
  }
  return null;
}

// 화면을 바꾸는 항목. 하나라도 켰으면 "맞춤 화면을 켰다"로 센다.
const ADAPT_CODES = ["gd_large", "gd_voice", "gd_picture", "gd_easy", "und_one", "und_slow", "hear_text"];

/** 안내받는 방식을 하나라도 켰는가. 켰을 때와 껐을 때의 완료 비율을 비교하는 데 쓴다. */
export function isAdapted(choices: string[]): boolean {
  return choices.some((c) => ADAPT_CODES.includes(c));
}

/** 화면이 바로 쓰는 설정. */
export interface Prefs {
  large: boolean;
  voice: boolean;
  picture: boolean;
  easy: boolean;
  /** 소리 안내를 천천히 읽는다(「천천히 설명해 주세요」). */
  slow: boolean;
  /** 「직원 부르기」를 크게 둘지. */
  wantsStaff: boolean;
}

export function prefsOf(choices: string[]): Prefs {
  const has = (c: string) => choices.includes(c);
  return {
    large: has("gd_large"),
    voice: has("gd_voice"),
    picture: has("gd_picture") || has("hear_point"),
    easy: has("gd_easy") || has("uns_one"),
    slow: has("und_slow"),
    wantsStaff: has("stf_call") || has("stf_visit") || has("stf_escort") || has("hear_sign"),
  };
}

// 직원이 전동차·동행을 준비할 때 볼 항목. 걷기 가지, 전동차, 도움 받는 방식, 그리고 이동에 함께 따르는 것.
const MOBILITY_GROUPS: Group[] = ["walk", "buggy", "help"];
const MOBILITY_EXTRA = ["see_cane", "see_dog", "robot_hold", "robot_sound", "chd_stroller_own", "std_seat_help", "hear_sign", "hear_write"];

/** 우대출구·이동지원 직원에게 보이는 필요한 지원. 줄인 말로 돌려준다. */
export function mobilityNeeds(choices: string[]): string[] {
  return knownCodes(choices)
    .filter((c) => MOBILITY_GROUPS.includes(groupOf(c)!) || MOBILITY_EXTRA.includes(c))
    .map(shortOf);
}

/** 직원 호출 화면에 보이는 고른 항목. 1쪽의 불편 이름과 「없어요」는 빼고 가지 안의 답만 보인다. */
export function supportNeeds(choices: string[]): string[] {
  return knownCodes(choices)
    .filter((c) => groupOf(c) !== "trouble" && !SOLO.includes(c))
    .map(shortOf);
}

/** 등록할 때 함께 받는 숫자와 글. 이름이나 연락처는 아니다. */
export interface Extra {
  /** 함께 가는 사람을 포함한 모두의 수. 모르면 null. */
  party: number | null;
  /** 유모차 수. 모르면 null. */
  strollers: number | null;
  /** 「더 하고 싶은 말씀」. 비어 있을 수 있다. */
  note: string;
}

export const NO_EXTRA: Extra = { party: null, strollers: null, note: "" };
export const NOTE_MAX = 200;
export const PARTY_MAX = 20;
export const STROLLER_MAX = 10;

/** 화면이 보낸 값을 받을 수 있는 모양으로 고친다. 범위를 벗어난 숫자는 null, 글은 줄바꿈 말고는 조절 문자를 빼고 자른다. */
export function cleanExtra(v: { party?: unknown; strollers?: unknown; note?: unknown }): Extra {
  const num = (x: unknown, min: number, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : null);
  const note =
    typeof v.note === "string"
      ? v.note
          .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
          .trim()
          .slice(0, NOTE_MAX)
      : "";
  return { party: num(v.party, 1, PARTY_MAX), strollers: num(v.strollers, 0, STROLLER_MAX), note };
}
