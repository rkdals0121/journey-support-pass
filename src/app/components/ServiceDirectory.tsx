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
const searchText = (value: string) =>
  value.toLowerCase().replace(/[\s·-]/g, "");
export function ServiceDirectory({
  lang = "ko",
  portal = false,
}: {
  lang?: "ko" | "en";
  portal?: boolean;
}) {
  const en = lang === "en";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = SERVICE_CATALOG.filter(
    (s) =>
      s.id !== "lost-property" && (filter === "all" || s.mode === filter) &&
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
        className={
          "airport-service-item" +
          (s.id === "other" ? " airport-service-other" : "")
        }
        key={s.id}
        data-service-topic={s.id}
      >
        <span className="airport-service-icon">
          <Icon size={25} aria-hidden="true" />
        </span>
        <div className="airport-service-copy">
          <h3>{en ? s.en : s.label}</h3>
          <p>{en ? s.descriptionEn : s.description}</p>
          {s.mode === "simulation" && (
            <span className="airport-demo-tag">
              {en ? "Simulation" : "모의 시연"}
            </span>
          )}
        </div>
        <Link
          href={topicLink(s.id, lang)}
          aria-label={`${en ? s.en : s.label} · ${en ? "Use service" : "서비스 이용"}`}
        >
          <span className="sr-only">{en ? "Use service" : "서비스 이용"}</span>
          <ArrowUpRight size={19} aria-hidden="true" />
        </Link>
      </article>
    );
  };
  return (
    <section
      className="airport-directory"
      aria-label={en ? "Airport services" : "공항 서비스"}
    >
      {portal ? (
        <div className="airport-entry-hero">
          <div className="airport-entry-copy">
            <p className="airport-eyebrow">AIRPORT ASSISTANCE</p>
            <h1>
              {en ? (
                <>
                  Airport services,
                  <br />
                  <em>easy to find and use.</em>
                </>
              ) : (
                <>
                  필요한 공항 서비스를
                  <br />
                  <em>빠르게 찾아보세요.</em>
                </>
              )}
            </h1>
            <p className="airport-entry-intro">
              {en
                ? "Find your way, request assistance and follow your request."
                : "길 찾기부터 현장 도움까지, 지금 필요한 서비스를 연결합니다."}
            </p>
            {search}
            <div className="airport-popular">
              <span>{en ? "Popular" : "자주 찾는 서비스"}</span>
              {[
                ["guidance", en ? "Directions" : "길 찾기"],
                ["mobility", en ? "Mobility" : "이동 지원"],
                ["facility", en ? "Facilities" : "시설 불편"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => {
                    setQuery(
                      id === "guidance"
                        ? en
                          ? "Directions"
                          : "탑승구"
                        : id === "mobility"
                          ? en
                            ? "Mobility"
                            : "이동"
                          : en
                            ? "Facility"
                            : "시설",
                    );
                    setFilter("all");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="airport-terminal-sign"
            role="img"
            aria-label={
              en
                ? "Illustration of gate 127 and a route. Not a live map."
                : "127번 탑승구와 이동 경로를 표현한 그래픽. 실제 공항 지도는 아닙니다."
            }
          >
            <div className="airport-sign-top">
              <span>YOUR NEXT DESTINATION</span>
              <span>
                <i />
                {en ? "Illustration" : "안내 예시"}
              </span>
            </div>
            <div className="airport-sign-gate">
              <div>
                <small>GATE</small>
                <strong>127</strong>
              </div>
              <ArrowUpRight size={75} strokeWidth={1.6} aria-hidden="true" />
            </div>
            <svg
              className="airport-sign-route"
              viewBox="0 0 360 55"
              aria-hidden="true"
            >
              <path
                d="M8 38H130Q150 38 150 23T180 8H345"
                fill="none"
                stroke="#89ac93"
                strokeWidth="2"
                strokeDasharray="3 6"
              />
              <circle cx="8" cy="38" r="5" fill="#f7c63f" />
              <circle cx="345" cy="8" r="5" fill="#fff" />
            </svg>
            <div className="airport-sign-bottom">
              <span>
                {en
                  ? "From your location to your destination"
                  : "현재 위치에서 목적지까지"}
              </span>
              <b>{en ? "Find your way with ease" : "쉽게 찾고, 편하게 이동"}</b>
            </div>
          </div>
        </div>
      ) : (
        search
      )}
      <div className="airport-directory-top">
        <h2 id="service-results-title" tabIndex={-1}>
          {en ? "How can we help?" : "어떤 서비스가 필요하세요?"}
        </h2>
        <span role="status">
          {en ? `${rows.length} services` : `서비스 ${rows.length}개`}
        </span>
        <details className="airport-service-filters">
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
      {rows.length > 0 ? (
        <>
          <div className="airport-service-grid">
            {rows.filter((s) => s.id !== "other").map(result)}
          </div>
          {rows.some((s) => s.id === "other") && (
            <div className="airport-other-service">
              {result(rows.find((s) => s.id === "other")!)}
            </div>
          )}
        </>
      ) : (
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
    </section>
  );
}
