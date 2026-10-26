"use client";
import Link from "next/link";
import { RequestResolutionView } from "./RequestResolutionView";
import { useEffect, useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import {
  requestStateLabel,
  type ServiceRequestView,
} from "@/lib/service-request-model";
export function MyRequestPanel({ lang = "ko" }: { lang?: "ko" | "en" }) {
  const en = lang === "en";
  const [request, setRequest] = useState<ServiceRequestView | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true,
      controller: AbortController | undefined,
      running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const receipt = sessionStorage.getItem("jsp-dx-receipt-v1");
        if (!receipt || !/^[a-f0-9]{64}$/.test(receipt)) {
          if (live) setLoading(false);
          return;
        }
        controller = new AbortController();
        const r = await fetch("/api/requests/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receipt }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
          cache: "no-store",
        });
        if (!r.ok && [404, 410].includes(r.status) && live) setRequest(null);
        if (!r.ok)
          throw new Error(
            r.status === 410
              ? en
                ? "The request has expired."
                : "요청 보관 기간이 끝났어요."
              : en
                ? "Could not check your request."
                : "요청을 확인하지 못했어요.",
          );
        const b = await r.json();
        if (live) {
          setRequest(b.request);
          setError("");
        }
      } catch (e) {
        if (live && !controller?.signal.aborted)
          setError(e instanceof Error ? e.message : "");
      } finally {
        running = false;
        if (live) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      live = false;
      clearInterval(timer);
      controller?.abort();
    };
  }, [en]);
  return (
    <aside
      className={`my-request-panel${!request && !loading && !error ? " is-empty" : ""}`}
      aria-label={en ? "My request" : "내 요청"}
    >
      <div className="public-eyebrow">
        <Clock3 size={17} aria-hidden="true" />
        {en ? "MY REQUEST" : "내 요청"}
      </div>
      <h2>
        {request
          ? en
            ? "Your support, at a glance"
            : "요청한 도움을 한눈에"
          : en
            ? "Check your request"
            : "요청 진행 현황"}
      </h2>
      {loading ? (
        <p role="status">{en ? "Checking…" : "확인 중…"}</p>
      ) : request ? (
        <>
          <p className="public-status" aria-live="polite">
            {requestStateLabel(request, lang)}
          </p>
          <p>{en ? request.placeEn : request.place}</p>
          {request.resolution && (
            <RequestResolutionView
              resolution={request.resolution}
              lang={lang}
            />
          )}
        </>
      ) : (
        <p>
          {en
            ? "Your requests in this tab appear here."
            : "이 탭에서 접수한 요청이 여기에 표시돼요."}
        </p>
      )}
      {error && (
        <p role="status" className="public-caption">
          {error}
        </p>
      )}
      <Link
        className="public-button public-button-secondary"
        href={"/requests" + (en ? "?lang=en" : "")}
      >
        {en ? "View request" : "내 요청 확인"}
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </aside>
  );
}
