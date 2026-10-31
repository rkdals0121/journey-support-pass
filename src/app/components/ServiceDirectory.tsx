"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
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
  ArrowRight,
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
const order = [
  "guidance",
  "mobility",
  "robot",
  "facility",
  "lost-property",
  "traffic",
  "other",
];
const descriptions: Record<string, [string, string]> = {
  guidance: [
    "탑승구·편의시설까지 경로 확인",
    "Routes to gates and airport facilities",
  ],
  mobility: [
    "이동 동행·휠체어·차량 지원",
    "Escort, wheelchair and vehicle assistance",
  ],
  robot: ["안내로봇 호출 과정 체험", "Try the guide robot request flow"],
  facility: ["청결·시설 불편 신고", "Report cleaning and facility issues"],
  traffic: [
    "주차·승차 안내와 현장 지원",
    "Parking, transport information and on-site help",
  ],
  other: ["그 밖의 문의와 업무 요청", "Other enquiries and service requests"],
};
const searchText = (value: string) =>
  value.toLowerCase().replace(/[\s·-]/g, "");
export function ServiceDirectory({
  lang = "ko",
  portal = false,
  children,
}: {
  lang?: "ko" | "en";
  portal?: boolean;
  children?: ReactNode;
}) {
  const en = lang === "en";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = SERVICE_CATALOG.filter(
    (s) =>
      s.id !== "lost-property" &&
      (filter === "all" || s.mode === filter) &&
      (!query.trim() ||
        searchText(
          s.id +
            " " +
            s.label +
            " " +
            s.en +
            " " +
            s.description +
            " " +
            s.descriptionEn +
            " " +
            s.keywords,
        ).includes(searchText(query))),
  ).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const search = (
    <form
      className="airport-service-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        document.getElementById("service-results-title")?.focus();
      }}
    >
      <label className="sr-only" htmlFor="service-search">
        {en ? "Find airport services" : "공항 서비스 검색"}
      </label>
      <Search size={20} aria-hidden="true" />
      <input
        id="service-search"
        type="search"
        value={query}
        maxLength={100}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          en
            ? "Gate, mobility, facility assistance"
            : "탑승구, 이동 지원, 시설 불편 검색"
        }
      />
      <button type="submit" aria-label={en ? "Search" : "검색"}>
        <Search size={20} aria-hidden="true" />
      </button>
    </form>
  );
  const result = (s: (typeof SERVICE_CATALOG)[number]) => {
    const Icon = icons[s.icon];
    return (
      <article
        className="task-action"
        key={s.id}
        data-service-topic={s.id}
      >
        <Icon className="task-action-icon" strokeWidth={1.7} aria-hidden="true" />
        <Link
          className="task-action-link"
          href={topicLink(s.id, lang)}
          aria-label={`${en ? s.en : s.label} · ${en ? "Use service" : "서비스 이용"}`}
        >
          <span>
            <strong>{en ? s.en : s.label}</strong>
            <small>{descriptions[s.id]?.[en ? 1 : 0] ?? (en ? s.descriptionEn : s.description)}{s.mode === "simulation" && <em className="service-mode-label">{en ? "Simulation" : "모의 시연"}</em>}</small>
          </span>
          <ArrowUpRight size={19} aria-hidden="true" />
        </Link>
      </article>
    );
  };
  return (
    <section
      className="service-directory"
      aria-label={en ? "Airport services" : "공항 서비스"}
    >
      {portal ? (
        <div className="ph-hero">
          <div className="ph-hero-copy">
            <span className="ph-hero-label"><Signpost aria-hidden="true" />
              {en ? "Airport services" : "공항 현장 서비스"}
            </span>
            <h1>{en ? "Find a service" : "서비스 찾기"}</h1>
            <p>
              {en
                ? "Directions, mobility and assistance at the airport."
                : "길 찾기부터 이동 지원, 시설 불편 접수까지."}
            </p>
          </div>
          <div className="service-directory-search">
            {search}
            <div className="airport-popular">
              <span>{en ? "Quick search" : "바로 찾기"}</span>
              {[
                ["탑승구", "Gate"],
                ["이동", "Mobility"],
                ["시설", "Facility"],
              ].map(([ko, english]) => (
                <button
                  key={ko}
                  type="button"
                  onClick={() => {
                    setQuery(en ? english : ko);
                    setFilter("all");
                    document.getElementById("service-results-title")?.focus();
                  }}
                >
                  {en ? english : ko}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        search
      )}
      <div className="service-directory-toolbar">
        <h2 id="service-results-title" tabIndex={-1}>
          {en ? "Services" : "서비스 안내"}
        </h2>
        <span role="status">
          {en ? `${rows.length} services` : `서비스 ${rows.length}개`}
        </span>
        <details className="service-directory-filter">
          <summary>
            {en ? "Filter services" : "서비스 필터"}
            {filter !== "all" ? (en ? " · Applied" : " · 적용 중") : ""}
          </summary>
          <div
            className="public-filter"
            role="group"
            aria-label={en ? "Service type" : "이용 방식"}
          >
            {[
              ["all", en ? "All" : "전체"],
              ["request", en ? "Support" : "도움 요청"],
              ["referral", en ? "Reports" : "신고·업무 접수"],
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
        </details>
      </div>
      {rows.length === 0 && (
        <div className="airport-directory-empty" role="status">
          <h3>{en ? "No matching services" : "일치하는 서비스가 없어요"}</h3>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
              document.getElementById("service-search")?.focus();
            }}
          >
            {en ? "Show all services" : "전체 서비스 보기"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <Link href={topicLink("other", lang)}>
            {en ? "Describe what you need" : "필요한 도움 직접 작성"}
          </Link>
        </div>
      )}
      <div className="ph-list service-directory-grid">
        {rows.map(result)}
        {children}
      </div>
    </section>
  );
}
