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
import { ListenStart } from "../../components/ListenStart";
import { StaffCall } from "../../components/StaffCall";
import { Brand } from "../../components/Sunflower";
import { useSpeech } from "../../components/useSpeech";
import { resetViewSettings, useViewSettings } from "../../components/viewSettings";

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
// QR 확인 한 번을 기다리는 가장 긴 시간(안내 키오스크와 같다). 약한 와이파이에서 답이 오지 않는 요청 하나에
// 붙잡히면 카메라가 멈춘 채로 남아, 다음 여객도 스티커를 다시 뽑지 못한다.
const RESOLVE_TIMEOUT_MS = 15_000;

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
  // 스티커를 이미 뽑은 패스(token). 아래 자동 인쇄와 「스티커 다시 뽑기」 버튼이 본다.
  const [printedFor, setPrintedFor] = useState<string | null>(null);
  const t = textOf(lang, prefs.easy);
  const { speak, stop } = useSpeech(lang);
  // 직원 부르기의 상태도 소리로 읽는다. 처음 화면의 「소리로 안내 듣기」나 「설정」으로 켰어도 읽는다.
  const voiceOn = useViewSettings().voice ?? prefs.voice;

  // 공용 기기다. 화면을 새로 열 때 앞사람이 「설정」에서 바꾼 것이 남아 있지 않게 한다.
  useEffect(() => resetViewSettings(), []);

  // 소리 안내를 켠 여객에게는 오류 문구(QR 을 다시 뽑지 못한 까닭)도 읽어 준다. 화면을 보지 못하면 왜 안 되는지 모른다.
  // 새 오류가 뜰 때 한 번만 읽는다. 소리를 나중에 켰다고 지난 오류를 다시 읽지는 않게 소리 설정은 ref 로 본다.
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  useEffect(() => {
    if (error && voiceRef.current) speak(error);
  }, [error, speak]);

  const busyRef = useRef(false);
  // QR 확인의 차례와 그 요청. 처음 화면으로 돌아가면 차례를 넘기고 요청을 끊는다.
  const scanSeq = useRef(0);
  const scanCtrl = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    // 앞사람의 QR 을 확인하던 요청은 끊고, 늦게 온 답도 버린다. 끊지 않으면 「확인하는 중」이 남아 다음 여객의 QR 을 읽지 않고,
    // 늦게 온 답을 쓰면 떠난 여객의 스티커 화면(고유 일련 번호와 QR)이 다음 사람 앞에 열린다.
    scanSeq.current++;
    scanCtrl.current?.abort();
    scanCtrl.current = null;
    busyRef.current = false;
    setBusy(false);
    setView("start");
    setLang("ko");
    setPrefs(NO_PREFS);
    setIssued(null);
    setError(null);
    // 뽑았다는 표시도 지운다. 같은 여객이 나중에 스티커를 잃어 다시 뽑으러 오면, 이번 방문에서는 아직 한 장도 안 나왔으니
    // 자동 인쇄가 다시 돌고 버튼도 「스티커 뽑기」로 보여야 한다. 처음 화면으로 가므로 떠나는 여객에게 또 뽑히지는 않는다.
    setPrintedFor(null);
    // 앞사람이 「설정」에서 바꾼 글자 크기와 소리도 지운다.
    resetViewSettings();
  }, []);

  const onPrefs = useCallback((l: Lang, p: Prefs) => {
    setLang(l);
    setPrefs(p);
  }, []);

  // 스티커 프린터가 달린 키오스크는 등록을 마치면 바로 뽑는다. 설치할 때 켜 둔 경우에만.
  // 뽑은 패스는 상태(printedFor)로 기억한다. 그래야 자동으로 한 장 나온 뒤 버튼이 「스티커 다시 뽑기」로 바뀌어, 같은 스티커를 또 뽑지 않는다.
  useEffect(() => {
    if (view !== "done" || !issued || printedFor === issued.token) return;
    let auto = false;
    try {
      auto = localStorage.getItem(AUTOPRINT_KEY) === "1";
    } catch {
      auto = false;
    }
    if (!auto) return;
    // QR 그림이 그려질 틈을 준 뒤에 인쇄한다. 뽑았다는 표시는 실제로 뽑을 때 한다.
    // 미리 해 두면 그 표시로 이 effect 가 다시 돌고, 정리하면서 아직 돌지 않은 인쇄를 지워 버린다.
    const token = issued.token;
    const timer = setTimeout(() => {
      setPrintedFor(token);
      window.print();
    }, 700);
    return () => clearTimeout(timer);
  }, [view, issued, printedFor]);

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
      // 답이 오지 않는 요청은 끊는다. 끊긴 것은 catch 로 가서 연결 오류로 알리고, 카메라가 다시 읽는다.
      const mine = ++scanSeq.current;
      const ctrl = new AbortController();
      scanCtrl.current = ctrl;
      const limit = setTimeout(() => ctrl.abort(), RESOLVE_TIMEOUT_MS);
      try {
        const res = await fetch("/api/kiosk/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scanned: text, purpose: "print" }),
          signal: ctrl.signal,
        });
        if (mine !== scanSeq.current) return;
        const data = await res.json();
        if (mine !== scanSeq.current) return;
        if (!res.ok) {
          setError(res.status === 410 ? tt.passEnded : res.status === 404 ? tt.passUnknown : lang === "en" ? tt.offline : (data.error ?? tt.offline));
          return;
        }
        setLang(data.guide.lang);
        setPrefs(prefsOf(data.guide.choices));
        setIssued({ token: data.token, passNo: data.guide.passNo });
        setView("done");
      } catch {
        // 처음 화면으로 돌아가며 끊은 것이면 알리지 않는다. 알리면 다음 여객 앞에 앞사람의 오류가 뜬다.
        if (mine === scanSeq.current) setError(tt.offline);
      } finally {
        clearTimeout(limit);
        // 그사이 처음 화면으로 돌아갔으면 reset 이 이미 풀었다. 뒤에 시작한 확인의 「확인하는 중」을 지우지 않는다.
        if (mine === scanSeq.current) {
          scanCtrl.current = null;
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [lang],
  );

  const call = assisted ? null : (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall t={t} big={prefs.wantsStaff} token={issued?.token ?? null} screen="register" onActive={setCallActive} say={voiceOn ? speak : undefined} />
      </div>
    </div>
  );
  const idle = assisted ? null : (
    <IdleGuard
      t={t}
      enabled={view !== "start" && !callActive}
      askSec={idleAskSec}
      answerSec={idleAnswerSec}
      onTimeout={reset}
      say={voiceOn ? speak : undefined}
      hush={voiceOn ? stop : undefined}
    />
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
            <button
              className="btn btn-primary"
              onClick={() => {
                // 자동 인쇄를 기다리는 중에 눌렀으면 그 인쇄는 거둬진다(표시가 바뀌어 effect 가 정리된다). 두 장이 나오지 않는다.
                setPrintedFor(issued.token);
                window.print();
              }}
            >
              <Printer size={22} aria-hidden="true" />
              {printedFor === issued.token ? t.kioskPrintAgain : t.kioskPrint}
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
    // 키오스크의 카메라는 그 앞에 선 여객을 향한다(앞 카메라). 안내데스크에서는 직원이 기기를 들고 여객의 휴대전화를 비추므로
    // 뒤 카메라를 쓰고, 여객에게 하는 말 대신 직원에게 하는 말을 쓴다(같은 데스크의 「패스 찾기」와 같다).
    const reprintTitle = assisted ? "여객의 QR을 찍어 주세요" : t.reprintTitle;
    const reprintBody = assisted ? "여객이 휴대전화로 받은 QR을 카메라로 비춰 주세요. 같은 QR을 스티커로 뽑습니다." : t.reprintBody;
    screen = (
      <FlowShell lang={lang} prefs={prefs} kiosk screenKey="reprint" speakText={`${reprintTitle}. ${reprintBody}`} onBack={reset} onHome={reset}>
        <div className="scan-layout">
          <div>
            <h1>{reprintTitle}</h1>
            <p className="lead">{reprintBody}</p>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <Scanner
            onScan={onScan}
            paused={busy}
            prefer={assisted ? "environment" : "user"}
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
          {!assisted && <ListenStart t={t} />}
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
