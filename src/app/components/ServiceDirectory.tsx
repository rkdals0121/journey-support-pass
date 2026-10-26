"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Accessibility,
  Signpost,
  Bot,
  Wrench,
  Bus,
  Briefcase,
  MessagesSquare,
  ArrowUpRight,
  Search,
} from "lucide-react";
import { SERVICE_CATALOG, topicLink } from "@/lib/service-catalog";
const icons = {
  accessibility: Accessibility,
  signpost: Signpost,
  bot: Bot,
  wrench: Wrench,
  bus: Bus,
  briefcase: Briefcase,
  messages: MessagesSquare,
};
export function ServiceDirectory({
  lang = "ko",
  compact = false,
}: {
  lang?: "ko" | "en";
  compact?: boolean;
}) {
  const en = lang === "en";
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const rows = SERVICE_CATALOG.filter(
    (s) =>
      (filter === "all" || s.mode === filter) &&
      (!query ||
        (s.label + " " + s.en + " " + s.description + " " + s.keywords)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <section
      className={"service-directory" + (compact ? " compact" : "")}
      aria-label={en ? "Service search" : "서비스 검색"}
    >
      <form
        className="public-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <label className="sr-only" htmlFor="service-search">
          {en ? "Find airport services" : "공항 서비스 검색"}
        </label>
        <Search size={22} aria-hidden="true" />
        <input
          id="service-search"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            en
              ? "Try mobility, lost property or parking"
              : "이동지원, 분실물, 주차 안내를 찾아보세요"
          }
        />
        <button type="submit">{en ? "Search" : "검색"}</button>
      </form>
      {!compact && (
        <div
          className="public-filter"
          role="group"
          aria-label={en ? "Service type" : "이용 방식"}
        >
          {[
            ["all", en ? "All services" : "전체"],
            ["request", en ? "Support requests" : "도움 요청"],
            ["referral", en ? "Enquiries & referrals" : "상담·담당 연결"],
            ["simulation", en ? "Simulation" : "모의 체험"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="public-results-line">
        <h2>{en ? "Find the support you need" : "필요한 도움을 선택하세요"}</h2>
        <span role="status">
          {rows.length}
          {en ? " services" : "개 서비스"}
        </span>
      </div>
      <div className="public-service-grid">
        {rows.map((s) => {
          const Icon = icons[s.icon];
          return (
            <article
              className="public-service-card"
              key={s.id}
              data-service-topic={s.id}
            >
              <div className="public-card-top">
                <span className="public-service-icon">
                  <Icon size={25} aria-hidden="true" />
                </span>
                <span className="public-tag">
                  {s.mode === "simulation"
                    ? en
                      ? "Demo"
                      : "모의 시연"
                    : s.mode === "referral"
                      ? en
                        ? "Staff referral"
                        : "담당 연결 상담"
                      : en
                        ? "Request support"
                        : "도움 요청"}
                </span>
              </div>
              <h3>{en ? s.en : s.label}</h3>
              {!compact && <p>{en ? s.descriptionEn : s.description}</p>}
              <Link
                href={topicLink(s.id, lang)}
                aria-label={`${en ? s.en : s.label} · ${en ? "Request support" : "도움 요청"}`}
              >
                {s.mode === "referral"
                  ? en
                    ? "Ask staff"
                    : compact
                      ? "상담하기"
                      : "직원 상담 요청"
                  : en
                    ? "Start request"
                    : "요청하기"}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
      {rows.length === 0 && (
        <div className="public-empty" role="status">
          <h3>{en ? "No matching service" : "검색 결과가 없어요"}</h3>
          <p>
            {en
              ? "Try another word, or ask staff to help you."
              : "다른 검색어를 입력하거나 직원 상담을 이용해 주세요."}
          </p>
          <Link className="public-button" href={topicLink("other", lang)}>
            {en ? "Ask staff" : "직원에게 문의하기"}
          </Link>
        </div>
      )}
    </section>
  );
}
