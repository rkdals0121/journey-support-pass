// 등록 화면·종이 체크리스트·직원 화면이 함께 쓰는 선택 항목.
// 문구와 순서는 프로포절 1단계 2)의 표와 같아야 한다. 고칠 때는 종이 체크리스트도 같이 고칠 것.

export type Group = "category" | "move" | "comm" | "env" | "accompany";

export interface Item {
  code: string;
  label: string;
  /** 직원 목록에서 한눈에 보이게 줄인 말. 여객에게 묻는 문구는 label 을 쓴다. */
  short: string;
  group: Group;
  /**
   * 응대 방식을 알리는 것이 아니라 장비나 인력이 있어야 들어줄 수 있는 요청.
   * 여객에게는 예약이 아님을 알리고, 직원 카드에서는 따로 묶어 제공할 수 있는지 확인하게 한다.
   */
  request?: boolean;
}

export const GROUP_LABEL: Record<Group, string> = {
  category: "교통약자 구분",
  move: "이동",
  comm: "감각·소통",
  env: "환경",
  accompany: "동반",
};

/** 필요한 도움에 해당하는 묶음. 표 순서. */
export const NEED_GROUPS: Group[] = ["move", "comm", "env", "accompany"];

export const ITEMS: Item[] = [
  { code: "cat_disability", label: "장애가 있습니다", short: "장애", group: "category" },
  { code: "cat_senior", label: "고령자입니다", short: "고령", group: "category" },
  { code: "cat_pregnant", label: "임신 중입니다", short: "임신", group: "category" },
  { code: "cat_infant", label: "영유아와 함께합니다", short: "영유아 동반", group: "category" },
  { code: "cat_child", label: "어린이와 함께합니다", short: "어린이 동반", group: "category" },

  { code: "mov_wheelchair_own", label: "휠체어를 이용합니다", short: "휠체어 이용", group: "move" },
  { code: "mov_wheelchair_need", label: "휠체어가 필요합니다", short: "휠체어 필요", group: "move", request: true },
  { code: "mov_no_stairs", label: "계단이나 에스컬레이터 이용이 어렵습니다", short: "계단 어려움", group: "move" },
  { code: "mov_need_rest", label: "오래 걷기 어려워 중간에 쉬어야 합니다", short: "쉬어 가기", group: "move" },
  { code: "mov_no_standing", label: "오래 서 있기 어렵습니다", short: "서 있기 어려움", group: "move" },
  { code: "mov_escort", label: "함께 걸어주실 분이 필요합니다", short: "동행 필요", group: "move", request: true },

  { code: "com_hearing", label: "소리로 하는 안내를 듣기 어렵습니다", short: "듣기 어려움", group: "comm" },
  { code: "com_vision", label: "글자나 표지를 보기 어렵습니다", short: "보기 어려움", group: "comm" },
  { code: "com_written", label: "글이나 그림으로 안내해 주세요", short: "글·그림 안내", group: "comm" },
  { code: "com_slow", label: "천천히 설명해 주세요", short: "천천히 설명", group: "comm" },
  { code: "com_wayfinding", label: "길 안내가 필요합니다", short: "길 안내", group: "comm" },

  { code: "env_quiet", label: "혼잡하거나 시끄러운 곳이 힘듭니다", short: "조용한 곳", group: "env" },

  { code: "acc_stroller", label: "유모차를 함께 이동합니다", short: "유모차", group: "accompany" },
  { code: "acc_companion", label: "동반자가 있습니다", short: "동반자", group: "accompany" },
];

const BY_CODE = new Map(ITEMS.map((i) => [i.code, i]));

export function itemsOf(group: Group): Item[] {
  return ITEMS.filter((i) => i.group === group);
}

export function labelOf(code: string): string {
  return BY_CODE.get(code)?.label ?? "";
}

/** 장비나 인력이 있어야 들어줄 수 있는 요청인가. */
export function isRequest(code: string): boolean {
  return BY_CODE.get(code)?.request === true;
}

export function shortOf(code: string): string {
  return BY_CODE.get(code)?.short ?? "";
}

export function groupOf(code: string): Group | null {
  return BY_CODE.get(code)?.group ?? null;
}

/** 고른 코드 가운데 해당 묶음의 문구만, 표 순서로. */
export function labelsIn(codes: string[], group: Group): string[] {
  return itemsOf(group)
    .filter((i) => codes.includes(i.code))
    .map((i) => i.label);
}

export function validateSelection(categories: string[], needs: string[]): string | null {
  if (!Array.isArray(categories) || !Array.isArray(needs)) return "선택 항목 형식이 맞지 않습니다";
  if (categories.length === 0) return "교통약자 구분을 하나 이상 골라 주세요";
  if (new Set(categories).size !== categories.length || new Set(needs).size !== needs.length) {
    return "같은 항목이 두 번 들어 있습니다";
  }
  if (categories.some((c) => groupOf(c) !== "category")) return "교통약자 구분 항목이 맞지 않습니다";
  if (needs.some((c) => {
    const g = groupOf(c);
    return g === null || g === "category";
  })) {
    return "필요한 도움 항목이 맞지 않습니다";
  }
  return null;
}

/** 삭제 후 집계에 남기는 지원 종류. 묶음 단위로만 남긴다. */
export function supportGroups(needs: string[]): string[] {
  const present = new Set(needs.map(groupOf));
  return NEED_GROUPS.filter((g) => present.has(g)).map((g) => GROUP_LABEL[g]);
}
