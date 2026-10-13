"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Lang, Text } from "@/lib/i18n";

export interface Destination {
  city: string;
  en: string;
  count: number;
}

// 한글 첫소리 열아홉 개를 고르기 쉬운 열네 개로 묶는다. 쌍자음은 홑자음에 넣는다.
const INITIALS = ["ㄱ", "ㄱ", "ㄴ", "ㄷ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅂ", "ㅅ", "ㅅ", "ㅇ", "ㅈ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 도시 이름의 첫 글자를 고르는 단추에 쓸 글자. 한국어는 첫소리(ㄱ, ㄴ …), 영어는 첫 알파벳. */
export function initialOf(d: Destination, lang: Lang): string {
  if (lang === "en") return (d.en[0] ?? "#").toUpperCase();
  const code = d.city.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return INITIALS[Math.floor((code - 0xac00) / 588)];
  return "#";
}

const POPULAR = 8;

interface Props {
  lang: Lang;
  t: Text;
  onPick: (d: Destination) => void;
  onClose: () => void;
}

/**
 * 편명을 모르는 여객이 도착 도시를 눌러 고른다. 글자를 치지 않아도 된다.
 * 먼저 많이 가는 곳을 보여 주고, 첫 글자를 누르면 그 글자로 시작하는 도시만 보여 준다.
 */
export function CityPicker({ lang, t, onPick, onClose }: Props) {
  const [list, setList] = useState<Destination[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [initial, setInitial] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/flights/destinations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setList(d.destinations ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = (d: Destination) => (lang === "en" ? d.en : d.city);
  const sorted = [...(list ?? [])].sort((a, b) => label(a).localeCompare(label(b), lang === "en" ? "en" : "ko"));
  const initials = [...new Set(sorted.map((d) => initialOf(d, lang)))].sort((a, b) => a.localeCompare(b, lang === "en" ? "en" : "ko"));
  const popular = [...(list ?? [])].sort((a, b) => b.count - a.count).slice(0, POPULAR);
  const shown = initial ? sorted.filter((d) => initialOf(d, lang) === initial) : popular;

  return (
    <div className="city-picker">
      <div className="city-head">
        <strong>{t.cityTitle}</strong>
        <button className="icon-btn" onClick={onClose} aria-label={t.close}>
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      {failed && <p className="hint">{t.offline}</p>}
      {!failed && list === null && <p className="hint">{t.searching}</p>}
      {list !== null && list.length === 0 && <p className="hint">{t.flightNotFound}</p>}
      {list !== null && list.length > 0 && (
        <>
          <div className="pick-row" role="group" aria-label={t.cityInitial}>
            <span className="pick-label">{t.cityInitial}</span>
            {initials.map((i) => (
              <button key={i} className={`pick ${initial === i ? "on" : ""}`} aria-pressed={initial === i} onClick={() => setInitial(initial === i ? null : i)}>
                {i}
              </button>
            ))}
          </div>
          <p className="hint">{initial ? t.cityPickOne : t.cityPopular}</p>
          <div className="city-grid">
            {shown.map((d) => (
              <button key={d.city} className="city" onClick={() => onPick(d)}>
                <MapPin size={20} aria-hidden="true" />
                <span>{label(d)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface Bucket {
  key: string;
  label: string;
}

/** 출발 시간대. 새벽(0~6시), 오전(6~12시), 오후(12~18시), 저녁(18~24시). */
export function bucketKey(o: { day: "today" | "tomorrow"; time: string }): string {
  const hour = Number(o.time.slice(0, 2));
  return `${o.day}-${Math.min(3, Math.floor(hour / 6))}`;
}

/** 후보에 실제로 있는 시간대만, 이른 순서로. */
export function bucketsOf(options: { day: "today" | "tomorrow"; time: string }[], t: Text): Bucket[] {
  const keys = [...new Set(options.map(bucketKey))].sort((a, b) => {
    const [da, pa] = a.split("-");
    const [db, pb] = b.split("-");
    return da === db ? Number(pa) - Number(pb) : da === "today" ? -1 : 1;
  });
  return keys.map((key) => {
    const [day, period] = key.split("-");
    return { key, label: `${day === "today" ? t.today : t.tomorrow} ${t.periods[Number(period)]}` };
  });
}
