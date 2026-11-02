"use client";
import { Children, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Lang } from "@/lib/i18n";

/** 모든 항목을 남겨 두되 한 번에 두 장씩 확인한다. */
export function KioskPages({ children, lang, label }: { children: ReactNode; lang: Lang; label: string }) {
  const items = Children.toArray(children), [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / 2)), current = Math.min(page, pages - 1);
  return <section className="kc-pages" aria-label={label}>
    <h2>{label}</h2>
    <div className="kc-facilities" aria-live="polite">{items.slice(current * 2, current * 2 + 2)}</div>
    {pages > 1 && <nav className="kc-pager" aria-label={lang === "en" ? "Facility pages" : "시설 페이지"}>
      <button className="btn" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden="true" />{lang === "en" ? "Previous" : "이전"}</button>
      <span role="status">{current + 1} / {pages}</span>
      <button className="btn" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>{lang === "en" ? "Next" : "다음"}<ChevronRight aria-hidden="true" /></button>
    </nav>}
  </section>;
}
