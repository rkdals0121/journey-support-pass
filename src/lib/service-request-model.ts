// Shared display model. No database or secrets in this browser-safe module.
export const SERVICE_TYPES = ["guidance", "robot", "mobility"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export const REQUEST_STATES = [
  "received",
  "assigned",
  "en_route",
  "arrived",
  "serving",
  "done",
  "cancelled",
  "unavailable",
  "expired",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];
export const OPEN_REQUEST_STATES: RequestState[] = [
  "received",
  "assigned",
  "en_route",
  "arrived",
  "serving",
];
export const SERVICE_LABEL = {
  guidance: "직원 안내",
  robot: "찾아오는 안내로봇 · 모의 시연",
  mobility: "이동지원 상담·접수",
};
export const SERVICE_EN = {
  guidance: "Staff guidance",
  robot: "Visiting robot · simulation",
  mobility: "Mobility assistance request",
};
export const STATE_LABEL: Record<RequestState, string> = {
  received: "접수됨",
  assigned: "담당자 배정",
  en_route: "현장으로 이동 중",
  arrived: "현장 도착",
  serving: "지원 중",
  done: "완료",
  cancelled: "취소됨",
  unavailable: "지원 불가",
  expired: "시간 초과 · 종료",
};
export const STATE_EN: Record<RequestState, string> = {
  received: "Received",
  assigned: "Assigned",
  en_route: "On the way to you",
  arrived: "Arrived",
  serving: "Providing assistance",
  done: "Completed",
  cancelled: "Cancelled",
  unavailable: "Unavailable",
  expired: "Timed out · closed",
};
export interface ServiceRequestView {
  id: string;
  service: ServiceType;
  state: RequestState;
  placeId: string;
  place: string;
  placeEn: string;
  choices: string[];
  party: number;
  note: string;
  lang: "ko" | "en";
  source: "web" | "preregistered" | "kiosk" | "assisted";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  assignedZone: string | null;
  reason: string;
  version: number;
}
export type RequestAction =
  | "assign"
  | "travel"
  | "arrive"
  | "serve"
  | "complete"
  | "unavailable"
  | "reopen";
export const NEXT_REQUEST_ACTION: Partial<
  Record<RequestState, { action: RequestAction; label: string }>
> = {
  received: { action: "assign", label: "제가 맡겠습니다" },
  assigned: { action: "travel", label: "현장으로 출발" },
  en_route: { action: "arrive", label: "현장 도착" },
  arrived: { action: "serve", label: "지원 시작" },
  serving: { action: "complete", label: "지원 완료" },
};

export interface RequestSummary {
  received: number;
  active: number;
  done: number;
  cancelled: number;
  unavailable: number;
  expired: number;
  medianAcceptSec: number | null;
  medianArrivalSec: number | null;
}
