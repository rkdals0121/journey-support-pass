import { placeOf, type Area } from "./airport";

/** Demonstration placements; not surveyed coordinates or approved airport operating policy. */
export const SERVICE_HUBS = [
  {
    id: "t1-departure",
    code: "K7Q",
    placeId: "t1-info",
    label: "T1 출발층 안내데스크",
    en: "T1 departures information desk",
    x: 35,
    y: 70,
    landmark: "3층 안내데스크 옆 초록색 만남 표지",
    landmarkEn: "Green meeting sign beside the information desk, 3F",
  },
  {
    id: "t1-care",
    code: "M2W",
    placeId: "t1-care",
    label: "T1 안심여행센터 앞",
    en: "T1 assistance centre",
    x: 60,
    y: 70,
    landmark: "3층 안심여행센터 앞 만남 표지",
    landmarkEn: "Meeting sign in front of the assistance centre, 3F",
  },
  {
    id: "t1-airside",
    code: "R5T",
    placeId: "t1-center",
    label: "T1 면세구역 중앙",
    en: "T1 central airside",
    x: 50,
    y: 30,
    landmark: "25번 게이트 부근 만남 표지",
    landmarkEn: "Meeting sign near gate 25, 3F",
  },
  {
    id: "concourse",
    code: "B8N",
    placeId: "cc-center",
    label: "탑승동 중앙",
    en: "Concourse centre",
    x: 50,
    y: 35,
    landmark: "탑승동 3층 116번 게이트 앞 만남 표지",
    landmarkEn: "Meeting sign by gate 116 in the concourse, 3F",
  },
  {
    id: "t2-departure",
    code: "H3F",
    placeId: "t2-help",
    label: "T2 출발층 헬프데스크",
    en: "T2 departures help desk",
    x: 50,
    y: 70,
    landmark: "3층 헬프데스크 옆 초록색 만남 표지",
    landmarkEn: "Green meeting sign beside the help desk, 3F",
  },
  {
    id: "t2-airside",
    code: "D6X",
    placeId: "t2-center",
    label: "T2 면세구역 중앙",
    en: "T2 central airside",
    x: 50,
    y: 30,
    landmark: "250번 게이트 부근 만남 표지",
    landmarkEn: "Meeting sign near gate 250, 3F",
  },
] as const;
export type ServiceHub = (typeof SERVICE_HUBS)[number];
export function hubOf(id: unknown) {
  return SERVICE_HUBS.find((h) => h.id === id || h.code === id);
}
export function hubsFor(area: Area, landside?: boolean) {
  return SERVICE_HUBS.filter((h) => {
    const p = placeOf(h.placeId)!;
    return (
      p.area === area && (landside === undefined || p.landside === landside)
    );
  });
}
export const VISIT_SERVICES = {
  robot: "로봇 안내",
  mobility: "이동지원",
} as const;
export type VisitService = keyof typeof VISIT_SERVICES;
export interface HubRule {
  hubId: string;
  service: VisitService;
  openHour: number;
  closeHour: number;
  capacity: number;
  state: "ready" | "paused" | "charging";
  battery: number;
  availableAfter: string | null;
  reason: string;
  version: number;
}
export const DEFAULT_RULE = {
  openHour: 9,
  closeHour: 18,
  capacity: 1,
  state: "ready",
  battery: 100,
  availableAfter: null,
  reason: "",
  version: 0,
} as const;
export const VISIT_MINUTES = 30;
export const VISIT_STATES = {
  booked: "예약 확정",
  checked_in: "도착 확인",
  responding: "로봇 응대 중",
  handed_over: "직원 인계",
  done: "완료",
  cancelled: "취소",
  missed: "방문 시간 지남",
} as const;
export type VisitState = keyof typeof VISIT_STATES;
export interface VisitView {
  id: string;
  hubId: string;
  service: VisitService;
  startAt: string;
  state: VisitState;
  task: "directions" | "wheelchair" | "escort";
  choices: string[];
  party: number;
  recognition: string;
  destinationId: string | null;
  requestId: string | null;
  assignedCrew: string | null;
  version: number;
  createdAt: string;
  notice: string;
  lang?: "ko" | "en";
  handedOverAt?: string | null;
  resourceId?: string | null;
  registrationId?: string | null;
  flightNo?: string | null;
  flightDate?: string | null;
}
export function ruleBlock(
  rule: HubRule,
  start: Date,
  now: Date,
): string | null {
  const kst = new Date(start.getTime() + 9 * 3600000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (start <= now || start.getTime() > now.getTime() + 7 * 86400000)
    return "오늘부터 7일 이내의 남은 시간대를 선택해 주세요";
  if (
    kst.getUTCMinutes() % VISIT_MINUTES ||
    start.getUTCSeconds() ||
    start.getUTCMilliseconds() ||
    minutes < rule.openHour * 60 ||
    minutes + VISIT_MINUTES > rule.closeHour * 60
  )
    return "운영시간 안의 30분 단위 시간대를 선택해 주세요";
  if (rule.state === "paused")
    return rule.reason || "혼잡·안전 확인으로 운영을 잠시 멈췄습니다";
  if (rule.availableAfter && start.getTime() < Date.parse(rule.availableAfter))
    return "충전·복귀가 끝난 뒤의 시간대를 선택해 주세요";
  if ((rule.state === "charging" || rule.battery < 20) && !rule.availableAfter)
    return "장비 준비 시간은 직원 확인이 필요합니다";
  if (rule.capacity < 1) return "이 시간에 이용 가능한 운영 단위가 없습니다";
  return null;
}
