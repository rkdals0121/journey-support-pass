"use client";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import {
  Accessibility,
  Signpost,
  Bot,
  Wrench,
  Bus,
  Briefcase,
  MessagesSquare,
  Search,
  ArrowRight,
} from "lucide-react";
import { SERVICE_CATALOG, passengerLabel, topicLink } from "@/lib/service-catalog";
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
const searchText = (value: string) =>
  value.toLowerCase().replace(/[\s·-]/g, "");
export function ServiceDirectory({
  lang = "ko",
  portal = false,
  extraCards = [],
}: {
  lang?: "ko" | "en";
  portal?: boolean;
  extraCards?: readonly ReactElement[];
}) {
  const en = lang === "en";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const searchTerm = searchText(query.trim());
  const rows = SERVICE_CATALOG.filter(
    (s) =>
      s.id !== "lost-property" &&
      (filter === "all" || s.mode === filter) &&
      (!searchTerm ||
        searchText(
          s.id +
            " " +
            s.label +
            " " +
            passengerLabel(s) +
            " " +
            s.en +
            " " +
            s.description +
            " " +
            s.descriptionEn +
            " " +
            s.keywords,
        ).includes(searchTerm)),
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
            ? "Search services"
            : "서비스 이름으로 찾기"
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
          aria-label={`${en ? s.en : passengerLabel(s)} · ${en ? "Use service" : "서비스 이용"}`}
        >
          {/* 카드에는 이름만(작은 설명 글은 두지 않는다 — 2026-11-12 사용자 요청). 찾기는 설명까지 본다. */}
          <span>
            <strong>{en ? s.en : passengerLabel(s)}</strong>
          </span>
          {/* 같은 사이트 안으로 가는 길이라 바깥 사이트 표시(↗) 대신 → 를 쓴다(첫 화면 카드와 같게) */}
          <ArrowRight size={19} aria-hidden="true" />
        </Link>
      </article>
    );
  };
  const showPortalCards = !searchTerm && filter === "all";
  const cards = [...rows.map(result), ...(showPortalCards ? extraCards : [])];
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
          {en ? `${cards.length} services` : `서비스 ${cards.length}개`}
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
      {cards.length === 0 && (
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
        {cards}
      </div>
    </section>
  );
}
