import type { ServiceType } from "./service-request-model";
export const SERVICE_CATALOG = [
  {
    id: "mobility",
    label: "이동 지원",
    en: "Mobility support",
    description: "혼자 이동하기 어려울 때, 현재 위치에서 도움을 요청하세요.",
    descriptionEn: "Ask for help getting around from your current location.",
    service: "mobility",
    business: "shuttle",
    mode: "request",
    keywords: "휠체어 동행 전동차 이동",
    icon: "accessibility",
  },
  {
    id: "guidance",
    label: "길·시설 안내",
    en: "Directions and facilities",
    description: "현재 위치에서 탑승구·편의시설까지 경로를 바로 확인하세요.",
    descriptionEn: "Find a route to your gate or airport facilities.",
    service: "guidance",
    business: "passenger-terminal",
    mode: "request",
    keywords: "탑승구 화장실 수유실 안내",
    icon: "signpost",
  },
  {
    id: "robot",
    label: "찾아오는 안내로봇",
    en: "Visiting guidance robot",
    description: "안내로봇이 찾아오는 과정을 체험하는 모의 서비스예요.",
    descriptionEn: "Try a simulation of a robot visiting your location.",
    service: "robot",
    business: "passenger-terminal",
    mode: "simulation",
    keywords: "로봇 콜링 안내",
    icon: "bot",
  },
  {
    id: "facility",
    label: "시설 이용 불편",
    en: "Facility assistance",
    description: "장소와 불편 내용을 남기면 청소·현장 이용지원 업무로 접수돼요.",
    descriptionEn: "Submit a cleaning or facility access work order.",
    service: "guidance",
    business: "cleaning-t1",
    mode: "referral",
    keywords: "청소 미화 고장 불편 화장실",
    icon: "wrench",
  },
  {
    id: "traffic",
    label: "교통·주차 지원",
    en: "Transport and parking assistance",
    description: "주차장 현장 지원, 택시 승차, 버스·셔틀 이용 지원을 신청하세요.",
    descriptionEn:
      "Request car park, taxi boarding or bus assistance.",
    service: "guidance",
    business: "traffic-t1",
    mode: "referral",
    keywords: "교통 주차 택시 셔틀 버스",
    icon: "bus",
  },
  {
    id: "lost-property",
    label: "분실물 신고·인계",
    en: "Lost and found reports",
    description: "분실·습득 물품을 신고하고 처리 상태와 담당자의 결과를 확인하세요.",
    descriptionEn: "Report a lost or found item and follow its handling status.",
    service: "guidance",
    business: "passenger-terminal",
    mode: "referral",
    keywords: "분실 유실 잃어버림 물건",
    icon: "briefcase",
  },
  {
    id: "other",
    label: "기타 업무 요청",
    en: "Other service requests",
    description: "필요한 업무를 작성해 담당자의 처리 결과를 받아보세요.",
    descriptionEn: "Submit a service request and receive the handling result.",
    service: "guidance",
    business: "passenger-terminal",
    mode: "referral",
    keywords: "귀빈 전망대 교육원 청사 자유무역 자료 기타",
    icon: "messages",
  },
] as const;
export type SupportTopic = (typeof SERVICE_CATALOG)[number]["id"];
export function supportTopic(value: unknown) {
  return typeof value === "string"
    ? SERVICE_CATALOG.find((s) => s.id === value)
    : undefined;
}
export function topicLink(id: string, lang: "ko" | "en" = "ko") {
  const t = supportTopic(id);
  if (t?.id === "guidance") return "/navigate" + (lang === "en" ? "?lang=en" : "");
  return t
    ? "/help?" +
        new URLSearchParams({
          topic: t.id,
          service: t.service,
          fresh: "1",
          ...(lang === "en" ? { lang } : {}),
        }).toString()
    : "/help";
}
export function topicMatchesService(topic: unknown, service: ServiceType) {
  const t = supportTopic(topic);
  return !!t && t.service === service;
}
