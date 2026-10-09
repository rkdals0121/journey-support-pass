"use client";

import { CircleCheck, Download, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GROUPS, itemsOf, prefsOf } from "@/lib/catalog";
import type { GuideDto } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { Banner, ErrorNote } from "../../components/Alert";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { FlowShell } from "../../components/FlowShell";
import { closeText, destOf, FlightBoard } from "../../components/GuideParts";
import { NeedIcon } from "../../components/NeedIcon";
import { PassQr } from "../../components/PassQr";

const REFRESH_MS = 60_000;

/** 여객 휴대전화의 패스 화면. QR 과 번호, 내 항공편, 고른 안내가 있고 직접 지울 수 있다. */
export function PassView({ token, initial, qr, isNew }: { token: string; initial: GuideDto; qr: string; isNew: boolean }) {
  const [guide, setGuide] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erased, setErased] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 지우기를 누른 뒤에는 탑승구를 다시 받던 요청의 답을 쓰지 않는다. 그 답("끝난 패스")이 "지웠습니다" 화면을 덮지 않게 한다.
  const erasing = useRef(false);

  const lang = guide.lang;
  const prefs = prefsOf(guide.choices);
  const t = textOf(lang, prefs.easy);

  // 주소의 ?new=1 은 처음 한 번만 쓴다. 화면을 저장하거나 다시 열 때는 붙지 않게 지운다.
  useEffect(() => {
    if (isNew) window.history.replaceState(null, "", window.location.pathname);
  }, [isNew]);

  // 탑승구와 남은 시간을 가끔 다시 받는다.
  useEffect(() => {
    if (erased) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (erasing.current) return;
        if (res.status === 410 || res.status === 404) return window.location.reload();
        if (res.ok) setGuide((await res.json()).guide);
      } catch {
        // 한 번 못 받은 것은 넘어간다.
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [token, erased]);

  async function erase() {
    erasing.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pass/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error();
      setErased(true);
    } catch {
      erasing.current = false;
      setError(t.offline);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  const home = () => window.location.assign(lang === "en" ? "/?lang=en" : "/");
  const picked = GROUPS.flatMap((g) => itemsOf(g)).filter((i) => guide.choices.includes(i.code));

  if (erased) {
    return (
      <FlowShell lang={lang} prefs={prefs} kiosk={false} screenKey="erased" speakText={`${t.passErased}. ${t.passErasedBody}`} onHome={home}>
        <div className="empty" role="status">
          <span className="bubble">
            <Trash2 size={28} aria-hidden="true" />
          </span>
          <h1>{t.passErased}</h1>
          <p>{t.passErasedBody}</p>
        </div>
        <Link className="btn btn-primary" href={lang === "en" ? "/register?lang=en" : "/register"}>
          {t.again}
        </Link>
      </FlowShell>
    );
  }

  const flight = guide.flight;
  const speakText = [
    isNew ? t.passNew : t.passTitle,
    `${t.passNo} ${guide.passNo.split("").join(" ")}`,
    t.passHow,
    `${flight.flightNo}, ${destOf(flight, lang)}, ${t.gate} ${flight.gate ?? t.gateTbd}`,
    closeText(flight, t),
  ].join(". ");

  return (
    <FlowShell lang={lang} prefs={prefs} kiosk={false} screenKey="pass" speakText={speakText} onHome={home}>
      {isNew ? (
        <p className="success-head">
          <CircleCheck size={28} aria-hidden="true" />
          {t.passNew}
        </p>
      ) : (
        <p className="kicker">Journey Support Pass</p>
      )}
      <h1>{t.passTitle}</h1>

      <div className="ticket">
        <PassQr token={token} passNo={guide.passNo} label={t.passNo} svg={qr} />
      </div>

      <div className="info-row quiet">
        <span className="bubble bubble-sun">
          <ScanLine size={22} aria-hidden="true" />
        </span>
        <div>
          <span>{t.passHow}</span>
        </div>
      </div>
      <div className="info-row quiet">
        <span className="bubble">
          <Download size={22} aria-hidden="true" />
        </span>
        <div>
          <span>{t.passSave}</span>
        </div>
      </div>

      <h2>{t.passFlight}</h2>
      <FlightBoard flight={flight} t={t} lang={lang} />
      {guide.poll.stale && <Banner role="status">{t.stale}</Banner>}

      <h2>{t.passChoices}</h2>
      {picked.length === 0 ? (
        <p className="muted">{t.passNoChoices}</p>
      ) : (
        <ul className="picked">
          {picked.map((i) => (
            <li key={i.code}>
              <NeedIcon code={i.code} size={20} />
              {lang === "en" ? i.en : i.label}
            </li>
          ))}
        </ul>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      <button className="btn btn-ghost btn-danger-text" onClick={() => setAsking(true)}>
        <Trash2 size={20} aria-hidden="true" />
        {t.passErase}
      </button>

      {asking && (
        <ConfirmSheet
          title={t.passEraseTitle}
          body={t.passEraseBody}
          confirmLabel={t.passEraseDo}
          cancelLabel={t.passEraseKeep}
          busy={busy}
          onConfirm={erase}
          onCancel={() => setAsking(false)}
        />
      )}
    </FlowShell>
  );
}
