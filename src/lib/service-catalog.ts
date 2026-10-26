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
    description: "탑승구·편의시설·공항 이용 방법을 직원과 확인하세요.",
    descriptionEn: "Ask staff about gates, facilities and airport procedures.",
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
    description: "청결·편의시설 이용 불편을 알리고 담당 연결을 요청하세요.",
    descriptionEn: "Tell staff about a facility or cleanliness issue.",
    service: "guidance",
    business: "cleaning-t1",
    mode: "referral",
    keywords: "청소 미화 고장 불편 화장실",
    icon: "wrench",
  },
  {
    id: "traffic",
    label: "교통·주차 안내",
    en: "Transport and parking",
    description: "버스·택시·주차 이용 안내와 담당 부서 연결을 요청하세요.",
    descriptionEn:
      "Ask about buses, taxis, parking and the right service desk.",
    service: "guidance",
    business: "traffic-t1",
    mode: "referral",
    keywords: "교통 주차 택시 셔틀 버스",
    icon: "bus",
  },
  {
    id: "lost-property",
    label: "분실물 문의",
    en: "Lost property enquiries",
    description: "유실물 이용 절차와 정식 접수 창구를 안내받으세요.",
    descriptionEn: "Find out how to contact the official lost-property desk.",
    service: "guidance",
    business: "passenger-terminal",
    mode: "referral",
    keywords: "분실 유실 잃어버림 물건",
    icon: "briefcase",
  },
  {
    id: "other",
    label: "기타 직원 상담",
    en: "Other enquiries",
    description: "필요한 업무를 함께 확인하고 담당 창구를 안내해 드려요.",
    descriptionEn: "Let staff help you find the right department.",
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
  return t
    ? "/help?" +
        new URLSearchParams({
          topic: t.id,
          service: t.service,
          ...(lang === "en" ? { lang } : {}),
        }).toString()
    : "/help";
}
export function topicMatchesService(topic: unknown, service: ServiceType) {
  const t = supportTopic(topic);
  return !!t && t.service === service;
}
