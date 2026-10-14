"use client";

import { ChevronRight, Frown, Info, Keyboard, Meh, Navigation, QrCode, Smile, Sunrise } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAdapted, prefsOf, type Prefs } from "@/lib/catalog";
import type { GuideDto, GuideFacility } from "@/lib/guide";
import { textOf, type Lang } from "@/lib/i18n";
import { extractToken, PASS_NO_LENGTH } from "@/lib/pass-format";
import { Banner, ErrorNote } from "../../components/Alert";
import { FlowShell } from "../../components/FlowShell";
import { FlightBoard, closeText, departureText, destOf, paceText, routeLines, RouteSteps, RouteSummary, targetTitle, type RouteTarget } from "../../components/GuideParts";
import { IdleGuard } from "../../components/IdleGuard";
import { NumPad } from "../../components/Inputs";
import { FacilityIcon } from "../../components/NeedIcon";
import { Scanner } from "../../components/Scanner";
import { ListenStart } from "../../components/ListenStart";
import { StaffCall } from "../../components/StaffCall";
import { Brand } from "../../components/Sunflower";
import { useSpeech } from "../../components/useSpeech";
import { resetViewSettings, useViewSettings } from "../../components/viewSettings";

interface Props {
  placeLabel: string;
  placeLabelEn: string;
  refreshSec: number;
  /** 휴대전화로 찍어 바로 등록할 수 있는 QR 그림(svg). 아직 등록하지 않은 여객에게 처음 화면에서 보여 준다. */
  registerQr: string;
  /** 같은 QR 의 영어판. 영어로 바꾼 처음 화면에서는 이것을 보여 주어, 찍으면 영어 등록 화면이 바로 열린다. */
  registerQrEn: string;
  idleAskSec: number;
  idleAnswerSec: number;
}

type View = { kind: "scan" } | { kind: "number" } | { kind: "home" } | { kind: "route"; target: RouteTarget } | { kind: "survey" } | { kind: "thanks" };

const NO_PREFS: Prefs = { large: false, voice: false, picture: false, easy: false, wantsStaff: false };
const THANKS_MS = 3500;
const ERROR_SHOW_MS = 6000;
// 안내를 끝낸 여객이 QR 을 아직 카메라 앞에 들고 있어도 곧바로 다시 열리지 않게, 방금 끝낸 패스는 잠시 읽지 않는다.
const SAME_PASS_GUARD_MS = 8000;
// 다시 받기(그리고 QR·번호 확인) 한 번을 기다리는 가장 긴 시간. 약한 와이파이에서 답이 오지 않는 요청을 끝없이 붙잡지 않는다.
const REFRESH_TIMEOUT_MS = 15_000;
// 키오스크 설치(로그인)가 풀려 서버가 401 로 답하면 설치 화면으로 보낸다. 이 기기로는 더 QR 을 확인할 수 없다.
const KIOSK_SETUP = "/kiosk";

/**
 * 안내 키오스크. 여객이 QR 을 보여 주거나 번호를 누르면, 그 여객이 고른 대로 화면이 바뀌고 길과 시설을 안내한다.
 * 한 페이지 안에서 처음 화면 → 안내 → 끝내기 → 처음 화면으로 돈다. 끝내면 앞사람의 내용은 화면에서 지운다.
 */
export function GuideKiosk({ placeLabel, placeLabelEn, refreshSec, idleAskSec, idleAnswerSec, registerQr, registerQrEn }: Props) {
  const [view, setView] = useState<View>({ kind: "scan" });
  const [token, setToken] = useState<string | null>(null);
  const [guide, setGuide] = useState<GuideDto | null>(null);
  const [startLang, setStartLang] = useState<Lang>("ko");
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  // 지금 여객의 차례. 처음 화면으로 돌아갈 때마다 하나 올린다.
  const sessionSeq = useRef(0);
  // 「직원 부르기」를 누른 차례. 앞사람이 부르고 간 호출은 처음 화면으로 돌아간 뒤에도 열려 있다(직원은 그 자리로 온다).
  // 그 호출이 다음 여객의 자동 종료까지 막으면, 다음 여객이 그냥 떠났을 때 그 사람의 항공편과 고른 시설이 공용 화면에 남는다.
  // 그래서 지금 여객이 직접 누른 호출일 때만 자동 종료를 끈다.
  const [callSeq, setCallSeq] = useState<number | null>(null);
  const onCallActive = useCallback((active: boolean) => {
    setCallActive(active);
    if (!active) setCallSeq(null);
  }, []);
  const ownCall = callActive && callSeq === sessionSeq.current;

  const lang: Lang = guide ? guide.lang : startLang;
  const prefs = guide ? prefsOf(guide.choices) : NO_PREFS;
  const t = textOf(lang, prefs.easy);
  const { speak, stop } = useSpeech(lang);
  // 직원 부르기의 상태도 소리로 읽는다. 등록 때 소리를 고르지 않았어도 키오스크에서 소리를 켰으면 읽는다.
  const voiceOn = useViewSettings().voice ?? prefs.voice;
  const here = lang === "en" ? placeLabelEn : placeLabel;

  // 마지막으로 보여 준 오류 문구. 문구가 사라진 뒤에도 그 자리를 비워 두는 데만 쓴다(번호 화면).
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => {
    if (error) setLastError(error);
  }, [error]);
  useEffect(() => {
    if (view.kind !== "number") setLastError(null);
  }, [view.kind]);

  // 오류 문구는 잠시 보여준 뒤 치운다. 다음 사람이 앞사람의 오류를 보고 헷갈리지 않게 한다.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_SHOW_MS);
    return () => clearTimeout(timer);
  }, [error]);

  // 소리 안내를 켠 여객에게는 오류 문구도 읽어 준다. 화면을 보지 못하면 번호가 왜 지워졌는지, QR 이 왜 열리지 않는지 모른다.
  // 새 오류가 뜰 때 한 번만 읽는다. 소리를 나중에 켰다고 지난 오류를 다시 읽지는 않게 소리 설정은 ref 로 본다.
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  useEffect(() => {
    if (error && voiceRef.current) speak(error);
  }, [error, speak]);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const justEnded = useRef<{ token: string; at: number } | null>(null);
  // 공용 기기다. 화면을 새로 열 때 앞사람이 「설정」에서 바꾼 것이 남아 있지 않게 한다.
  useEffect(() => resetViewSettings(), []);

  const busyRef = useRef(false);
  // QR·번호 확인의 차례와 그 요청. 처음 화면으로 돌아가면 차례를 넘기고 요청을 끊는다.
  const openSeq = useRef(0);
  const openCtrl = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (tokenRef.current) justEnded.current = { token: tokenRef.current, at: Date.now() };
    // 앞사람의 QR·번호를 확인하던 요청은 끊고, 늦게 온 답도 버린다. 끊지 않으면 답이 오지 않는 요청 하나에
    // 「확인하는 중」이 남아 다음 여객이 QR 을 보여 주거나 번호를 눌러도 열리지 않는다.
    // 늦게 온 답을 쓰면 떠난 여객의 안내가 다음 사람 앞에 열린다.
    openSeq.current++;
    openCtrl.current?.abort();
    openCtrl.current = null;
    busyRef.current = false;
    setBusy(false);
    // 다음 여객의 차례로 넘긴다. 앞사람의 호출은 열린 채로 두되, 이제는 자동 종료를 막지 않는다.
    sessionSeq.current++;
    setCallSeq(null);
    setView({ kind: "scan" });
    setToken(null);
    setGuide(null);
    setDigits("");
    setError(null);
    setStartLang("ko");
    // 앞사람이 「설정」에서 바꾼 글자 크기와 소리도 지운다.
    resetViewSettings();
  }, []);

  const open = useCallback(
    async (body: { scanned: string } | { passNo: string }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      const tt = textOf(startLang);
      // 답이 오지 않는 요청은 끊는다. 끊긴 것은 catch 로 가서 연결 오류로 알리고, 다시 찍거나 누를 수 있게 된다.
      const mine = ++openSeq.current;
      const ctrl = new AbortController();
      openCtrl.current = ctrl;
      const limit = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/kiosk/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, purpose: "guide" }),
          signal: ctrl.signal,
        });
        if (mine !== openSeq.current) return;
        if (res.status === 401) return window.location.replace(KIOSK_SETUP);
        const data = await res.json();
        if (mine !== openSeq.current) return;
        if (!res.ok) {
          // 서버의 문구는 한국어다. 영어 화면에서는 상태에 맞는 영어 문구로 바꾼다.
          // 번호를 여러 번 틀려 잠긴 것(429)은 연결 문제가 아니다. "연결할 수 없습니다"라고 하면 엉뚱하게 와이파이를 살핀다.
          setError(
            res.status === 410
              ? tt.passEnded
              : res.status === 429
                ? tt.numberLocked
                : startLang === "en"
                  ? res.status === 404
                    ? tt.passUnknown
                    : tt.offline
                  : (data.error ?? tt.offline),
          );
          setDigits("");
          return;
        }
        setToken(data.token);
        setGuide(data.guide);
        setDigits("");
        setView({ kind: "home" });
      } catch {
        // 처음 화면으로 돌아가며 끊은 것이면 알리지 않는다. 알리면 다음 여객 앞에 앞사람의 오류가 뜬다.
        // 누른 번호도 지운다. 여섯 칸이 찬 채로 두면 번호판이 눌리지 않아 고장 난 것처럼 보인다.
        if (mine === openSeq.current) {
          setError(tt.offline);
          setDigits("");
        }
      } finally {
        clearTimeout(limit);
        // 그사이 처음 화면으로 돌아갔으면 reset 이 이미 풀었다. 뒤에 시작한 확인의 「확인하는 중」을 지우지 않는다.
        if (mine === openSeq.current) {
          openCtrl.current = null;
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [startLang],
  );

  const onScan = useCallback(
    (text: string) => {
      const scanned = extractToken(text);
      if (!scanned) {
        setError(textOf(startLang).notQr);
        return;
      }
      const ended = justEnded.current;
      if (ended && ended.token === scanned && Date.now() - ended.at < SAME_PASS_GUARD_MS) return;
      void open({ scanned: text });
    },
    [open, startLang],
  );

  // 여섯 자리를 다 누르면 바로 연다. 버튼을 한 번 더 누르지 않아도 된다.
  useEffect(() => {
    if (view.kind === "number" && digits.length === PASS_NO_LENGTH) void open({ passNo: digits });
  }, [digits, view.kind, open]);

  // 다시 받기에 두 번 연달아 실패하면(약 1분) 연결이 끊긴 것으로 보고 화면에 알린다.
  // 그동안 탑승구가 바뀌었어도 이 화면은 모르기 때문이다. 다시 받으면 알림을 거둔다.
  const [fails, setFails] = useState(0);
  const offlineNow = fails >= 2;

  // 새 여객이면 연결 실패 수를 처음부터 센다. 같은 여객이 안내와 길 화면을 오갈 때는 그대로 둔다
  // (오갈 때마다 지우면 인터넷이 끊긴 채인데도 알림이 사라진다).
  useEffect(() => setFails(0), [token]);

  // 안내를 보는 동안 탑승구와 남은 시간을 다시 받는다. 탑승구가 바뀌면 길도 바뀐다.
  // 안내와 길 화면을 오가도 시계를 새로 시작하지 않는다. 30초보다 자주 오가면 한 번도 다시 받지 못하기 때문이다.
  const viewing = view.kind === "home" || view.kind === "route";
  useEffect(() => {
    if (!token || !viewing) return;
    let alive = true;
    let inFlight = false;
    // 늦게 온 답이 지금 여객의 것인지 본다. 「처음으로」를 누른 뒤에 앞사람의 답이 오면
    // 앞사람의 안내(항공편, 고른 시설)가 다음 사람 앞에 다시 나타나므로 버린다.
    const stillMine = () => alive && tokenRef.current === token;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      const ctrl = new AbortController();
      const limit = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: ctrl.signal,
        });
        if (!stillMine()) return;
        if (res.status === 410 || res.status === 404) return reset();
        if (!res.ok) return setFails((n) => n + 1);
        const data = await res.json();
        if (!stillMine()) return;
        setGuide(data.guide);
        setFails(0);
      } catch {
        // 한 번 못 받은 것은 넘어가고, 거듭 못 받으면 알린다.
        if (stillMine()) setFails((n) => n + 1);
      } finally {
        clearTimeout(limit);
        inFlight = false;
      }
    }, refreshSec * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token, viewing, refreshSec, reset]);

  // 고맙다는 화면은 잠깐만 보여주고 처음으로 돌아간다.
  useEffect(() => {
    if (view.kind !== "thanks") return;
    const timer = setTimeout(reset, THANKS_MS);
    return () => clearTimeout(timer);
  }, [view.kind, reset]);

  const answer = (value: 1 | 2 | 3 | null) => {
    if (value !== null) {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "survey", value, adapted: guide ? isAdapted(guide.choices) : false }),
        keepalive: true,
      }).catch(() => {});
    }
    setView({ kind: "thanks" });
  };

  const call = (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall t={t} big={prefs.wantsStaff || guide?.routeNote === "other_terminal"} token={token} screen="guide" onActive={onCallActive} onPress={() => setCallSeq(sessionSeq.current)} say={voiceOn ? speak : undefined} />
      </div>
    </div>
  );
  const idle = (
    <IdleGuard
      t={t}
      enabled={view.kind !== "scan" && view.kind !== "thanks" && !(view.kind === "number" && digits === "") && !ownCall}
      askSec={idleAskSec}
      answerSec={idleAnswerSec}
      onTimeout={reset}
      say={voiceOn ? speak : undefined}
      hush={voiceOn ? stop : undefined}
    />
  );

  // ── 처음 화면: QR 을 보여 주세요 ──
  if (view.kind === "scan" || !guide) {
    if (view.kind === "number") {
      return (
        <>
          <FlowShell
            lang={lang}
            prefs={prefs}
            kiosk
            screenKey="number"
            speakText={`${t.numberTitle}. ${t.numberHint}`}
            onBack={() => {
              setDigits("");
              setView({ kind: "scan" });
            }}
            onHome={reset}
          >
            <h1>{t.numberTitle}</h1>
            <p className="lead">{t.numberHint}</p>
            <div className="code-boxes" role="group" aria-label={t.passNo}>
              {Array.from({ length: PASS_NO_LENGTH }, (_, i) => (
                <span key={i} className={`num ${digits[i] ? "filled" : ""} ${i === 2 ? "gap" : ""}`}>
                  {digits[i] ?? ""}
                </span>
              ))}
            </div>
            {/* 오류 문구는 잠시 뒤 사라진다. 그때 번호판이 위로 올라가면 누르려던 자리에 다른 키가 온다.
                그래서 문구가 차지하던 자리는 비워 둔 채로 두고 글만 감춘다. */}
            <div className="pad-status">
              {error ? (
                <ErrorNote>{error}</ErrorNote>
              ) : lastError ? (
                <div aria-hidden="true" className="ghost">
                  <ErrorNote>{lastError}</ErrorNote>
                </div>
              ) : busy ? (
                // 여객이 누른 번호를 확인하는 중이다. QR 을 읽었다고 하면 카메라를 못 쓴 여객이 헷갈린다.
                <p className="hint center">{t.numberChecking}</p>
              ) : null}
            </div>
            <NumPad
              onKey={(k) => setDigits((d) => (d.length < PASS_NO_LENGTH && !busy ? d + k : d))}
              onErase={() => setDigits((d) => d.slice(0, -1))}
              eraseLabel={t.erase}
            />
          </FlowShell>
          {call}
          {idle}
        </>
      );
    }
    return (
      <>
        <FlowShell lang={lang} prefs={prefs} kiosk screenKey="scan" speakText={`${t.scanTitle}. ${t.scanBody}`}>
          <div className="kiosk-head">
            <Brand />
            <button className="lang-switch" onClick={() => setStartLang(startLang === "en" ? "ko" : "en")} lang={startLang === "en" ? "ko" : "en"}>
              {t.otherLang}
            </button>
          </div>
          <div className="scan-layout">
            <div>
              <h1>
                <QrCode size={32} aria-hidden="true" /> {t.scanTitle}
              </h1>
              <p className="lead">{t.scanBody}</p>
              <ListenStart t={t} />
              {error && <ErrorNote>{error}</ErrorNote>}
              <div className="scan-alt">
                <span>{t.scanOr}</span>
                <button className="btn" onClick={() => setView({ kind: "number" })}>
                  <Keyboard size={22} aria-hidden="true" />
                  {t.scanNumber}
                </button>
              </div>
              <div className="info-row quiet">
                <span className="bubble bubble-sun">
                  <Info size={22} aria-hidden="true" />
                </span>
                <div>
                  <strong>{t.noPassTitle}</strong>
                  <span>{t.noPassBody}</span>
                </div>
                <figure className="register-qr">
                  <div dangerouslySetInnerHTML={{ __html: startLang === "en" ? registerQrEn : registerQr }} role="img" aria-label={t.noPassQr} />
                  <figcaption>{t.noPassQr}</figcaption>
                </figure>
              </div>
            </div>
            <Scanner
              onScan={onScan}
              paused={busy}
              prefer="user"
              text={{ starting: t.camStarting, ready: t.camReady, read: t.camRead, none: t.camNone, switchCamera: t.camSwitch }}
            />
          </div>
          <p className="kiosk-foot">{here}</p>
        </FlowShell>
        {call}
      </>
    );
  }

  // ── 만족도 한 문항, 끝 인사 ──
  if (view.kind === "survey") {
    return (
      <>
        <FlowShell
          lang={lang}
          prefs={prefs}
          kiosk
          screenKey="survey"
          speakText={`${t.surveyTitle}. ${t.surveyHint}. ${t.surveyGood}. ${t.surveyFair}. ${t.surveyPoor}`}
          onBack={() => setView({ kind: "home" })}
          onHome={reset}
        >
          <h1>{t.surveyTitle}</h1>
          <p className="lead">{t.surveyHint}</p>
          <div className="faces">
            <button className="face good" onClick={() => answer(3)}>
              <Smile size={56} aria-hidden="true" />
              {t.surveyGood}
            </button>
            <button className="face fair" onClick={() => answer(2)}>
              <Meh size={56} aria-hidden="true" />
              {t.surveyFair}
            </button>
            <button className="face poor" onClick={() => answer(1)}>
              <Frown size={56} aria-hidden="true" />
              {t.surveyPoor}
            </button>
          </div>
          <button className="btn btn-ghost" onClick={() => answer(null)}>
            {t.surveySkip}
          </button>
        </FlowShell>
        {call}
        {idle}
      </>
    );
  }
  if (view.kind === "thanks") {
    return (
      <>
        <FlowShell lang={lang} prefs={prefs} kiosk screenKey="thanks" speakText={t.thanks} onHome={reset}>
          <div className="empty" role="status">
            <span className="bubble bubble-sun">
              <Sunrise size={32} aria-hidden="true" />
            </span>
            <h1>{t.thanks}</h1>
          </div>
        </FlowShell>
        {call}
      </>
    );
  }

  const flight = guide.flight;
  // 다른 터미널에서 출발하는 편이면 여기서는 길을 알려 줄 수 없다. 아래 시설은 "지금 계신 곳 가까운 시설"이라고 밝힌다.
  const otherTerminal = guide.routeNote === "other_terminal";
  const noteText =
    guide.routeNote === "no_gate"
      ? t.noteNoGate
      : guide.routeNote === "landside"
        ? t.noteLandside
        : guide.routeNote === "other_terminal"
          ? t.noteOtherTerminal(t.area[flight.area] ?? flight.area)
          : guide.routeNote === "cancelled"
            ? t.noteCancelled
            : "";

  // ── 길 안내 ──
  if (view.kind === "route") {
    const target = view.target;
    const route =
      target.type === "gate"
        ? guide.gateRoute
        : (guide.facilities.find((f) => f.kind === target.kind && f.nearGate === target.nearGate)?.route ?? null);
    // 탑승구가 바뀌어 보던 길이 없어졌으면 첫 화면으로 돌려보낸다. 거기에 바뀐 탑승구가 나온다.
    if (!route || (target.type === "gate" && flight.gate !== target.gate)) {
      return (
        <>
          <Redirect onGo={() => setView({ kind: "home" })} />
          {call}
        </>
      );
    }
    const title = targetTitle(target, t);
    return (
      <>
        <FlowShell
          lang={lang}
          prefs={prefs}
          kiosk
          screenKey={`route-${target.type === "gate" ? target.gate : `${target.kind}-${target.nearGate}`}`}
          speakText={[title, t.routeSummary(route.minutes, route.meters), ...routeLines(route, target, t)].join(". ")}
          onBack={() => setView({ kind: "home" })}
          onHome={reset}
        >
          <h1>{title}</h1>
          <p className="lead">
            <RouteSummary route={route} t={t} />
          </p>
          {target.type === "gate" && guide.pace && (
            <p className={`pace pace-${guide.pace}`} role={guide.pace === "late" ? "alert" : undefined}>
              {closeText(flight, t)} · {paceText(guide.pace, t)}
            </p>
          )}
          <RouteSteps route={route} target={target} from={here} t={t} />
          <button className="btn finish-btn" onClick={() => setView({ kind: "home" })}>
            {t.guideBack}
          </button>
          <p className="fine">{t.mock}</p>
        </FlowShell>
        {call}
        {idle}
      </>
    );
  }

  // ── 안내 첫 화면: 내 항공편, 탑승구 가는 길, 자주 찾는 시설 ──
  const chosen = guide.facilities.filter((f) => f.chosen);
  const others = guide.facilities.filter((f) => !f.chosen);
  const speakHome = [
    t.guideHello,
    `${flight.flightNo}, ${destOf(flight, lang)}`,
    `${t.gate} ${flight.gate ?? t.gateTbd}`,
    // 화면의 항공편 판과 같은 말로 읽는다(내일 떠나는 편이면 "내일"을 붙인다).
    departureText(flight, t),
    closeText(flight, t),
    flight.prevGate !== null && flight.gate !== null ? t.gateChanged(flight.prevGate, flight.gate) : "",
    guide.gateRoute ? `${t.toGateShort}, ${t.routeSummary(guide.gateRoute.minutes, guide.gateRoute.meters)}. ${paceText(guide.pace, t)}` : noteText,
    chosen.length > 0 ? `${t.myPlaces}: ${chosen.map((f) => `${t.facility[f.kind]}, ${t.routeSummary(f.route.minutes, f.route.meters)}`).join(". ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const tile = (f: GuideFacility) => (
    <button
      key={`${f.kind}-${f.nearGate}`}
      className={`tile ${f.chosen ? "tile-chosen" : ""}`}
      onClick={() => setView({ kind: "route", target: { type: "facility", kind: f.kind, nearGate: f.nearGate, level: f.level } })}
    >
      <span className="tile-ico">
        <FacilityIcon kind={f.kind} size={30} />
      </span>
      <span className="tile-text">
        <strong>{t.facility[f.kind]}</strong>
        <span>
          {t.routeSummary(f.route.minutes, f.route.meters)} · {t.nearGate(f.nearGate)}
        </span>
      </span>
      <ChevronRight size={24} aria-hidden="true" />
    </button>
  );

  return (
    <>
      <FlowShell
        lang={lang}
        prefs={prefs}
        kiosk
        screenKey="home"
        speakText={speakHome}
        onHome={reset}
      >
        <p className="kicker">{t.guideHello}</p>
        <FlightBoard flight={flight} t={t} lang={lang} />
        {offlineNow ? <Banner role="status">{t.kioskOffline}</Banner> : guide.poll.stale && <Banner role="status">{t.stale}</Banner>}

        {guide.gateRoute && flight.gate !== null ? (
          <button className={`gate-go pace-${guide.pace ?? "ok"}`} onClick={() => setView({ kind: "route", target: { type: "gate", gate: flight.gate as number } })}>
            <span className="gate-go-ico">
              <Navigation size={32} aria-hidden="true" />
            </span>
            <span className="gate-go-text">
              <strong>{t.toGate(flight.gate)}</strong>
              <RouteSummary route={guide.gateRoute} t={t} />
              {guide.pace && <span className="gate-go-pace">{paceText(guide.pace, t)}</span>}
            </span>
            <ChevronRight size={28} aria-hidden="true" />
          </button>
        ) : (
          noteText && <Banner role="status">{noteText}</Banner>
        )}

        {chosen.length > 0 && (
          <>
            <h2>{otherTerminal ? t.nearHere : t.myPlaces}</h2>
            <div className="tiles">{chosen.map(tile)}</div>
          </>
        )}
        {others.length > 0 && (
          <>
            {/* 고른 시설이 없으면 이 목록은 이 자리에서 종류마다 가장 가까운 곳이다. 영어의 myPlaces 는 "Places you chose"라
                고르지 않은 여객에게 틀린 말이 되므로, 고른 것이 없을 때는 "가까운 시설"이라고 밝힌다. */}
            <h2>{chosen.length > 0 ? t.otherPlaces : t.nearHere}</h2>
            <div className="tiles tiles-small">{others.map(tile)}</div>
          </>
        )}
        <button className="btn finish-btn" onClick={() => setView({ kind: "survey" })}>
          {t.finish}
        </button>
        <p className="fine">
          {here} · {t.mock}
        </p>
      </FlowShell>
      {call}
      {idle}
    </>
  );
}

/** 그리는 도중에 화면을 바꿀 수는 없어서, 그린 직후에 바꾼다. */
function Redirect({ onGo }: { onGo: () => void }) {
  const ref = useRef(onGo);
  ref.current = onGo;
  useEffect(() => ref.current(), []);
  return null;
}
