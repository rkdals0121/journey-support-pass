"use client";

import { ArrowRight, CircleCheck, Printer, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefsOf, type Prefs } from "@/lib/catalog";
import { textOf, type Lang } from "@/lib/i18n";
import { extractToken } from "@/lib/pass-format";
import { ErrorNote } from "../../components/Alert";
import { FlowShell } from "../../components/FlowShell";
import { IdleGuard } from "../../components/IdleGuard";
import { PassQr, Sticker } from "../../components/PassQr";
import { RegisterFlow } from "../../components/RegisterFlow";
import { Scanner } from "../../components/Scanner";
import { StaffCall } from "../../components/StaffCall";
import { Brand } from "../../components/Sunflower";
import { useSpeech } from "../../components/useSpeech";
import { resetViewSettings } from "../../components/viewSettings";

interface Props {
  placeLabel: string;
  placeLabelEn: string;
  /** 직원이 여객 대신 넣는 안내데스크 화면이면 true. 직원 부르기와 자동 종료가 없다. */
  assisted?: boolean;
  idleAskSec: number;
  idleAnswerSec: number;
}

type View = "start" | "flow" | "done" | "reprint";
interface Issued {
  token: string;
  passNo: string;
}

const NO_PREFS: Prefs = { large: false, voice: false, picture: false, easy: false, wantsStaff: false };
export const AUTOPRINT_KEY = "jsp:kiosk:autoprint";

/**
 * 등록 키오스크. 사전에 등록하지 않은 여객이 공항에서 직접 등록하고 QR 스티커를 받는다.
 * 휴대전화로 이미 등록한 여객은 그 QR 을 보여 주고 같은 QR 을 스티커로 뽑을 수 있다.
 */
export function RegisterKiosk({ placeLabel, placeLabelEn, assisted = false, idleAskSec, idleAnswerSec }: Props) {
  const [view, setView] = useState<View>("start");
  const [lang, setLang] = useState<Lang>("ko");
  const [prefs, setPrefs] = useState<Prefs>(NO_PREFS);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  const t = textOf(lang, prefs.easy);
  const { speak } = useSpeech(lang);

  const reset = useCallback(() => {
    setView("start");
    setLang("ko");
    setPrefs(NO_PREFS);
    setIssued(null);
    setError(null);
    // 앞사람이 「설정」에서 바꾼 글자 크기와 소리도 지운다.
    resetViewSettings();
  }, []);

  const onPrefs = useCallback((l: Lang, p: Prefs) => {
    setLang(l);
    setPrefs(p);
  }, []);

  // 스티커 프린터가 달린 키오스크는 등록을 마치면 바로 뽑는다. 설치할 때 켜 둔 경우에만.
  const printed = useRef<string | null>(null);
  useEffect(() => {
    if (view !== "done" || !issued || printed.current === issued.token) return;
    let auto = false;
    try {
      auto = localStorage.getItem(AUTOPRINT_KEY) === "1";
    } catch {
      auto = false;
    }
    if (!auto) return;
    printed.current = issued.token;
    // QR 그림이 그려질 틈을 준 뒤에 인쇄한다.
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, [view, issued]);

  const busyRef = useRef(false);
  const onScan = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      const tt = textOf(lang);
      if (!extractToken(text)) {
        setError(tt.notQr);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/kiosk/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scanned: text, purpose: "print" }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(res.status === 410 ? tt.passEnded : res.status === 404 ? tt.passUnknown : lang === "en" ? tt.offline : (data.error ?? tt.offline));
          return;
        }
        setLang(data.guide.lang);
        setPrefs(prefsOf(data.guide.choices));
        setIssued({ token: data.token, passNo: data.guide.passNo });
        setView("done");
      } catch {
        setError(tt.offline);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [lang],
  );

  const call = assisted ? null : (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall t={t} big={prefs.wantsStaff} token={issued?.token ?? null} screen="register" onActive={setCallActive} say={prefs.voice ? speak : undefined} />
      </div>
    </div>
  );
  const idle = assisted ? null : (
    <IdleGuard t={t} enabled={view !== "start" && !callActive} askSec={idleAskSec} answerSec={idleAnswerSec} onTimeout={reset} />
  );
  const here = lang === "en" ? placeLabelEn : placeLabel;

  let screen: React.ReactNode;
  if (view === "flow") {
    screen = (
      <RegisterFlow
        mode={assisted ? "assisted" : "kiosk"}
        initialLang={lang}
        onExit={reset}
        onPrefs={onPrefs}
        onDone={(r) => {
          setIssued({ token: r.token, passNo: r.passNo });
          setView("done");
        }}
      />
    );
  } else if (view === "done" && issued) {
    screen = (
      <FlowShell
        lang={lang}
        prefs={prefs}
        kiosk
        screenKey="done"
        speakText={`${t.kioskDoneTitle}. ${t.passNo} ${issued.passNo.split("").join(" ")}. ${t.kioskDoneBody}`}
        onHome={reset}
        cta={
          <>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={22} aria-hidden="true" />
              {printed.current === issued.token ? t.kioskPrintAgain : t.kioskPrint}
            </button>
            <button className="btn" onClick={reset}>
              {t.kioskFinish}
            </button>
          </>
        }
      >
        <p className="success-head">
          <CircleCheck size={30} aria-hidden="true" />
          {t.kioskDoneTitle}
        </p>
        <div className="done-layout">
          <PassQr token={issued.token} passNo={issued.passNo} label={t.passNo} />
          <div>
            <h1>{t.kioskPrint}</h1>
            <p className="lead">{t.kioskDoneBody}</p>
          </div>
        </div>
        <Sticker token={issued.token} passNo={issued.passNo} />
      </FlowShell>
    );
  } else if (view === "reprint") {
    screen = (
      <FlowShell lang={lang} prefs={prefs} kiosk screenKey="reprint" speakText={`${t.reprintTitle}. ${t.reprintBody}`} onBack={reset} onHome={reset}>
        <div className="scan-layout">
          <div>
            <h1>{t.reprintTitle}</h1>
            <p className="lead">{t.reprintBody}</p>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <Scanner
            onScan={onScan}
            paused={busy}
            prefer="user"
            text={{ starting: t.camStarting, ready: t.camReady, read: t.camRead, none: t.camNone, switchCamera: t.camSwitch }}
          />
        </div>
      </FlowShell>
    );
  } else {
    screen = (
      <FlowShell lang={lang} prefs={prefs} kiosk screenKey="start" speakText={`${t.kioskRegTitle}. ${t.kioskRegBody}`}>
        <div className="kiosk-head">
          <Brand />
          {assisted ? (
            <a className="lang-switch" href="/staff/desk">
              안내데스크로
            </a>
          ) : (
            <button className="lang-switch" onClick={() => setLang(lang === "en" ? "ko" : "en")} lang={lang === "en" ? "ko" : "en"}>
              {t.otherLang}
            </button>
          )}
        </div>
        <div className="kiosk-start">
          <h1>{assisted ? "여객 대신 등록하기" : t.kioskRegTitle}</h1>
          <p className="lead">
            {assisted ? "여객께 여쭤보며 대신 눌러 주세요. 동의 화면은 여객이 직접 읽거나 읽어 드린 뒤 넘어갑니다. 끝나면 스티커를 뽑아 드립니다." : t.kioskRegBody}
          </p>
          <button
            className="btn btn-primary btn-xl"
            onClick={() => {
              setError(null);
              setView("flow");
            }}
          >
            {t.kioskRegStart}
            <ArrowRight size={26} aria-hidden="true" />
          </button>
          <button
            className="btn btn-xl"
            onClick={() => {
              setError(null);
              setView("reprint");
            }}
          >
            <Smartphone size={24} aria-hidden="true" />
            {t.kioskReprint}
          </button>
        </div>
        <p className="kiosk-foot">{here}</p>
      </FlowShell>
    );
  }

  return (
    <>
      {screen}
      {call}
      {idle}
    </>
  );
}
