"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, MapPin, RefreshCw } from "lucide-react";
import { readRequestReceipts } from "@/lib/request-receipts";
import {
  type ServiceRequestView,
  requestStateLabel,
  OPEN_REQUEST_STATES,
} from "@/lib/service-request-model";
import { taskOf } from "@/lib/service-tasks";
import { supportTopic } from "@/lib/service-catalog";
export function MyRequests({ en }: { en: boolean }) {
  const [rows, setRows] = useState<
      { receipt: string; request: ServiceRequestView }[]
    >([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const t = (ko: string, english: string) => (en ? english : ko);
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    async function load() {
      let failed = 0;
      const result = await Promise.all(
        readRequestReceipts().map(async (receipt) => {
          try {
            const r = await fetch("/api/requests/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ receipt }),
              signal: AbortSignal.any([
                ctrl.signal,
                AbortSignal.timeout(10000),
              ]),
              cache: "no-store",
            });
            if ([404, 410].includes(r.status)) return null;
            if (!r.ok) throw Error();
            return {
              receipt,
              request: (await r.json()).request as ServiceRequestView,
            };
          } catch {
            failed++;
            return null;
          }
        }),
      );
      if (live) {
        setRows((old) =>
          failed
            ? result
                .filter((x) => x !== null)
                .concat(
                  old.filter(
                    (o) => !result.some((r) => r?.receipt === o.receipt),
                  ),
                )
            : result.filter((x) => x !== null),
        );
        setError(
          failed
            ? en
              ? "Some requests could not be loaded. Try again."
              : "일부 요청을 불러오지 못했어요. 다시 확인해 주세요."
            : "",
        );
        setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      live = false;
      ctrl.abort();
      clearInterval(timer);
    };
  }, [version, en]);
  return (
    <main id="public-main" className="service-workspace">
      <header className="service-heading">
        <span className="service-kicker">
          <ClipboardList aria-hidden="true" />
          {t("서비스 이용 내역", "MY REQUESTS")}
        </span>
        <h1>{t("내 요청", "My requests")}</h1>
        <p>
          {t(
            "접수한 서비스와 진행 상황을 확인하세요.",
            "Track your services and their progress.",
          )}
        </p>
      </header>
      <div className="request-list-bar">
        <span>
          {t(
            `${rows.filter((r) => OPEN_REQUEST_STATES.includes(r.request.state)).length}건 진행 중`,
            `${rows.filter((r) => OPEN_REQUEST_STATES.includes(r.request.state)).length} active`,
          )}
        </span>
        <button
          type="button"
          onClick={() => setVersion((v) => v + 1)}
          aria-label={t("다시 확인", "Refresh")}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <p role="status">{t("요청을 불러오는 중…", "Loading requests…")}</p>
      ) : rows.length ? (
        <div className="my-service-list">
          {rows.map(({ receipt, request: r }) => (
            <Link
              key={r.id}
              href={`/help/receipt/${receipt}${en ? "?lang=en" : ""}`}
              className="my-service-request"
            >
              <span className={`request-state-pill state-${r.state}`}>
                {requestStateLabel(r, en ? "en" : "ko")}
              </span>
              <h2>
                {en
                  ? (taskOf(r.serviceDetails?.task)?.en ??
                    supportTopic(r.topicId ?? r.service)?.en)
                  : (taskOf(r.serviceDetails?.task)?.label ??
                    supportTopic(r.topicId ?? r.service)?.label)}
              </h2>
              <p>
                <MapPin aria-hidden="true" />
                {en ? r.placeEn : r.place}
              </p>
              <span className="my-service-open">
                {t("진행 상황 보기", "View progress")}
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="request-empty-state">
          <ClipboardList aria-hidden="true" />
          <h2>{t("아직 접수한 요청이 없어요", "No requests yet")}</h2>
          <p>
            {t(
              "이 탭에서 접수한 서비스가 여기에 표시돼요.",
              "Requests submitted in this tab appear here.",
            )}
          </p>
          <Link
            className="public-button"
            href={"/services" + (en ? "?lang=en" : "")}
          >
            {t("서비스 이용하기", "Find a service")}
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      )}
      {error && (
        <p role="status" className="error-note">
          {error}
        </p>
      )}
      <p className="request-list-privacy">
        {t(
          "이 탭의 최근 접수만 표시하며, 접수 정보는 24시간 후 만료돼요. 다른 기기에서는 저장한 접수 링크로 열어 주세요.",
          "Recent requests in this tab only. Details expire after 24 hours. On another device, use the saved request link.",
        )}
      </p>
    </main>
  );
}
