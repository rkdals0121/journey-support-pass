"use client";

import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  Frown,
  Keyboard,
  Meh,
  Navigation,
  Pencil,
  Smile,
  Sunrise,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GATE_LEVEL } from "@/lib/airport";
import { isAdapted, prefsOf, type Prefs } from "@/lib/catalog";
import type { GuideDto, GuideFacility } from "@/lib/guide";
import { textOf, type Lang } from "@/lib/i18n";
import {
  isBoardingScan,
  extractToken,
  PASS_NO_LENGTH,
} from "@/lib/pass-format";
import { Banner, ErrorNote } from "../../components/Alert";
import { FlowShell } from "../../components/FlowShell";
import {
  FlightBoard,
  closeText,
  departureText,
  destOf,
  paceText,
  routeLines,
  RouteSteps,
  RouteSummary,
  targetTitle,
  type RouteTarget,
} from "../../components/GuideParts";
import { IdleGuard } from "../../components/IdleGuard";
import { NumPad } from "../../components/Inputs";
import { FacilityIcon } from "../../components/NeedIcon";
import { Scanner } from "../../components/Scanner";
import { RegisterFlow } from "../../components/RegisterFlow";
import { SavedNeeds, savedNeedsText } from "../../components/SavedNeeds";
import { StaffCall } from "../../components/StaffCall";
import { TaskLauncher } from "../../components/TaskLauncher";
import Link from "next/link";
import { kioskHelpHref } from "@/lib/help-entry";
import { useRobotTheme } from "../../components/useRobotTheme";
import { useSpeech } from "../../components/useSpeech";
import {
  resetViewSettings,
  useViewSettings,
} from "../../components/viewSettings";

interface Props {
  initialLang?: Lang;
  placeLabel: string;
  placeLabelEn: string;
  refreshSec: number;
  idleAskSec: number;
  idleAnswerSec: number;
}

// saved: 탑승권을 읽은 뒤 맨 먼저 띄우는 "미리 등록하신 내용"과 "고칠 것이 있으신가요?"(피드백 3). edit: 같은 체크리스트 질문으로 고치기.
type View =
  | { kind: "scan" }
  | { kind: "number" }
  | { kind: "saved" }
  | { kind: "edit" }
  | { kind: "home" }
  | { kind: "route"; target: RouteTarget }
  | { kind: "survey" }
  | { kind: "thanks" };

const NO_PREFS: Prefs = {
  large: false,
  voice: false,
  picture: false,
  easy: false,
  slow: false,
  wantsStaff: false,
};
const THANKS_MS = 3500;
const ERROR_SHOW_MS = 6000;
// 안내를 끝낸 여객이 QR 을 아직 카메라 앞에 들고 있어도 곧바로 다시 열리지 않게, 방금 끝낸 패스는 잠시 읽지 않는다.
const SAME_PASS_GUARD_MS = 8000;
// 다시 받기(그리고 QR·번호 확인) 한 번을 기다리는 가장 긴 시간. 약한 와이파이에서 답이 오지 않는 요청을 끝없이 붙잡지 않는다.
const REFRESH_TIMEOUT_MS = 15_000;
// 키오스크 설치(로그인)가 풀려 서버가 401 로 답하면 설치 화면으로 보낸다. 이 기기로는 더 QR 을 확인할 수 없다.
const KIOSK_SETUP = "/kiosk";

/**
 * 안내 키오스크. 여객이 탑승권을 대거나 번호를 누르면, 미리 등록한 내용을 먼저 보여 주고 고칠 것이 있는지 묻는다.
 * 그 뒤 그 여객이 고른 대로 화면이 바뀌고 길과 시설을 안내한다. 여객이 따로 QR 을 들고 올 일은 없다(피드백 2):
 * 체크인할 때 전자토큰이 탑승권에 저장되고, 키오스크는 탑승권 바코드로 등록을 찾는다.
 * 한 페이지 안에서 처음 화면 → 등록 내용 확인(고치기) → 안내 → 끝내기 → 처음 화면으로 돈다. 끝내면 앞사람의 내용은 화면에서 지운다.
 */
export function GuideKiosk({
  initialLang = "ko",
  placeLabel,
  placeLabelEn,
  refreshSec,
  idleAskSec,
  idleAnswerSec,
}: Props) {
  useRobotTheme();
  const [view, setView] = useState<View>({ kind: "scan" });
  const [scanOpen, setScanOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [guide, setGuide] = useState<GuideDto | null>(null);
  const [startLang, setStartLang] = useState<Lang>(initialLang);
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  // 키오스크에서 고친 내용을 저장했는지. 안내 첫 화면에 한 번 알린다.
  const [edited, setEdited] = useState(false);
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

  // QR 을 찍는 화면이나 번호판처럼 안내가 아직 열리지 않은 화면에서 누른 호출은, 부른 사람이 떠나고 다음 여객이 QR 을 찍었을 수 있다.
  // 그 호출이 다음 여객의 안내까지 자동 종료를 막으면, 그 여객의 항공편과 고른 시설이 공용 화면에 남는다.
  // 그래서 부른 뒤 아무도 화면을 건드리지 않은 채 idleAskSec 이 지났으면(떠났다고 본다) 열리는 안내의 자동 종료를 막지 않는다(아래 open).
  // 부른 여객이 그사이 화면을 계속 쓰다가 자기 안내를 열었으면 그대로 그 여객의 호출이다. 직원을 기다리는 동안 「계속 이용하시겠어요?」를 묻지 않는다.
  // 마지막으로 화면을 건드린 때. IdleGuard 가 보는 것과 같은 누름을 본다. QR 을 찍는 것은 건드린 것이 아니다.
  const lastTouch = useRef(0);
  // 빈 화면에서 누른 호출. left 는 그 뒤 아무도 건드리지 않은 채 idleAskSec 이 지난 적이 있는지다.
  const emptyCall = useRef<{ left: boolean } | null>(null);
  useEffect(() => {
    const touch = () => {
      const now = Date.now();
      if (
        emptyCall.current &&
        !emptyCall.current.left &&
        now - lastTouch.current >= idleAskSec * 1000
      ) {
        emptyCall.current.left = true;
        // 부른 사람이 떠난 뒤의 첫 누름이다(다음 사람). 그 사람이 무엇을 고르기 전에, 떠난 사람이 바꿔 둔 소리·글자 크기·언어를 지운다.
        // 안내를 열 때 지우면 다음 사람이 그사이 고른 언어와 소리까지 지워진다.
        resetViewSettings();
        setStartLang("ko");
      }
      lastTouch.current = now;
    };
    // 화면의 단추보다 먼저 듣는다(capture). 안내를 여는 누름(여섯째 숫자)이 단추에 닿기 전에 그 앞의 빈 시간을 잰다.
    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
      "click",
    ] as const;
    events.forEach((e) =>
      window.addEventListener(e, touch, { capture: true, passive: true }),
    );
    return () =>
      events.forEach((e) =>
        window.removeEventListener(e, touch, { capture: true }),
      );
  }, [idleAskSec]);
  // 빈 화면에서 부른 사람이 at(안내를 연 누름이나 QR 을 찍은 때)까지 떠나 있었는지.
  const callerLeft = useCallback(
    (at: number) => {
      const c = emptyCall.current;
      return (
        c !== null && (c.left || at - lastTouch.current >= idleAskSec * 1000)
      );
    },
    [idleAskSec],
  );

  const lang: Lang = guide ? guide.lang : startLang;
  const prefs = guide ? prefsOf(guide.choices) : NO_PREFS;
  const t = textOf(lang, prefs.easy);
  const { speak, stop } = useSpeech(lang, prefs.slow);
  // 직원 부르기의 상태도 소리로 읽는다. 등록 때 소리를 고르지 않았어도 키오스크에서 소리를 켰으면 읽는다.
  const viewSettings = useViewSettings();
  const voiceOn = viewSettings.voice ?? prefs.voice;
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
    if (tokenRef.current)
      justEnded.current = { token: tokenRef.current, at: Date.now() };
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
    emptyCall.current = null;
    setView({ kind: "scan" });
    setScanOpen(false);
    setToken(null);
    setGuide(null);
    setDigits("");
    setError(null);
    setEdited(false);
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
      // QR 을 찍거나 여섯째 숫자를 누른 때. 빈 화면에서 부른 사람이 이때까지 떠나 있었는지 본다(아래, callerLeft).
      const at = Date.now();
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
        // 빈 화면에서 부른 사람이 떠나 있었으면 그 호출은 이 안내의 자동 종료를 막지 않는다(위 emptyCall). 계속 화면을 쓰던
        // 사람이면 그 사람의 호출로 둔다. 어느 쪽이든 이제 안내가 열렸으니 빈 화면의 호출은 여기서 끝난다.
        // 호출을 놓은 여객이 지금 다시 누르면 다시 그 여객의 호출이 된다.
        if (callerLeft(at)) setCallSeq(null);
        emptyCall.current = null;
        // 안내보다 먼저, 미리 등록한 내용을 보여 주고 고칠 것이 있는지 묻는다(피드백 3).
        setView({ kind: "saved" });
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
    [startLang, callerLeft],
  );

  const onScan = useCallback(
    (text: string) => {
      const scanned = extractToken(text);
      if (!isBoardingScan(text)) {
        setError(textOf(startLang).notQr);
        return;
      }
      const ended = justEnded.current;
      if (
        ended &&
        ended.token === scanned &&
        Date.now() - ended.at < SAME_PASS_GUARD_MS
      )
        return;
      void open({ scanned: text });
    },
    [open, startLang],
  );

  // 여섯 자리를 다 누르면 바로 연다. 버튼을 한 번 더 누르지 않아도 된다.
  useEffect(() => {
    if (view.kind === "number" && digits.length === PASS_NO_LENGTH)
      void open({ passNo: digits });
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
  const viewing =
    view.kind === "home" || view.kind === "route" || view.kind === "saved";
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

  // 처음 화면에는 자동 종료가 없다. 앞사람이 여기서 소리·글자 크기·언어를 바꾸고 떠나면 다음 사람에게 그대로 남아,
  // 다음 사람의 항공편과 고유 일련 번호가 소리로 읽힌다. 아무도 건드리지 않은 채 자동 종료와 같은 시간이 지나면 묻지 않고 되돌린다
  // (화면에 개인 정보가 없어 물을 것이 없다). 직원 호출이 진행 중이면 부른 여객이 기다리는 중일 수 있어 두지 않는다.
  // 번호 화면을 열어 둔 채 떠난 것도 되돌린다. 남겨 두면 카메라가 꺼져 다음 사람이 QR 을 대도 열리지 않는다.
  const leftover =
    viewSettings.scale !== null ||
    viewSettings.picture !== null ||
    viewSettings.voice !== null ||
    startLang !== "ko" ||
    view.kind === "number";
  const quietIdle =
    !guide &&
    (view.kind === "scan" || (view.kind === "number" && digits === "")) &&
    leftover &&
    !callActive;
  useEffect(() => {
    if (!quietIdle) return;
    const limit = (idleAskSec + idleAnswerSec) * 1000;
    const timer = setInterval(() => {
      if (Date.now() - lastTouch.current >= limit) reset();
    }, 2000);
    return () => clearInterval(timer);
  }, [quietIdle, idleAskSec, idleAnswerSec, reset]);

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
        body: JSON.stringify({
          kind: "survey",
          value,
          adapted: guide ? isAdapted(guide.choices) : false,
        }),
        keepalive: true,
      }).catch(() => {});
    }
    setView({ kind: "thanks" });
  };

  // 「직원 부르기」를 누르면 지금 여객의 호출로 삼는다. 안내가 아직 열리지 않은 빈 화면에서 눌렀으면 그 사실도 적어 둔다(위 emptyCall).
  // 안내를 보던 중에 누른 것은 적지 않는다. 그 여객이 직원을 기다리는 동안 자동 종료는 계속 꺼 둔다.
  const onCallPress = () => {
    lastTouch.current = Date.now();
    emptyCall.current = guide ? null : { left: false };
    setCallSeq(sessionSeq.current);
  };
  const call = (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall
          lang={lang}
          t={t}
          big={prefs.wantsStaff || guide?.routeNote === "other_terminal"}
          token={token}
          screen="guide"
          session={sessionSeq.current}
          onActive={onCallActive}
          onPress={onCallPress}
          say={voiceOn ? speak : undefined}
        />
      </div>
    </div>
  );
  const idle = (
    <IdleGuard
      t={t}
      enabled={
        view.kind !== "scan" &&
        view.kind !== "thanks" &&
        !(view.kind === "number" && digits === "") &&
        !ownCall
      }
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
              // 확인 중이던 번호는 끊고 늦게 온 답도 버린다. 남기면 그 사람이 떠난 뒤 그 사람의 안내가 다음 사람 앞에 열린다.
              openSeq.current++;
              openCtrl.current?.abort();
              busyRef.current = false;
              setBusy(false);
              setDigits("");
              setView({ kind: "scan" });
            }}
            onHome={reset}
          >
            <h1>{t.numberTitle}</h1>
            <p className="lead">{t.numberHint}</p>
            <p className="sr-only" role="status">
              {lang === "en"
                ? `${digits.length} of ${PASS_NO_LENGTH} digits`
                : `${PASS_NO_LENGTH}자리 중 ${digits.length}자리`}
            </p>
            <div className="code-boxes" role="group" aria-label={t.passNo}>
              {Array.from({ length: PASS_NO_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className={`num ${digits[i] ? "filled" : ""} ${i === 2 ? "gap" : ""}`}
                >
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
              onKey={(k) =>
                setDigits((d) =>
                  d.length < PASS_NO_LENGTH && !busy ? d + k : d,
                )
              }
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
        <FlowShell
          lang={lang}
          prefs={prefs}
          kiosk
          screenKey="scan"
          serviceHome
          headerTools={
            <>
              <Link
                className="bar-btn kiosk-header-help"
                href={kioskHelpHref(null, lang, "guidance", "/kiosk/guide")}
              >
                {lang === "en" ? "Staff help" : "직원 도움"}
              </Link>
              <button
                className="bar-btn"
                onClick={() => setStartLang((l) => (l === "en" ? "ko" : "en"))}
                lang={startLang === "en" ? "ko" : "en"}
              >
                {t.otherLang}
              </button>
            </>
          }
          speakText={
            scanOpen
              ? `${t.scanTitle}. ${t.scanBody}`
              : lang === "en"
                ? "Choose a service. Directions, mobility assistance, facility reports or transport."
                : "이용할 서비스를 선택하세요. 길 찾기, 이동 도움, 시설 불편, 교통 주차 서비스를 이용할 수 있어요."
          }
          speakKey={scanOpen ? "boarding" : "services"}
        >
          <div className="kiosk-scan-surface kiosk-taskhome">
            <section className="kiosk-task-heading">
              <p>
                {lang === "en" ? "You are here" : "현재 위치"} · {here}
              </p>
              <h1>
                {lang === "en"
                  ? "What would you like to do?"
                  : "어떤 서비스를 이용하시겠어요?"}
              </h1>
            </section>
            <TaskLauncher en={lang === "en"} returnTo="/kiosk/guide" field />
            <Link
              className="btn kiosk-appointment-link"
              href={"/kiosk/visits" + (lang === "en" ? "?lang=en" : "")}
            >
              {lang === "en"
                ? "Confirm a meeting appointment"
                : "예약 확인번호 입력"}
            </Link>
            <details
              className="kiosk-personalise"
              open={scanOpen}
              onToggle={(e) => setScanOpen(e.currentTarget.open)}
            >
              <summary>
                {lang === "en"
                  ? "Retrieve registered support with a boarding pass"
                  : "탑승권으로 등록한 도움 불러오기"}
              </summary>
              {scanOpen && (
                <div className="kiosk-personalise-content">
                  <div>
                    <h2>
                      {lang === "en"
                        ? "Show the code to the camera"
                        : "탑승권의 코드를 보여 주세요"}
                    </h2>
                    <p>
                      {lang === "en"
                        ? "Use a mobile or paper boarding pass."
                        : "모바일·종이 탑승권을 모두 읽을 수 있어요."}
                    </p>
                    <button
                      className="btn"
                      onClick={() => setView({ kind: "number" })}
                    >
                      <Keyboard aria-hidden="true" />
                      {t.scanNumber}
                    </button>
                    {error && <ErrorNote>{error}</ErrorNote>}
                  </div>
                  <div className="kiosk-scan-camera">
                    <Scanner
                      onScan={onScan}
                      paused={busy}
                      prefer="user"
                      text={{
                        starting: t.camStarting,
                        ready: t.camReady,
                        read: t.camRead,
                        none: t.camNone,
                        switchCamera: t.camSwitch,
                      }}
                    />
                  </div>
                </div>
              )}
            </details>
          </div>
        </FlowShell>
      </>
    );
  }

  // ── 미리 등록하신 내용: 고칠 것이 있는지 먼저 묻는다(피드백 3) ──
  if (view.kind === "saved") {
    return (
      <>
        <FlowShell
          lang={lang}
          prefs={prefs}
          kiosk
          screenKey="saved"
          speakText={[
            t.savedTitle,
            `${guide.flight.flightNo}, ${destOf(guide.flight, lang)}`,
            savedNeedsText(guide.choices, guide.extra, lang, t),
            t.savedAsk,
          ].join(". ")}
          onHome={reset}
          cta={
            <>
              <button
                className="btn btn-primary"
                onClick={() => setView({ kind: "home" })}
              >
                {t.savedKeep}
                <ArrowRight size={24} aria-hidden="true" />
              </button>
              <button className="btn" onClick={() => setView({ kind: "edit" })}>
                <Pencil size={22} aria-hidden="true" />
                {t.savedEdit}
              </button>
            </>
          }
        >
          <p className="kicker">
            <ClipboardList size={20} aria-hidden="true" /> {t.savedTitle}
          </p>
          <h1>{t.savedAsk}</h1>
          <FlightBoard flight={guide.flight} t={t} lang={lang} />
          <SavedNeeds
            choices={guide.choices}
            extra={guide.extra}
            lang={lang}
            t={t}
          />
        </FlowShell>
        {call}
        {idle}
      </>
    );
  }
  if (view.kind === "edit" && token) {
    return (
      <>
        <RegisterFlow
          mode="edit"
          initialLang={lang}
          onExit={reset}
          onBackOut={() => setView({ kind: "saved" })}
          edit={{
            token,
            choices: guide.choices,
            extra: guide.extra,
            onSaved: (g) => {
              setGuide(g);
              setEdited(true);
              setView({ kind: "home" });
            },
          }}
        />
        {call}
        {idle}
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
        <FlowShell
          lang={lang}
          prefs={prefs}
          kiosk
          screenKey="thanks"
          speakText={t.thanks}
          onHome={reset}
        >
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
        : (guide.facilities.find(
            (f) => f.kind === target.kind && f.nearGate === target.nearGate,
          )?.route ?? null);
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
          speakText={[
            title,
            t.routeSummary(route.minutes, route.meters),
            ...routeLines(route, target, t),
          ].join(". ")}
          onBack={() => setView({ kind: "home" })}
          onHome={reset}
        >
          <h1>{title}</h1>
          <p className="lead">
            <RouteSummary route={route} t={t} />
          </p>
          {target.type === "gate" && guide.pace && (
            <p
              className={`pace pace-${guide.pace}`}
              role={guide.pace === "late" ? "alert" : undefined}
            >
              {closeText(flight, t)} · {paceText(guide.pace, t)}
            </p>
          )}
          <RouteSteps route={route} target={target} from={here} t={t} />
          <button
            className="btn finish-btn"
            onClick={() => setView({ kind: "home" })}
          >
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
  // 탑승구 층이 아닌 시설(4층 라운지)은 층을 붙인다. 붙이지 않으면 "26번 탑승구 옆"만 보고 같은 층에서 찾는다.
  const floorOf = (f: GuideFacility) =>
    f.level !== GATE_LEVEL ? t.level(f.level) : "";
  const speakHome = [
    t.guideHello,
    `${flight.flightNo}, ${destOf(flight, lang)}`,
    `${t.gate} ${flight.gate ?? t.gateTbd}`,
    // 화면의 항공편 판과 같은 말로 읽는다(내일 떠나는 편이면 "내일"을 붙인다).
    departureText(flight, t),
    // 화면의 항공편 판처럼 탑승 중이면 그것부터 알린다.
    flight.boardingNow && flight.close === "open" ? t.boardingNow : "",
    closeText(flight, t),
    flight.prevGate !== null && flight.gate !== null
      ? t.gateChanged(flight.prevGate, flight.gate)
      : "",
    guide.gateRoute
      ? `${t.toGateShort}, ${t.routeSummary(guide.gateRoute.minutes, guide.gateRoute.meters)}. ${paceText(guide.pace, t)}`
      : noteText,
    chosen.length > 0
      ? `${t.myPlaces}: ${chosen.map((f) => [t.facility[f.kind], t.routeSummary(f.route.minutes, f.route.meters), floorOf(f)].filter(Boolean).join(", ")).join(". ")}`
      : "",
  ]
    .filter(Boolean)
    .join(". ");

  const tile = (f: GuideFacility) => (
    <button
      key={`${f.kind}-${f.nearGate}`}
      className={`tile ${f.chosen ? "tile-chosen" : ""}`}
      onClick={() =>
        setView({
          kind: "route",
          target: {
            type: "facility",
            kind: f.kind,
            nearGate: f.nearGate,
            level: f.level,
          },
        })
      }
    >
      <span className="tile-ico">
        <FacilityIcon kind={f.kind} size={30} />
      </span>
      <span className="tile-text">
        <strong>{t.facility[f.kind]}</strong>
        <span>
          {t.routeSummary(f.route.minutes, f.route.meters)} ·{" "}
          {t.nearGate(f.nearGate)}
          {floorOf(f) && ` · ${floorOf(f)}`}
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
        // 탑승구가 바뀌거나, 늦어질 것 같거나, 인터넷이 끊기면 소리 안내를 켠 여객에게 다시 읽어 준다.
        speakKey={`${flight.gate ?? ""}-${guide.pace ?? ""}-${offlineNow}`}
        onHome={reset}
      >
        {/* 이 화면의 제목. 화면이 바뀌면 초점이 제목으로 온다. 제목이 없으면 초점이 사라져 화면 읽기 프로그램이 어디인지 모른다. */}
        <h1 className="kicker">{t.guideHello}</h1>
        {edited && <Banner role="status">{t.editSaved}</Banner>}
        <FlightBoard flight={flight} t={t} lang={lang} />
        {offlineNow ? (
          <Banner role="status">{t.kioskOffline}</Banner>
        ) : (
          guide.poll.stale && <Banner role="status">{t.stale}</Banner>
        )}

        {guide.gateRoute && flight.gate !== null ? (
          <button
            className={`gate-go pace-${guide.pace ?? "ok"}`}
            onClick={() =>
              setView({
                kind: "route",
                target: { type: "gate", gate: flight.gate as number },
              })
            }
          >
            <span className="gate-go-ico">
              <Navigation size={32} aria-hidden="true" />
            </span>
            <span className="gate-go-text">
              <strong>{t.toGate(flight.gate)}</strong>
              <RouteSummary route={guide.gateRoute} t={t} />
              {guide.pace && (
                <span className="gate-go-pace">{paceText(guide.pace, t)}</span>
              )}
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
        <button className="btn" onClick={() => setView({ kind: "saved" })}>
          <ClipboardList size={22} aria-hidden="true" />
          {t.savedTitle}
        </button>
        <button
          className="btn finish-btn"
          onClick={() => setView({ kind: "survey" })}
        >
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
