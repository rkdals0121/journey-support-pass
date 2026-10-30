import { destinationPlaceOf } from "@/lib/service-locations";
import Link from "next/link";
import { Check, MapPin, ArrowRight, Clock3, RefreshCw } from "lucide-react";
import {
  type ServiceRequestView,
  OPEN_REQUEST_STATES,
  requestStateLabel,
} from "@/lib/service-request-model";
import { taskOf } from "@/lib/service-tasks";
import { supportTopic } from "@/lib/service-catalog";
import { businessOf } from "@/lib/operating-profile";
import { NO_MEETING_PLACE } from "@/lib/airport";
import { ServiceDetailsView } from "../components/ServiceDetailsView";
import { RequestResolutionView } from "../components/RequestResolutionView";
export function RequestStatusPanel({
  request: r,
  en,
  busy,
  onRefresh,
  onCancel,
  onRestart,
  children,
  sharedDevice = false,
}: {
  request: ServiceRequestView;
  en: boolean;
  busy: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  onRestart: () => void;
  children: React.ReactNode;
  sharedDevice?: boolean;
}) {
  const t = (ko: string, english: string) => (en ? english : ko),
    active = OPEN_REQUEST_STATES.includes(r.state),
    steps =
      r.service === "guidance"
        ? ["received", "assigned", "serving", "done"]
        : ["received", "assigned", "en_route", "arrived", "serving", "done"];
  const stage = steps.indexOf(r.state),
    labels: Record<string, string> = {
      received: t("접수", "Submitted"),
      assigned: t("담당 배정", "Assigned"),
      en_route: t("출발", "On the way"),
      arrived: t("도착", "Arrived"),
      serving: t("처리 중", "In progress"),
      done: t("완료", "Completed"),
    };
  return (
    <>
      <header className="service-heading status-heading">
        <span className="service-kicker">
          <Clock3 aria-hidden="true" />
          {t("서비스 진행 현황", "SERVICE PROGRESS")}
        </span>
        <h1>
          {en
            ? (taskOf(r.serviceDetails?.task)?.en ??
              supportTopic(r.topicId ?? r.service)?.en)
            : (taskOf(r.serviceDetails?.task)?.label ??
              supportTopic(r.topicId ?? r.service)?.label)}
        </h1>
        <span className={`request-state-pill state-${r.state}`} role="status">
          {requestStateLabel(r, en ? "en" : "ko")}
        </span>
        <span className="request-reference">
          {t("접수번호", "Reference")} {r.id.slice(0, 8).toUpperCase()}
        </span>
      </header>
      <div className="request-status-layout">
        <section className="request-status-primary">
          <div className="request-status-card">
            <h2>
              {active
                ? t("지금 어디까지 진행됐나요?", "Where is my request?")
                : t("처리 결과", "Result")}
            </h2>
            <ol className="request-progress-track">
              {steps.map((s, i) => (
                <li
                  key={s}
                  className={
                    i < stage ? "is-done" : i === stage ? "is-current" : ""
                  }
                  aria-current={i === stage ? "step" : undefined}
                >
                  <span>
                    {i < stage ? <Check aria-hidden="true" /> : i + 1}
                  </span>
                  <strong>{labels[s]}</strong>
                </li>
              ))}
            </ol>
            <p className="request-next-action">
              {r.reason ||
                (r.state === "received"
                  ? t(
                      "접수됐어요. 담당자가 확인하면 상태가 바뀌어요.",
                      "Submitted. The status updates when a team takes your request.",
                    )
                  : r.state === "assigned"
                    ? t(
                        "담당자가 배정됐어요. 아래 위치에서 안내를 기다려 주세요.",
                        "A team is assigned. Wait at the location below.",
                      )
                    : r.state === "done"
                      ? t(
                          "요청 처리가 완료됐어요.",
                          "Your service has been completed.",
                        )
                      : !active
                        ? t(
                            "요청이 종료됐어요. 필요하면 새로 접수해 주세요.",
                            "This request is closed. Submit a new one if you need assistance.",
                          )
                        : t(
                            "담당자가 서비스를 진행하고 있어요.",
                            "Your team is handling the service.",
                          ))}
            </p>
            {r.resolution && (
              <RequestResolutionView
                resolution={r.resolution}
                lang={en ? "en" : "ko"}
              />
            )}
            <button
              type="button"
              className="status-refresh"
              onClick={onRefresh}
              disabled={busy}
            >
              <RefreshCw aria-hidden="true" />
              {t("상태 새로 확인", "Refresh status")}
            </button>
          </div>
          <section className="request-status-card">
            <h2>
              <MapPin aria-hidden="true" />
              {r.placeId === NO_MEETING_PLACE ? t("처리 방식", "Handling") : r.topicId === "facility" || r.topicId === "lost-property"
                ? t("신고 위치", "Reported location")
                : t("만날 곳", "Meeting point")}
            </h2>
            <p className="request-meeting-place">{en ? r.placeEn : r.place}</p>
            {r.destinationId && (
              <p>
                {t("목적지", "Destination")} ·{" "}
                {en
                  ? destinationPlaceOf(r.destinationId)?.labelEn
                  : destinationPlaceOf(r.destinationId)?.label}
              </p>
            )}
            {children}
          </section>
        </section>
        <aside className="request-status-card request-order-summary">
          <h2>{t("요청 내용", "Request details")}</h2>
          <dl className="service-detail-list">
            <div>
              <dt>{t("담당 업무", "Handling team")}</dt>
              <dd>
                {en
                  ? businessOf(r.businessId)?.en
                  : (businessOf(r.businessId)?.label ??
                    t("현장 지원", "On-site support"))}
              </dd>
            </div>
            <div>
              <dt>{t("접수 시각", "Submitted")}</dt>
              <dd>
                {new Date(r.createdAt).toLocaleString(en ? "en-GB" : "ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div>
              <dt>{t("인원", "People")}</dt>
              <dd>{r.party}</dd>
            </div>
          </dl>
          {r.serviceDetails && (
            <ServiceDetailsView details={r.serviceDetails} en={en} />
          )}{" "}
          {r.note && <p className="request-note">{r.note}</p>}
          <div className="request-status-actions">
            {["received", "assigned", "en_route", "arrived"].includes(
              r.state,
            ) && (
              <button
                className="status-cancel"
                onClick={onCancel}
                disabled={busy}
              >
                {t("요청 취소", "Cancel request")}
              </button>
            )}
            {!active && (
              <button className="public-button" onClick={onRestart}>
                {t("새 요청 시작", "Start a new request")}
                <ArrowRight aria-hidden="true" />
              </button>
            )}
            {!sharedDevice && (
              <Link href={"/requests" + (en ? "?lang=en" : "")}>
                {t("내 요청 목록", "All my requests")}
              </Link>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
