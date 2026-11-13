import Link from "next/link";
import {
  ArrowRight,
  Navigation,
  Accessibility,
  CarFront,
  Wrench,
  Bus,
  Bot,
  MessagesSquare,
} from "lucide-react";
import { topicLink } from "@/lib/service-catalog";
import type { KioskReturn } from "@/lib/help-entry";

const actions = [
  {
    id: "guidance",
    ko: "탑승구·시설 찾기",
    en: "Find a gate or facility",
    detail: "현재 위치에서 가는 길",
    detailEn: "Directions from your location",
    Icon: Navigation,
  },
  {
    id: "mobility",
    ko: "이동 도움받기",
    en: "Get mobility assistance",
    detail: "휠체어 · 이동 동행 · 차량",
    detailEn: "Wheelchair, escort or vehicle",
    Icon: Accessibility,
  },
  {
    id: "facility",
    ko: "시설 불편 알리기",
    en: "Report a facility issue",
    detail: "청소 · 시설 점검 요청",
    detailEn: "Cleaning or facility inspection",
    Icon: Wrench,
  },
  {
    id: "traffic",
    ko: "교통·주차 이용",
    en: "Transport and parking",
    detail: "승차 안내 · 주차장 현장 지원",
    detailEn: "Transport information or on-site help",
    Icon: Bus,
  },
  {
    id: "other",
    ko: "그 밖의 도움",
    en: "Other assistance",
    detail: "문의 · 기타 업무 요청",
    detailEn: "Enquiries and other requests",
    Icon: MessagesSquare,
  },
  {
    id: "robot",
    ko: "안내로봇 체험",
    en: "Try the guide robot",
    detail: "찾아오는 안내로봇 · 모의 시연",
    detailEn: "Visiting robot simulation",
    Icon: Bot,
  },
] as const;
export function TaskLauncher({
  en = false,
  returnTo,
  field = false,
  topics,
  device,
  kioskCards = false,
  preview = false,
}: {
  en?: boolean;
  returnTo?: KioskReturn;
  field?: boolean;
  topics?: readonly string[];
  device?: "robot" | "kiosk";
  kioskCards?: boolean;
  /** 기기 화면 미리보기(?preview=1) 안이면 다음 화면에도 미리보기를 잇는다 */
  preview?: boolean;
}) {
  return (
    <div className={"task-launcher" + (field ? " task-launcher-field" : "")}>
      {actions
        .filter((a) => (topics ? topics.includes(a.id) : a.id !== "robot"))
        .map(({ id, ko, en: english, detail, detailEn, Icon }) => {
          const href = new URL(
            topicLink(id, en ? "en" : "ko"),
            "https://local.invalid",
          );
          if (returnTo) href.searchParams.set("returnTo", returnTo);
          if (id === "guidance" && (device === "robot" || returnTo === "/kiosk/entry")) href.searchParams.set("device", "robot");
          if (id !== "guidance") href.searchParams.set("fresh", "1");
          if (preview && returnTo) href.searchParams.set("preview", "1");
          // 서비스 이동과 순서는 유지하고 기기에서는 공용 서비스 카드 모양을 쓴다.
          const KioskIcon = id === "mobility" ? CarFront : Icon;
          if (kioskCards) return (
            <Link key={id} href={href.pathname + href.search} className="svc-card" data-service-topic={id}>
              <KioskIcon aria-hidden="true" />
              <strong>{en ? english : ko}</strong>
              <span>{en ? detailEn : detail}</span>
            </Link>
          );
          return (
            <article
              key={id}
              data-service-topic={id}
              className={"task-action task-action-" + id}
            >
              <Icon
                aria-hidden="true"
                className="task-action-icon"
                strokeWidth={1.7}
              />
              <Link
                href={href.pathname + href.search}
                className="task-action-link"
              >
                {/* 여객 첫 화면 카드는 이름만(작은 설명은 키오스크 카드에서만 쓴다) */}
                <span>
                  <strong>{en ? english : ko}</strong>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          );
        })}
    </div>
  );
}
