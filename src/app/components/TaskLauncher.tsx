import Link from "next/link";
import {
  ArrowRight,
  Navigation,
  Accessibility,
  Wrench,
  Bus,
  Bot,
  MessagesSquare,
} from "lucide-react";
import { topicLink } from "@/lib/service-catalog";
import type { KioskReturn } from "@/lib/help-entry";

// 카드는 이름만. 이름 아래 작은 설명 줄은 이름을 되풀이할 뿐이라 지우고, 꼭 필요한 것(휠체어·동행)만 이름에 짧게 넣었다(11-19).
const actions = [
  {
    id: "guidance",
    ko: "탑승구·시설 찾기",
    en: "Find a gate or facility",
    Icon: Navigation,
  },
  {
    id: "mobility",
    ko: "이동 도움 (휠체어·동행)",
    en: "Mobility help (wheelchair, escort)",
    Icon: Accessibility,
  },
  {
    id: "facility",
    ko: "시설 불편 알리기",
    en: "Report a facility issue",
    Icon: Wrench,
  },
  {
    id: "traffic",
    ko: "교통·주차 이용",
    en: "Transport and parking",
    Icon: Bus,
  },
  {
    id: "other",
    ko: "기타 도움 요청",
    en: "Other requests",
    Icon: MessagesSquare,
  },
  {
    id: "robot",
    ko: "안내로봇 체험",
    en: "Try the guide robot",
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
        .map(({ id, ko, en: english, Icon }) => {
          const href = new URL(
            topicLink(id, en ? "en" : "ko"),
            "https://local.invalid",
          );
          if (returnTo) href.searchParams.set("returnTo", returnTo);
          if (id === "guidance" && (device === "robot" || returnTo === "/kiosk/entry")) href.searchParams.set("device", "robot");
          if (id !== "guidance") href.searchParams.set("fresh", "1");
          if (preview && returnTo) href.searchParams.set("preview", "1");
          // 서비스 이동과 순서는 유지하고 기기에서는 공용 서비스 카드 모양을 쓴다. 그림은 휴대전화와 같다(이동 도움 = 휠체어).
          if (kioskCards) return (
            <Link key={id} href={href.pathname + href.search} className="svc-card" data-service-topic={id}>
              <Icon aria-hidden="true" />
              <strong>{en ? english : ko}</strong>
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
                {/* 여객 첫 화면 카드는 이름만 */}
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
