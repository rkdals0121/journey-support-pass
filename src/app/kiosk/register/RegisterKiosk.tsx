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
// 로그인(키오스크 설치)이 풀려 서버가 401 로 답하면 보낼 곳. 안내데스크 화면은 직원 로그인으로, 키오스크는 설치 화면으로.
const KIOSK_SETUP = "/kiosk";
const STAFF_LOGIN = "/staff/login";
// 스티커의 QR 그림을 기다리는 가장 긴 시간. 그림은 따로 받아 오는 조각(qrcode)으로 그려서, 약한 와이파이에서는 등록을 마친
// 뒤에도 QR 칸이 한참 비어 있을 수 있다. 이만큼 기다려도 없으면(조각을 끝내 받지 못함) 더 붙잡지 않는다.
// 다시 누르면 그 조각을 새로 받아 다시 그린다(아래 qrTry). 한 번 받지 못한 그림은 저절로 다시 받지 않는다.
const STICKER_WAIT_MS = 10_000;

/** 인쇄될 스티커(PassQr 의 Sticker)에 QR 그림이 실제로 들어가 있는지. */
function stickerDrawn(): boolean {
  return document.querySelector(".sticker-qr svg") !== null;
}

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
  // 지금 여객의 차례. 처음 화면으로 돌아갈 때마다 하나 올린다. 늦게 온 등록 답과 앞사람이 남긴 호출을 가려내는 데 쓴다.
  const sessionSeq = useRef(0);
  // 「직원 부르기」를 누른 차례. 앞사람이 부르고 간 호출은 처음 화면으로 돌아간 뒤에도 열려 있다(직원은 그 자리로 온다).
  // 그 호출이 다음 여객의 자동 종료까지 막으면, 다음 여객이 그냥 떠났을 때 그 사람의 QR 과 고유 일련 번호가 공용 화면에 남는다.
  // 그래서 지금 여객이 직접 누른 호출일 때만 자동 종료를 끈다.
  const [callSeq, setCallSeq] = useState<number | null>(null);
  const onCallActive = useCallback((active: boolean) => {
    setCallActive(active);
    if (!active) setCallSeq(null);
  }, []);
  const ownCall = callActive && callSeq === sessionSeq.current;

  // 처음 화면이나 QR 을 찍는 화면처럼 여객의 내용이 아직 없을 때 누른 호출은, 부른 사람이 떠나고 다음 여객이 등록을 시작했을 수 있다.
  // 그 호출이 다음 여객의 등록과 스티커 화면까지 자동 종료를 막으면, 그 여객의 QR 과 고유 일련 번호가 공용 화면에 남는다.
  // 그래서 부른 뒤 아무도 화면을 건드리지 않은 채 idleAskSec 이 지났으면(떠났다고 본다) 열리는 화면의 자동 종료를 막지 않는다
  // (아래 「등록 시작」과 onScan). 부른 여객이 그사이 화면을 계속 쓰다가 등록을 시작했으면 그대로 그 여객의 호출이다.
  // 직원을 기다리는 동안 「계속 이용하시겠어요?」를 묻지 않는다.
  // 마지막으로 화면을 건드린 때. IdleGuard 가 보는 것과 같은 누름을 본다. QR 을 찍는 것은 건드린 것이 아니다.
  const lastTouch = useRef(0);
  // 빈 화면에서 누른 호출. left 는 그 뒤 아무도 건드리지 않은 채 idleAskSec 이 지난 적이 있는지다.
  const emptyCall = useRef<{ left: boolean } | null>(null);
  useEffect(() => {
    const touch = () => {
      const now = Date.now();
      if (emptyCall.current && !emptyCall.current.left && now - lastTouch.current >= idleAskSec * 1000) {
        emptyCall.current.left = true;
        // 부른 사람이 떠난 뒤의 첫 누름이다(다음 사람). 그 사람이 무엇을 고르기 전에, 떠난 사람이 바꿔 둔 소리·글자 크기·언어를 지운다.
        // 안내를 열 때 지우면 다음 사람이 그사이 고른 언어와 소리까지 지워진다.
        resetViewSettings();
        setLang("ko");
      }
      lastTouch.current = now;
    };
    // 화면의 단추보다 먼저 듣는다(capture). 「등록 시작」을 누른 손이 단추에 닿기 전에 그 앞의 빈 시간을 잰다.
    const events = ["pointerdown", "keydown", "touchstart", "wheel", "click"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { capture: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
  }, [idleAskSec]);
  // 빈 화면에서 부른 사람이 at(「등록 시작」을 누르거나 QR 을 찍은 때)까지 떠나 있었는지.
  const callerLeft = useCallback(
    (at: number) => {
      const c = emptyCall.current;
      return c !== null && (c.left || at - lastTouch.current >= idleAskSec * 1000);
    },
    [idleAskSec],
  );

  // 스티커를 이미 뽑은 패스(token). 아래 자동 인쇄와 「스티커 다시 뽑기」 버튼이 본다.
  const [printedFor, setPrintedFor] = useState<string | null>(null);
  // 뽑으려고 QR 그림을 기다리는 스티커(token).
  const [printing, setPrinting] = useState<string | null>(null);
  // QR 그림을 다시 받아 그린 횟수. 스티커와 화면의 QR 은 그림 조각(qrcode)을 처음 그릴 때 한 번만 받아서, 약한 와이파이에서 한 번
  // 받지 못하면 그 칸은 계속 빈다. 그러면 「스티커 뽑기」를 몇 번 눌러도 매번 기다리다 같은 오류만 뜬다. 그래서 그림이 없을 때
  // 누르면 이 수를 올려 두 QR 을 새로 그린다(key). 그때 조각도 다시 받는다. 아직 받는 중이었으면 그것을 그대로 기다린다.
  const [qrTry, setQrTry] = useState(0);
  const t = textOf(lang, prefs.easy);
  // 스티커를 뽑지 못했다는 말을 그때의 언어로 띄운다. 그림을 기다리는 시계가 언어가 바뀔 때마다 새로 돌지 않게 ref 로 본다.
  const langRef = useRef(lang);
  langRef.current = lang;
  const { speak, stop } = useSpeech(lang);
  // 직원 부르기의 상태도 소리로 읽는다. 처음 화면의 「소리로 안내 듣기」나 「설정」으로 켰어도 읽는다.
  const viewSettings = useViewSettings();
  const voiceOn = viewSettings.voice ?? prefs.voice;

  // 공용 기기다. 화면을 새로 열 때 앞사람이 「설정」에서 바꾼 것이 남아 있지 않게 한다.
  useEffect(() => resetViewSettings(), []);

  // QR 그림을 그리는 조각(qrcode)을 화면을 열 때 미리 받아 둔다. 등록을 마친 화면에서야 받기 시작하면 약한 와이파이에서는
  // 스티커의 QR 칸이 한참 비어 있다. 받지 못해도 여기서는 알리지 않는다(QR 을 그릴 때 다시 받는다).
  useEffect(() => {
    import("qrcode").catch(() => {});
  }, []);

  // 소리 안내를 켠 여객에게는 오류 문구(QR 을 다시 뽑지 못한 까닭, 스티커를 뽑지 못한 까닭)도 읽어 준다. 화면을 보지 못하면 왜 안 되는지 모른다.
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

  // QR 을 확인하던 요청은 끊고, 늦게 온 답도 버린다. 끊지 않으면 「확인하는 중」이 남아 다음 QR 을 읽지 않고,
  // 늦게 온 답을 쓰면 떠난 여객의 스티커 화면(고유 일련 번호와 QR)이 처음 화면 위에 열린다(자동 인쇄면 스티커까지 뽑힌다).
  const dropScan = useCallback(() => {
    scanSeq.current++;
    scanCtrl.current?.abort();
    scanCtrl.current = null;
    busyRef.current = false;
    setBusy(false);
  }, []);

  // 「다시 뽑기」(QR 을 찍는 화면)의 「이전」. 같은 여객이 처음 화면으로 돌아가는 것이라 다음 여객의 차례로 넘기지 않는다(reset 과 다르다).
  // 넘기면 그 여객이 직원을 부르고 기다리는 중인데도 호출이 그 여객의 것이 아니게 되어, 「등록 시작」을 누르면 자동 종료가 다시 켜진다.
  // 그 호출이 누구 것인지는 빈 화면의 호출(위 emptyCall)대로 「등록 시작」에서 가린다. 「처음으로」는 그대로 다음 여객의 차례로 넘긴다.
  const backToStart = useCallback(() => {
    dropScan();
    setError(null);
    setView("start");
  }, [dropScan]);

  const reset = useCallback(() => {
    // 앞사람의 QR 을 확인하던 요청은 끊고, 늦게 온 답도 버린다(위 dropScan).
    dropScan();
    // 다음 여객의 차례로 넘긴다. 등록 중이던 앞사람의 답이 늦게 와도 버리고(아래 onDone), 앞사람의 호출은 열린 채로 두되
    // 이제는 자동 종료를 막지 않는다.
    sessionSeq.current++;
    setCallSeq(null);
    emptyCall.current = null;
    setView("start");
    setLang("ko");
    setPrefs(NO_PREFS);
    setIssued(null);
    setError(null);
    // 뽑았다는 표시도 지운다. 같은 여객이 나중에 스티커를 잃어 다시 뽑으러 오면, 이번 방문에서는 아직 한 장도 안 나왔으니
    // 자동 인쇄가 다시 돌고 버튼도 「스티커 뽑기」로 보여야 한다. 처음 화면으로 가므로 떠나는 여객에게 또 뽑히지는 않는다.
    setPrintedFor(null);
    // QR 그림을 기다리던 인쇄도 거둔다. 남겨 두면 처음 화면에서 앞사람의 스티커 대신 빈 쪽이 뽑힌다.
    setPrinting(null);
    // 앞사람이 「설정」에서 바꾼 글자 크기와 소리도 지운다.
    resetViewSettings();
  }, [dropScan]);

  // 처음 화면에는 자동 종료가 없다. 앞사람이 여기서 소리·글자 크기·언어를 바꾸고 떠나면 다음 사람에게 그대로 남아,
  // 다음 사람의 항공편과 고유 일련 번호가 소리로 읽힌다. 아무도 건드리지 않은 채 자동 종료와 같은 시간이 지나면 묻지 않고 되돌린다
  // (화면에 개인 정보가 없어 물을 것이 없다). 직원 호출이 진행 중이면 부른 여객이 기다리는 중일 수 있어 두지 않는다.
  // 첫 질문에서 고른 안내 방식(큰 글씨, 소리, 쉬운 말, 그림, 직원 부르기)도 남은 것으로 본다. 「이전」으로 처음 화면에 돌아와 떠나면 그대로 남는다.
  const leftover =
    viewSettings.scale !== null ||
    viewSettings.picture !== null ||
    viewSettings.voice !== null ||
    lang !== "ko" ||
    prefs.large ||
    prefs.voice ||
    prefs.picture ||
    prefs.easy ||
    prefs.wantsStaff;
  const quietIdle = view === "start" && leftover && !callActive;
  useEffect(() => {
    if (!quietIdle) return;
    const limit = (idleAskSec + idleAnswerSec) * 1000;
    const timer = setInterval(() => {
      if (Date.now() - lastTouch.current >= limit) reset();
    }, 2000);
    return () => clearInterval(timer);
  }, [quietIdle, idleAskSec, idleAnswerSec, reset]);

  const onPrefs = useCallback((l: Lang, p: Prefs) => {
    setLang(l);
    setPrefs(p);
  }, []);

  // 스티커 프린터가 달린 키오스크는 등록을 마치면 바로 뽑는다. 설치할 때 켜 둔 경우에만.
  // 뽑은 패스는 상태(printedFor)로 기억한다. 그래야 자동으로 한 장 나온 뒤 버튼이 「스티커 다시 뽑기」로 바뀌어, 같은 스티커를 또 뽑지 않는다.
  useEffect(() => {
    if (view !== "done" || !issued || printedFor === issued.token) return;
    // 안내데스크에서는 자동으로 뽑지 않는다. 직원이 여객과 내용을 확인한 뒤 누른다.
    // 같은 기기를 예전에 자동 인쇄 키오스크로 설치했던 적이 있어도(그 설정이 남아 있어도) 뽑지 않게 한다.
    if (assisted) return;
    let auto = false;
    try {
      auto = localStorage.getItem(AUTOPRINT_KEY) === "1";
    } catch {
      auto = false;
    }
    if (!auto) return;
    // 화면이 자리 잡을 틈을 준 뒤, QR 그림이 그려지기를 기다려 인쇄한다(아래 printing). 뽑았다는 표시는 실제로 뽑을 때 한다.
    // 미리 해 두면 그 표시로 이 effect 가 다시 돌고, 정리하면서 아직 돌지 않은 인쇄를 지워 버린다.
    // 그사이 여객이 「스티커 뽑기」를 눌러 기다리는 중이면 그것을 그대로 둔다. 두 장이 나오지 않는다.
    const token = issued.token;
    const timer = setTimeout(() => setPrinting((p) => p ?? token), 700);
    return () => clearTimeout(timer);
  }, [view, issued, printedFor, assisted]);

  // 스티커는 QR 그림이 실제로 그려진 뒤에 뽑는다. 그림이 없을 때 뽑으면 QR 칸이 빈 스티커가 나오고, 단추는 「스티커 다시 뽑기」로
  // 바뀌어 여객은 잘못 나온 줄도 모른다. 오래 기다려도 그려지지 않으면(자동 인쇄든 여객이 누른 것이든) 뽑지 않는다.
  // 뽑았다는 표시도 하지 않고 단추를 다시 풀어, 잠시 뒤 다시 누르라고 화면에 띄운다(소리를 켰으면 읽어 준다).
  useEffect(() => {
    if (!printing) return;
    const token = printing;
    const until = Date.now() + STICKER_WAIT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const drawn = stickerDrawn();
      if (!drawn && Date.now() < until) {
        timer = setTimeout(check, 100);
        return;
      }
      setPrinting(null);
      if (!drawn) return setError(textOf(langRef.current).stickerQrFail);
      setPrintedFor(token);
      window.print();
    };
    check();
    return () => clearTimeout(timer);
  }, [printing]);

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
      // QR 을 찍은 때. 빈 화면에서 부른 사람이 이때까지 떠나 있었는지 본다(아래, callerLeft).
      const at = Date.now();
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
        if (res.status === 401) return window.location.replace(assisted ? STAFF_LOGIN : KIOSK_SETUP);
        const data = await res.json();
        if (mine !== scanSeq.current) return;
        if (!res.ok) {
          setError(res.status === 410 ? tt.passEnded : res.status === 404 ? tt.passUnknown : lang === "en" ? tt.offline : (data.error ?? tt.offline));
          return;
        }
        setLang(data.guide.lang);
        setPrefs(prefsOf(data.guide.choices));
        setIssued({ token: data.token, passNo: data.guide.passNo });
        // 빈 화면에서 부른 사람이 떠나 있었으면 그 호출은 이 스티커 화면의 자동 종료를 막지 않는다(위 emptyCall). 계속 화면을
        // 쓰던 사람이면 그 사람의 호출로 둔다. 호출을 놓은 여객이 지금 다시 누르면 다시 그 여객의 호출이 된다.
        if (callerLeft(at)) setCallSeq(null);
        emptyCall.current = null;
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
    [lang, assisted, callerLeft],
  );

  const call = assisted ? null : (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall
          t={t}
          big={prefs.wantsStaff}
          token={issued?.token ?? null}
          screen="register"
          session={sessionSeq.current}
          onActive={onCallActive}
          onPress={() => {
            // 지금 여객의 호출로 삼는다. 처음 화면이나 QR 을 찍는 화면에서 눌렀으면 그 사실도 적어 둔다(위 emptyCall).
            // 등록하거나 스티커를 보던 중에 누른 것은 적지 않는다. 그 여객이 직원을 기다리는 동안 자동 종료는 계속 꺼 둔다.
            lastTouch.current = Date.now();
            emptyCall.current = view === "start" || view === "reprint" ? { left: false } : null;
            setCallSeq(sessionSeq.current);
          }}
          say={voiceOn ? speak : undefined}
        />
      </div>
    </div>
  );
  const idle = assisted ? null : (
    <IdleGuard
      t={t}
      enabled={view !== "start" && !ownCall}
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
    // 이 등록을 시작한 여객의 차례. 「등록 중…」에서 답이 늦는 사이에 처음 화면으로 돌아갔으면(「처음으로」, 자동 종료)
    // 늦게 온 답은 버린다. 쓰면 떠난 여객의 QR 과 고유 일련 번호가 다음 사람 앞에 열리고, 자동 인쇄면 스티커까지 뽑힌다.
    // 차례마다 새 등록 화면(key)을 써서 앞사람의 등록 화면이 이어지지 않게 한다.
    const seq = sessionSeq.current;
    screen = (
      <RegisterFlow
        key={seq}
        mode={assisted ? "assisted" : "kiosk"}
        initialLang={lang}
        onExit={reset}
        // 첫 질문의 「이전」은 같은 여객이 처음 화면으로 돌아가는 것이다. 다음 여객의 차례로 넘기지 않는다(backToStart).
        // 넘기면 직원을 기다리던 여객이 자동 종료되고, 켜 둔 소리도 꺼진다. 「처음으로」는 그대로 다음 여객으로 넘긴다.
        onBackOut={(l) => {
          backToStart();
          setLang(l);
        }}
        onPrefs={onPrefs}
        onDone={(r) => {
          if (seq !== sessionSeq.current) return;
          setIssued({ token: r.token, passNo: r.passNo });
          setView("done");
        }}
      />
    );
  } else if (view === "done" && issued && assisted) {
    // 안내데스크의 대신 등록은 스티커를 뽑지 않는다(멘토링: 실물 매개체의 폐기물과 이중 절차).
    // 여객이 휴대전화로 이 QR 을 찍으면 그 휴대전화에 등록 화면이 열리고, 체크인하면 탑승권에 저장된다.
    // 증빙은 현장에서 받지 않는다. 지금처럼 체크인 카운터에서 확인한다.
    const title = "여객 휴대전화로 이 QR을 찍게 해 주세요";
    const body = "찍으면 여객의 휴대전화에 등록 화면이 열립니다. 체크인하면 탑승권에 저장되어 안내 키오스크에서 쓸 수 있습니다. 우대 확인은 지금처럼 체크인 카운터에서 합니다.";
    screen = (
      <FlowShell
        lang={lang}
        prefs={prefs}
        kiosk
        screenKey="done"
        speakText={`${t.kioskDoneTitle}. ${title}. ${body}`}
        onHome={reset}
        cta={
          <button className="btn btn-primary" onClick={reset}>
            {t.kioskFinish}
          </button>
        }
      >
        <p className="success-head">
          <CircleCheck size={30} aria-hidden="true" />
          {t.kioskDoneTitle}
        </p>
        <div className="done-layout">
          <PassQr token={issued.token} passNo={issued.passNo} label={t.passNo} />
          <div>
            <h1>{title}</h1>
            <p className="lead">{body}</p>
          </div>
        </div>
      </FlowShell>
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
              // QR 그림을 기다리는 동안은 막아 둔다. 그림이 그려지면 곧 뽑힌다.
              disabled={printing !== null}
              aria-busy={printing !== null}
              onClick={() => {
                // QR 그림이 이미 있으면 바로 뽑고, 없으면 그림을 새로 받아 그리게 한 뒤(위 qrTry) 그려질 때까지 기다렸다가 뽑는다(위 printing).
                // 자동 인쇄를 기다리는 중에 눌렀으면 그 인쇄는 거둬진다(표시가 바뀌어 effect 가 정리된다). 두 장이 나오지 않는다.
                // 지난번에 뽑지 못했다는 말은 거둔다. 이번에도 못 뽑으면 다시 띄우고 다시 읽는다.
                setError(null);
                if (!stickerDrawn()) {
                  setQrTry((n) => n + 1);
                  return setPrinting(issued.token);
                }
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
          <PassQr key={`qr-${qrTry}`} token={issued.token} passNo={issued.passNo} label={t.passNo} />
          <div>
            <h1>{t.kioskPrint}</h1>
            <p className="lead">{t.kioskDoneBody}</p>
            {/* 스티커를 뽑지 못했을 때(QR 그림을 끝내 불러오지 못함) 다시 누르라는 말. */}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </div>
        <Sticker key={`sticker-${qrTry}`} token={issued.token} passNo={issued.passNo} />
      </FlowShell>
    );
  } else if (view === "reprint") {
    // 키오스크의 카메라는 그 앞에 선 여객을 향한다(앞 카메라). 안내데스크에서는 직원이 기기를 들고 여객의 휴대전화를 비추므로
    // 뒤 카메라를 쓰고, 여객에게 하는 말 대신 직원에게 하는 말을 쓴다(같은 데스크의 「패스 찾기」와 같다).
    const reprintTitle = assisted ? "여객의 QR을 찍어 주세요" : t.reprintTitle;
    const reprintBody = assisted ? "여객이 휴대전화로 받은 QR을 카메라에 비춰 주세요. 같은 QR을 스티커로 뽑습니다." : t.reprintBody;
    screen = (
      <FlowShell lang={lang} prefs={prefs} kiosk screenKey="reprint" speakText={`${reprintTitle}. ${reprintBody}`} onBack={backToStart} onHome={reset}>
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
            <button className="lang-switch" onClick={() => setLang((l) => (l === "en" ? "ko" : "en"))} lang={lang === "en" ? "ko" : "en"}>
              {t.otherLang}
            </button>
          )}
        </div>
        <div className="kiosk-start">
          <h1>{assisted ? "여객 대신 등록하기" : t.kioskRegTitle}</h1>
          <p className="lead">
            {assisted
              ? "예매 완료 화면의 링크를 보지 못한 여객을 대신 등록합니다. 여객께 여쭤보며 대신 눌러 주세요. 동의 화면은 여객이 직접 읽거나 읽어 드린 뒤 넘어갑니다. 끝나면 여객 휴대전화로 QR을 찍게 해 드립니다."
              : t.kioskRegBody}
          </p>
          <button
            className="btn btn-primary btn-xl"
            onClick={() => {
              setError(null);
              // 빈 화면에서 부른 사람이 떠나 있었으면(앞사람이 부르고 떠난 자리) 그 호출은 이제 시작하는 등록의 자동 종료를 막지 않는다.
              // 계속 화면을 쓰던 사람이면 그 사람의 호출로 둔다. 호출을 놓은 여객이 등록하는 중에 다시 누르면 다시 그 여객의 호출이 된다.
              if (callerLeft(Date.now())) setCallSeq(null);
              emptyCall.current = null;
              setView("flow");
            }}
          >
            {t.kioskRegStart}
            <ArrowRight size={26} aria-hidden="true" />
          </button>
          {/* 스티커를 다시 뽑는 길은 예비로 둔 등록 키오스크에만 남긴다. 안내데스크는 스티커를 뽑지 않는다. */}
          {!assisted && (
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
          )}
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
