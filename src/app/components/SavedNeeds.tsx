import { GROUP_EN, GROUP_LABEL, GROUPS, itemsOf, type Extra } from "@/lib/catalog";
import type { Lang, Text } from "@/lib/i18n";
import { NeedIcon } from "./NeedIcon";

/**
 * 미리 등록한 내용. 체크리스트의 묶음 순서대로, 고른 것이 있는 묶음만 보여 준다.
 * 안내 키오스크와 공항 입구 안내로봇이 탑승권을 읽은 뒤 "고칠 것이 있으신가요?"와 함께 먼저 띄운다(피드백 3).
 * 휴대전화의 등록 현황 화면도 같은 모양으로 보여 준다.
 */
export function SavedNeeds({ choices, extra, lang, t }: { choices: string[]; extra: Extra; lang: Lang; t: Text }) {
  const rows = GROUPS.map((g) => ({ g, items: itemsOf(g).filter((i) => choices.includes(i.code)) })).filter((r) => r.items.length > 0);
  const counts = [...(extra.party !== null ? [t.partyOf(extra.party)] : []), ...(extra.strollers ? [t.strollersOf(extra.strollers)] : [])];
  if (rows.length === 0 && counts.length === 0 && !extra.note) return <p className="muted">{t.passNoChoices}</p>;
  return (
    <dl className="saved-needs">
      {rows.map(({ g, items }) => (
        <div key={g} className="saved-row">
          <dt>{lang === "en" ? GROUP_EN[g] : GROUP_LABEL[g]}</dt>
          {items.map((i) => (
            <dd key={i.code}>
              <NeedIcon code={i.code} size={20} />
              {lang === "en" ? i.en : i.label}
            </dd>
          ))}
          {g === "companion" && counts.map((c) => <dd key={c}>{c}</dd>)}
        </div>
      ))}
      {!rows.some((r) => r.g === "companion") && counts.length > 0 && (
        <div className="saved-row">
          <dt>{t.steps.companion}</dt>
          {counts.map((c) => (
            <dd key={c}>{c}</dd>
          ))}
        </div>
      )}
      {extra.note && (
        <div className="saved-row">
          <dt>{t.noteLabel}</dt>
          <dd className="saved-note">{extra.note}</dd>
        </div>
      )}
    </dl>
  );
}

/** 소리로 읽을 글. 화면의 묶음 순서와 같다. */
export function savedNeedsText(choices: string[], extra: Extra, lang: Lang, t: Text): string {
  const parts = GROUPS.flatMap((g) => itemsOf(g).filter((i) => choices.includes(i.code)).map((i) => (lang === "en" ? i.en : i.label)));
  if (extra.party !== null) parts.push(t.partyOf(extra.party));
  if (extra.strollers) parts.push(t.strollersOf(extra.strollers));
  if (extra.note) parts.push(extra.note);
  return parts.length > 0 ? parts.join(". ") : t.passNoChoices;
}
