// Public, browser-safe pilot configuration. No production codes or credentials.
import { PLACES, placeOf } from "./airport";
import type { DispatchResource } from "./resource-model";

export const BUSINESS_SOURCE =
  "https://airportos.co.kr/?act=info.page&pcode=business";
export const PROFILE_DATE = "2026-10-26";
export const BUSINESS_GROUPS = [
  { id: "terminal", label: "터미널 운영", en: "Terminal operations" },
  { id: "transport", label: "교통 운영", en: "Transport operations" },
  { id: "cleaning", label: "환경미화 운영", en: "Cleaning operations" },
  { id: "facilities", label: "시설 운영", en: "Facility operations" },
] as const;
export interface BusinessArea {
  id: string;
  group: (typeof BUSINESS_GROUPS)[number]["id"];
  label: string;
  en: string;
  owner: string;
  scope: string;
  scopeEn: string;
  tasks: string[];
  tasksEn: string[];
  access: "passenger" | "coordination" | "internal";
}
export const BUSINESS_AREAS: BusinessArea[] = [
  {
    id: "passenger-terminal",
    group: "terminal",
    label: "여객터미널 운영",
    en: "Passenger terminal services",
    owner: "여객터미널 운영 담당",
    scope: "T1·탑승동·T2 여객 접점",
    scopeEn: "Passenger areas in T1, Concourse and T2",
    tasks: [
      "안내데스크",
      "여객서비스·이동 안내·혼잡관리·편의시설 점검",
      "입국장 서비스데스크",
      "헬프데스크",
      "안내방송",
      "유실물 접수·반환",
      "박물관",
      "건설상황실",
      "자원봉사 지원",
    ],
    tasksEn: [
      "Information desks",
      "Passenger guidance, crowd flow and amenity checks",
      "Arrivals service desks",
      "Help desk",
      "Announcements",
      "Lost property",
      "Museum",
      "Construction exhibition",
      "Volunteer support",
    ],
    access: "passenger",
  },
  {
    id: "vip",
    group: "terminal",
    label: "귀빈실 운영",
    en: "VIP room services",
    owner: "귀빈실·홍보전망대 운영 담당",
    scope: "귀빈실·홍보전망대·오성산 전망대",
    scopeEn: "VIP rooms and public observation facilities",
    tasks: ["귀빈 이용 절차 협의·안내", "홍보·전망 시설 운영"],
    tasksEn: [
      "Coordinated VIP assistance",
      "Exhibition and observation facilities",
    ],
    access: "coordination",
  },
  {
    id: "boarding-bridge",
    group: "terminal",
    label: "탑승교 운영",
    en: "Passenger boarding bridges",
    owner: "탑승교 전문 운영 담당",
    scope: "T1·탑승동·T2 탑승교",
    scopeEn: "Boarding bridges at T1, Concourse and T2",
    tasks: ["항공기 접현·이현", "전문 운영 절차 이행"],
    tasksEn: [
      "Bridge docking and undocking",
      "Specialist operating procedures",
    ],
    access: "internal",
  },
  {
    id: "traffic-t1",
    group: "transport",
    label: "T1 교통관리",
    en: "T1 traffic and parking",
    owner: "T1 교통관리 담당",
    scope: "T1 주차장·일반구역 도로",
    scopeEn: "T1 car parks and landside roads",
    tasks: ["주차 운영·요금 안내", "교통 흐름·질서 관리", "택시 이용 안내"],
    tasksEn: [
      "Parking operations and fee information",
      "Traffic flow management",
      "Taxi service guidance",
    ],
    access: "passenger",
  },
  {
    id: "traffic-t2",
    group: "transport",
    label: "T2 교통관리",
    en: "T2 traffic and parking",
    owner: "T2 교통관리 담당",
    scope: "T2 주차장·일반구역 도로·버스터미널",
    scopeEn: "T2 car parks, landside roads and bus terminal",
    tasks: [
      "주차 운영·요금 안내",
      "교통 흐름·질서 관리",
      "택시·노선버스 이용 안내",
    ],
    tasksEn: [
      "Parking operations and fee information",
      "Traffic flow management",
      "Taxi and bus service guidance",
    ],
    access: "passenger",
  },
  {
    id: "shuttle",
    group: "transport",
    label: "셔틀버스 운영",
    en: "Shuttle services",
    owner: "셔틀버스·교통약자지원 차량 담당",
    scope: "공항 셔틀 노선·정차장",
    scopeEn: "Airport shuttle routes and stops",
    tasks: [
      "랜드사이드·에어사이드 셔틀",
      "교통약자지원 차량",
      "차량·정차장 시설 관리",
    ],
    tasksEn: [
      "Landside and airside shuttles",
      "Accessible vehicle services",
      "Vehicle and stop maintenance",
    ],
    access: "passenger",
  },
  {
    id: "cleaning-t1",
    group: "cleaning",
    label: "T1 환경미화",
    en: "T1 cleaning",
    owner: "T1 환경미화 담당",
    scope: "T1 건물·주변 시설",
    scopeEn: "T1 buildings and surrounding areas",
    tasks: ["공용공간·화장실·주변 시설 청결 관리"],
    tasksEn: ["Cleaning of public spaces, toilets and surrounding facilities"],
    access: "passenger",
  },
  {
    id: "cleaning-t2",
    group: "cleaning",
    label: "T2 환경미화",
    en: "T2 cleaning",
    owner: "T2 환경미화 담당",
    scope: "T2·교통센터·관련 부대 시설",
    scopeEn: "T2, transport centre and associated buildings",
    tasks: ["터미널·교통센터·주변 시설 청결 관리"],
    tasksEn: [
      "Cleaning of terminal, transport centre and surrounding facilities",
    ],
    access: "passenger",
  },
  {
    id: "cleaning-annex",
    group: "cleaning",
    label: "부대건물 환경미화",
    en: "Annex building cleaning",
    owner: "부대건물 환경미화 담당",
    scope: "공항청사·교육원 등 부대건물",
    scopeEn: "Airport offices, training centre and annex buildings",
    tasks: ["부대건물 청결 관리", "유리미화"],
    tasksEn: ["Annex building cleaning", "Glass cleaning"],
    access: "coordination",
  },
  {
    id: "free-trade",
    group: "facilities",
    label: "자유무역지역 운영",
    en: "Free trade zone operations",
    owner: "자유무역지역 운영 담당",
    scope: "위탁 자유무역지역 시설·물류단지",
    scopeEn: "Managed free trade zone facilities and logistics areas",
    tasks: ["시설 유지관리·미화·교통·경비", "입주·임대·출입 지원"],
    tasksEn: [
      "Facility, cleaning, traffic and security services",
      "Tenant, lease and access support",
    ],
    access: "coordination",
  },
  {
    id: "offices-training",
    group: "facilities",
    label: "청사·항공교육원 운영",
    en: "Office and training centre operations",
    owner: "청사·항공교육원 운영 담당",
    scope: "청사·체육시설·항공교육원",
    scopeEn: "Offices, sports facilities and aviation training centre",
    tasks: ["방문객·사무·행사 지원", "차량·체육시설·교육시설 운영"],
    tasksEn: [
      "Visitor, office and event support",
      "Vehicle, sports and training facility operations",
    ],
    access: "coordination",
  },
  {
    id: "records",
    group: "facilities",
    label: "자료관리 운영",
    en: "Records management",
    owner: "자료관리 담당",
    scope: "문서접수실·정보도서관·기록물",
    scopeEn: "Document reception, information library and archives",
    tasks: ["문서 수발신·접수", "도면 표준화·기록물 보존"],
    tasksEn: [
      "Document reception and distribution",
      "Drawing standards and archive preservation",
    ],
    access: "internal",
  },
];
export function businessOf(id: unknown) {
  return typeof id === "string"
    ? BUSINESS_AREAS.find((b) => b.id === id)
    : undefined;
}
export const ACCESS_LABEL = {
  passenger: "여객 이용·불편 상담",
  coordination: "담당 부서 연결 상담",
  internal: "직원 전문 운영 업무",
};
export const ACCESS_EN = {
  passenger: "Passenger support enquiries",
  coordination: "Department referral enquiries",
  internal: "Specialist staff operations",
};
export const PILOT_RULES = {
  reception: "24시간 시연 접수",
  service: "24시간 직원 판단·시연 처리",
  equipment: "가용 상태 + 활성 구역 + 같은 장비 종류 + 기존 배차 없음",
  route: "같은 터미널·같은 보안 구역 안에서 직원 확인 후 이동",
  ownership:
    "안내데스크 접수·배정·인계 / 담당 구역 현장 처리 / 전문 부서 업무 연결",
} as const;
// Meeting points and destinations are demonstration data. Never route across
// a security boundary or terminal solely because two entries share a desk.
export function pilotDestinations(pickupId: string) {
  const from = placeOf(pickupId);
  return from
    ? PLACES.filter(
        (p) =>
          p.id !== from.id &&
          p.area === from.area &&
          p.landside === from.landside,
      )
    : [];
}
export function pilotResourceState(
  r: Pick<DispatchResource, "status" | "requestId">,
) {
  if (r.status === "maintenance") return "maintenance";
  if (r.status === "offline") return "offline";
  return r.requestId ? "busy" : "available";
}
