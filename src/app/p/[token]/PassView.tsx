"use client";

import { CircleCheck, Download, ScanLine, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GROUPS, itemsOf, prefsOf } from "@/lib/catalog";
import type { FlightView, GuideDto } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { staleNow } from "@/lib/timing";
import { Banner, ErrorNote } from "../../components/Alert";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { FlowShell } from "../../components/FlowShell";
import { closeText, destOf, FlightBoard } from "../../components/GuideParts";
import { NeedIcon } from "../../components/NeedIcon";
import { PassQr } from "../../components/PassQr";

const REFRESH_MS = 60_000;
// 탑승 마감까지 남은 시간을 이 간격으로 다시 센다.
const TICK_MS = 30_000;
// 받은 내용이 이보다 오래되면 "HH:MM 기준"을 붙여, 예전에 받은 내용이라는 것을 알린다.
const OLD_MS = 2 * 60_000;
const MIN = 60_000;

// 이 휴대전화에서 지운 패스. 지운 뒤 다른 화면으로 갔다가 「뒤로」로 돌아오면, 브라우저가 서버에 묻지 않고
// 지우기 전의 화면을 다시 그릴 수 있다. 그때도 "지웠습니다" 화면으로 시작해 지운 QR 이 다시 보이지 않게 한다.
const erasedTokens = new Set<string>();

const KST_HM = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** 한국 시각 "08:00". 공항의 시각이므로 휴대전화가 어느 나라 시각에 맞춰져 있어도 한국 시각으로 보여 준다. */
function kstHm(ms: number): string {
  const parts = KST_HM.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/**
 * 탑승 마감까지 남은 시간을 지금 시각으로 다시 센다.
 * 휴대전화에 남겨 둔 화면을 인터넷 없이 열면 서버가 그 화면을 만든 때의 남은 시간이 그대로 나온다. 그 숫자를 믿고 늦지 않게 한다.
 * 공공데이터가 알려 준 마감(closed)과 결항(cancelled)은 서버가 정한 그대로 둔다.
 * 남은 시간은 "서버가 만든 때의 남은 시간 − 그 뒤 휴대전화에서 흐른 시간"으로 센다. 휴대전화 시계와 서버 시계를 견주지 않으므로
 * 이 화면에서 받은 내용이면(fetchedAt) 휴대전화 시계가 빠르거나 늦어도 바르게 줄어든다. 언제 받았는지 모르는 첫 화면(남겨 둔 화면일 수 있다)만
 * 서버가 만든 시각(generatedAt)부터 센다. 어느 쪽이든 서버가 알려 준 남은 시간보다 늘려 보여 주지는 않는다(시간은 줄기만 한다).
 */
function liveFlight(g: GuideDto, now: number | null, fetchedAt: number | null): FlightView {
  const f = g.flight;
  if (now === null || f.close !== "open" || f.closeAtMs === null || f.minutesToClose === null) return f;
  const passed = Math.max(0, now - (fetchedAt ?? g.generatedAt));
  const m = Math.min(Math.floor((f.closeAtMs - g.generatedAt - passed) / MIN), f.minutesToClose);
  if (m < 0) return { ...f, close: "past", minutesToClose: null, urgent: true };
  return { ...f, minutesToClose: m, urgent: m <= g.urgentMin };
}

/** 여객 휴대전화의 패스 화면. QR 과 번호, 내 항공편, 고른 안내가 있고 직접 지울 수 있다. */
export function PassView({ token, initial, qr, isNew }: { token: string; initial: GuideDto; qr: string; isNew: boolean }) {
  const [guide, setGuide] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erased, setErased] = useState(() => erasedTokens.has(token));
  const [error, setError] = useState<string | null>(null);
  // 지금 시각과 인터넷 연결. 서버에서 그린 첫 화면과 어긋나지 않게, 화면이 뜬 뒤에 채운다.
  const [now, setNow] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  // 이 화면이 지금 보이는 내용을 서버에 청한 때(휴대전화 시각). 서버가 그 사이에 만들므로, 여기서부터 세면 흐른 시간을 덜 세지 않는다.
  // 첫 화면은 언제 받은 것인지 모르므로(남겨 둔 화면일 수 있다) 비워 둔다.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  // 지우기를 누른 뒤에는 탑승구를 다시 받던 요청의 답을 쓰지 않는다. 그 답("끝난 패스")이 "지웠습니다" 화면을 덮지 않게 한다.
  const erasing = useRef(false);

  const lang = guide.lang;
  const prefs = prefsOf(guide.choices);
  const t = textOf(lang, prefs.easy);

  // 주소의 ?new=1 은 처음 한 번만 쓴다. 화면을 저장하거나 다시 열 때는 붙지 않게 지운다.
  useEffect(() => {
    if (isNew) window.history.replaceState(null, "", window.location.pathname);
  }, [isNew]);

  // 인터넷이 끊겨도 이 화면이 열리도록 휴대전화에 남겨 두게 한다(public/sw.js).
  // 개발 서버에서는 켜지 않는다. 화면을 그리는 파일이 수시로 바뀌어 남겨 둔 것이 오히려 방해가 된다.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ type: "save-pass", token }))
      .catch(() => {
        // 등록하지 못해도 화면은 그대로 쓴다. 인터넷이 끊기면 열리지 않을 뿐이다.
      });
  }, [token]);

  // 이 화면을 보는 동안에는 휴대전화 화면이 저절로 꺼지지 않게 한다. 키오스크에 QR 을 대려는 순간 화면이 어두워지면 읽히지 않는다.
  // 지원하지 않는 기기에서는 아무 일도 없다. 다른 화면에 갔다 오면 풀리므로 돌아올 때 다시 청한다.
  useEffect(() => {
    if (erased) return;
    type Lock = { release(): Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Lock> } };
    if (!nav.wakeLock) return;
    let lock: Lock | null = null;
    let gone = false;
    const keep = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const got = await nav.wakeLock!.request("screen");
        if (gone) void got.release();
        else lock = got;
      } catch {
        // 절전 모드 등으로 거절되면 그대로 둔다.
      }
    };
    void keep();
    document.addEventListener("visibilitychange", keep);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", keep);
      void lock?.release().catch(() => {});
    };
  }, [erased]);

  // 남은 시간을 지금 시각으로 다시 세고, 인터넷이 끊겼는지 본다.
  useEffect(() => {
    if (erased) return;
    const tick = () => {
      setNow(Date.now());
      setOnline(navigator.onLine);
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
    };
  }, [erased]);

  // 탑승구와 남은 시간을 가끔 다시 받는다.
  // 화면이 뜨자마자 한 번 받는다. 휴대전화에 남겨 둔 예전 화면이 열렸을 수 있어서다. 인터넷이 다시 이어질 때도 바로 받는다.
  useEffect(() => {
    if (erased) return;
    const refresh = async () => {
      const sentAt = Date.now();
      try {
        const res = await fetch("/api/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (erasing.current) return;
        if (res.status === 410 || res.status === 404) return window.location.reload();
        if (res.ok) {
          setGuide((await res.json()).guide);
          setFetchedAt(sentAt);
          setNow(Date.now());
        }
      } catch {
        // 한 번 못 받은 것은 넘어간다.
      }
    };
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
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
      // 휴대전화에 남겨 둔 이 화면도 지운다. 지운 뒤에 인터넷이 끊긴 채로 열어도 예전 QR 이 나오지 않게 한다.
      // 화면에서 바로 지우고(워커가 이 화면을 맡지 않은 때에도 지워지게), 워커에게도 알려 지우는 사이에 다시 써 넣지 않게 한다.
      void window.caches?.open("jsp-pass-v1").then((c) => c.delete(`${window.location.origin}/p/${token.toUpperCase()}`)).catch(() => {});
      void navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: "forget-pass", token })).catch(() => {});
      erasedTokens.add(token);
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
        {/* next/link 가 아니라 보통 링크로 연다. 등록 화면에서 「뒤로」를 누르면 브라우저가 서버에 다시 물어
            "사용이 끝난 패스" 화면이 나온다. next/link 로 가면 지우기 전의 화면을 그대로 다시 그린다. */}
        <a className="btn btn-primary" href={lang === "en" ? "/register?lang=en" : "/register"}>
          {t.again}
        </a>
      </FlowShell>
    );
  }

  const flight = liveFlight(guide, now, fetchedAt);
  // 받은 지 오래되었거나 인터넷이 끊겼으면, 언제 받은 내용인지 알린다.
  // 이 화면에서 받은 내용이면 휴대전화에서 흐른 시간으로 잰다. 휴대전화 시계가 빨라도 막 받은 내용에 "HH:MM 기준"이 붙지 않는다.
  // 언제 받았는지 모르는 첫 화면만 서버가 만든 시각과 견주고, 휴대전화 시계가 늦어 그 차이가 음수이면 새 내용으로 본다.
  const old = now !== null && (!online || now - (fetchedAt ?? guide.generatedAt) > OLD_MS);
  // 운항 정보가 오래되었는지도 지금 시각으로 다시 본다. 남겨 둔 화면은 만들 때는 새 정보였어도(poll.stale 이 false)
  // 몇 시간 뒤에 열면 탑승구가 바뀌었을 수 있다. 서버가 알려 준 "오래되기까지 남은 시간"과 그 뒤 흐른 시간을 남은 시간 세듯이 견준다.
  const stale = staleNow(guide, now, fetchedAt);
  const asOf = lang === "en" ? `As of ${kstHm(guide.generatedAt)}` : `${kstHm(guide.generatedAt)} 기준`;
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
      {old && <Banner role="status">{asOf}</Banner>}
      {stale && <Banner role="status">{t.stale}</Banner>}

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
