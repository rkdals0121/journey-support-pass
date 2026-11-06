"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { GROUP_EN, GROUP_LABEL, GROUPS, itemsOf, type Extra } from "@/lib/catalog";
import type { Lang, Text } from "@/lib/i18n";
import { NeedIcon } from "./NeedIcon";

/** 공용 화면의 등록 내역. 항목을 생략하지 않고 같은 크기의 페이지로 나눈다. */
export function KioskNeeds({ choices, extra, lang, t }: { choices: string[]; extra: Extra; lang: Lang; t: Text }) {
  const [page, setPage] = useState(0);
  const en = lang === "en";
  const rows = GROUPS.flatMap(group => itemsOf(group).filter(item => choices.includes(item.code)).map(item => ({
    key: item.code, group: en ? GROUP_EN[group] : GROUP_LABEL[group], text: en ? item.en : item.label, code: item.code,
  })));
  if (extra.party !== null) rows.push({ key: "party", group: t.steps.companion, text: t.partyOf(extra.party), code: "" });
  if (extra.strollers) rows.push({ key: "strollers", group: t.steps.companion, text: t.strollersOf(extra.strollers), code: "" });
  const sheets = Array.from({ length: Math.ceil(rows.length / 4) }, (_, index) => rows.slice(index * 4, index * 4 + 4));
  if (extra.note) {
    const chunks = extra.note.match(/[\s\S]{1,80}/gu) ?? [];
    chunks.forEach((text, index) => sheets.push([{ key: `note-${index}`, group: chunks.length > 1 ? `${t.noteLabel} (${index + 1}/${chunks.length})` : t.noteLabel, text, code: "" }]));
  }
  const pages = Math.max(1, sheets.length);
  const current = Math.min(page, pages - 1);
  const visible = sheets[current] ?? [];
  return <section className="kc-needs" aria-label={t.savedTitle}>
    {visible.length ? <dl className="kc-needs-grid" data-note={visible[0]?.key.startsWith("note-") || undefined} aria-live="polite">
      {visible.map(row => <div className="kc-need" key={row.key}>
        <dt>{row.group}</dt><dd>{row.code && <NeedIcon code={row.code} size={20} />}<span>{row.text}</span></dd>
      </div>)}
    </dl> : <p>{t.passNoChoices}</p>}
    {pages > 1 && <nav className="kc-pager" aria-label={en ? "Saved support pages" : "등록 내역 페이지"}>
      <button className="btn" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={en ? "Previous support" : "이전 등록 내역"}><ChevronLeft aria-hidden="true" />{en ? "Previous" : "이전"}</button>
      <span role="status">{current + 1} / {pages}</span>
      <button className="btn" disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label={en ? "Next support" : "다음 등록 내역"}>{en ? "Next" : "다음"}<ChevronRight aria-hidden="true" /></button>
    </nav>}
  </section>;
}
