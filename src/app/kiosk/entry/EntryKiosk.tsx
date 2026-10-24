"use client";

import { ArrowRight, Baby, BookOpen, CarFront, ClipboardCheck, Ear, Eye, Footprints, Navigation, Pencil, PersonStanding, Ticket, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { labelOf, prefsOf } from "@/lib/catalog";
import type { Target } from "@/lib/docscan";
import type { GuideDto } from "@/lib/guide";
import { textOf, type Lang } from "@/lib/i18n";
import { ErrorNote } from "../../components/Alert";
import { DocScan } from "../../components/DocScan";
import { FlowShell } from "../../components/FlowShell";
import { FlightBoard } from "../../components/GuideParts";
import { IdleGuard } from "../../components/IdleGuard";
import { Choice } from "../../components/Inputs";
import { ListenStart } from "../../components/ListenStart";
import { RegisterFlow } from "../../components/RegisterFlow";
import { Robot } from "../../components/Robot";
import { SavedNeeds, savedNeedsText } from "../../components/SavedNeeds";
import { Scanner } from "../../components/Scanner";
import { StaffCall } from "../../components/StaffCall";
import { useRobotTheme } from "../../components/useRobotTheme";
import { useSpeech } from "../../components/useSpeech";
import { resetViewSettings, useViewSettings } from "../../components/viewSettings";

// 공항 입구의 교통약자 전용 안내 키오스크(안내로봇). 참고 그림 "탑승권으로 깨우는 공항 도우미"의 흐름이다.
//  1. 탑승권 스캔: 로봇이 자다가 탑승권을 찍으면 깨어난다.
//  2. 필요한 도움 확인: 미리 등록한 여객은 고른 도움을 확인하고, 등록하지 않은 여객은 그 자리에서 불편을 고르고
//     서류를 인식시켜(이 기기 안에서) 등록한다. 토큰은 찍은 탑승권에 잇는다.
//  3. 서비스 연결: 맞춤 안내, 이동지원(전동차) 요청, 접수 상태 확인.

const REQ_TIMEOUT_MS = 15_000;
const STATUS_POLL_MS = 5_000;

// 그 자리에서 고르는 불편. 체크리스트 1쪽의 묶음 이름을 그대로 쓰고, 고르면 화면과 길 안내가 달라지도록 가지 안의 답을 함께 넣는다.
// 자세한 답은 등록한 뒤 「고치기」에서 체크리스트 질문 그대로 고칠 수 있다.
const EASY = [
  { key: "walk", codes: ["tr_walk", "mov_no_stairs", "mov_need_rest"], Icon: Footprints },
  { key: "stand", codes: ["tr_stand", "mov_no_standing"], Icon: PersonStanding },
  { key: "see", codes: ["tr_see", "gd_large"], Icon: Eye },
  { key: "hear", codes: ["tr_hear", "hear_text"], Icon: Ear },
  { key: "understand", codes: ["tr_understand", "gd_easy", "gd_picture"], Icon: BookOpen },
  { key: "child", codes: ["tr_child", "chd_diaper"], Icon: Baby },
] as const;
const easyLabel = (e: (typeof EASY)[number], lang: Lang) => labelOf(e.codes[0], lang);
type EasyKey = (typeof EASY)[number]["key"];
const TARGETS: Target[] = ["elderly", "infant", "disabled", "pregnant"];

interface FlightLite {
  flightNo: string;
  destName: string;
  time: string;
  day: "today" | "tomorrow";
}
interface AssistDto {
  state: "received" | "assigned" | "moving" | "done" | "cancelled";
  time: string;
  place: string;
}

type View =
  | { kind: "sleep" }
  | { kind: "nopass" }
  | { kind: "confirm"; token: string; guide: GuideDto }
  | { kind: "edit"; token: string; guide: GuideDto }
  | { kind: "ask"; boarding: string; flight: FlightLite }
  | { kind: "proof"; boarding: string; flight: FlightLite }
  | { kind: "consent"; boarding: string; flight: FlightLite }
  | { kind: "declined" }
  | { kind: "services"; token: string; guide: GuideDto }
  | { kind: "guide"; token: string; guide: GuideDto }
  | { kind: "assist"; token: string; guide: GuideDto; request: AssistDto | null };

interface Props {
  placeLabel: string;
  placeLabelEn: string;
  idleAskSec: number;
  idleAnswerSec: number;
}

async function post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const limit = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(limit);
  }
}

export function EntryKiosk({ placeLabel, placeLabelEn, idleAskSec, idleAnswerSec }: Props) {
  useRobotTheme();
  const [lang, setLang] = useState<Lang>("ko");
  const [view, setView] = useState<View>({ kind: "sleep" });
  const [picks, setPicks] = useState<EasyKey[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [proofOk, setProofOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 다음 여객으로 넘어갈 때마다 올린다. 늦게 온 답이 다음 사람의 화면을 바꾸지 않게 한다.
  const seq = useRef(0);
  const startedAt = useRef(new Date().toISOString());

  const pickedCodes = EASY.filter((e) => picks.includes(e.key)).flatMap((e) => e.codes);
  const choices = "guide" in view ? view.guide.choices : pickedCodes;
  const prefs = prefsOf(choices);
  const t = textOf(lang, prefs.easy);
  const { speak, stop } = useSpeech(lang, prefs.slow);
  const voiceOn = useViewSettings().voice ?? prefs.voice;
  const here = lang === "en" ? placeLabelEn : placeLabel;
  const token = "token" in view ? view.token : null;

  const reset = useCallback(() => {
    seq.current++;
    setView({ kind: "sleep" });
    setPicks([]);
    setTarget(null);
    setProofOk(false);
    setBusy(false);
    setError(null);
    setLang("ko");
    resetViewSettings();
  }, []);

  const failed = (status: number, body: Record<string, unknown>) => {
    if (status === 401) return window.location.replace("/kiosk");
    setError(typeof body.error === "string" ? (lang === "en" ? t.failed : body.error) : t.failed);
  };

  const onScan = useCallback(
    async (scanned: string) => {
      if (busy) return;
      const mine = ++seq.current;
      setBusy(true);
      setError(null);
      try {
        const res = await post("/api/kiosk/entry", { scanned });
        if (mine !== seq.current) return;
        if (res.status !== 200) return failed(res.status, res.body);
        startedAt.current = new Date().toISOString();
        if (res.body.registered) {
          const guide = res.body.guide as GuideDto;
          setLang(guide.lang);
          setView({ kind: "confirm", token: res.body.token as string, guide });
        } else {
          setView({ kind: "ask", boarding: res.body.boarding as string, flight: res.body.flight as FlightLite });
        }
      } catch {
        if (mine === seq.current) setError(t.offline);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, lang],
  );

  async function register(boarding: string) {
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const res = await post("/api/kiosk/onsite", { boarding, choices: pickedCodes, lang, consent: true, proof: proofOk, startedAt: startedAt.current });
      if (mine !== seq.current) return;
      if (res.status !== 200) return failed(res.status, res.body);
      setView({ kind: "services", token: res.body.token as string, guide: res.body.guide as GuideDto });
    } catch {
      if (mine === seq.current) setError(t.offline);
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }

  async function assist(action: "request" | "status" | "cancel", tok: string, guide: GuideDto) {
    const mine = seq.current;
    setBusy(true);
    setError(null);
    try {
      const url = action === "request" ? "/api/assist" : action === "status" ? "/api/assist/status" : "/api/assist/cancel";
      const res = await post(url, { token: tok });
      if (mine !== seq.current) return;
      if (res.status !== 200) return failed(res.status, res.body);
      setView({ kind: "assist", token: tok, guide, request: (res.body.request as AssistDto | null) ?? null });
    } catch {
      if (mine === seq.current) setError(t.offline);
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }

  // 접수 상태 화면에서는 끝날 때까지 5초마다 다시 본다.
  const assistOpen = view.kind === "assist" && view.request !== null && ["received", "assigned", "moving"].includes(view.request.state);
  const assistKey = view.kind === "assist" ? view.token : null;
  useEffect(() => {
    if (!assistOpen || !assistKey || view.kind !== "assist") return;
    const mine = seq.current;
    const { guide } = view;
    const timer = setInterval(async () => {
      try {
        const res = await post("/api/assist/status", { token: assistKey });
        if (mine !== seq.current || res.status !== 200) return;
        setView((v) => (v.kind === "assist" && v.token === assistKey ? { ...v, guide, request: (res.body.request as AssistDto | null) ?? null } : v));
      } catch {
        // 한 번 못 읽은 것은 다음 차례에 다시 읽는다.
      }
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistOpen, assistKey]);

  const call = (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall t={t} big={prefs.wantsStaff} token={token} screen="guide" session={seq.current} say={voiceOn ? speak : undefined} />
      </div>
    </div>
  );
  const idle = (
    <IdleGuard
      t={t}
      enabled={view.kind !== "sleep"}
      askSec={idleAskSec}
      answerSec={idleAnswerSec}
      onTimeout={reset}
      say={voiceOn ? speak : undefined}
      hush={voiceOn ? stop : undefined}
    />
  );
  const shell = (key: string, speakText: string, body: React.ReactNode, cta?: React.ReactNode, onBack?: () => void) => (
    <FlowShell lang={lang} prefs={prefs} kiosk screenKey={key} speakText={speakText} onBack={onBack ?? reset} onHome={reset} cta={cta}>
      {body}
      {error && <ErrorNote>{error}</ErrorNote>}
    </FlowShell>
  );
  const bubble = (mood: "sleep" | "awake" | "happy", text: string) => (
    <div className="robot-stage">
      <Robot mood={mood} size={mood === "sleep" ? 200 : 160} />
      <p className="robot-bubble">{text}</p>
    </div>
  );

  let screen: React.ReactNode;
  if (view.kind === "sleep") {
    screen = shell(
      "sleep",
      `${t.entrySleep} ${t.entrySleepHint}`,
      <div className="robot-home">
        <div className="robot-panel">
          <p className="robot-title">{t.entryTitle}</p>
          <h1 className="sr-only">{t.entrySleep}</h1>
          <div className="robot-stage">
            <Robot mood="sleep" size={260} />
            <p className="robot-bubble">{t.entrySleep}</p>
          </div>
        </div>
        <div className="robot-scan">
          <Scanner
            onScan={(s) => void onScan(s)}
            paused={busy}
            prefer="user"
            text={{ starting: t.camStarting, ready: t.entrySleepHint, read: t.camRead, none: t.entryCamNone, switchCamera: t.camSwitch }}
          />
        </div>
        <div className="robot-actions">
          <ListenStart t={t} />
          <button className="btn" onClick={() => setView({ kind: "nopass" })}>
            <Ticket size={22} aria-hidden="true" />
            {t.entryNoPass}
          </button>
          <button className="lang-switch" onClick={() => setLang((l) => (l === "en" ? "ko" : "en"))} lang={lang === "en" ? "ko" : "en"}>
            {t.otherLang}
          </button>
        </div>
        <p className="kiosk-foot">{here}</p>
      </div>,
    );
  } else if (view.kind === "nopass") {
    screen = shell("nopass", `${t.entryNoPass}. ${t.entryNoPassBody}`, <>{bubble("awake", t.entryNoPass)}<h1>{t.entryNoPass}</h1><p className="lead">{t.entryNoPassBody}</p></>);
  } else if (view.kind === "confirm") {
    // 미리 등록한 내용을 먼저 보여 주고, 고칠 것이 있으면 체크리스트 질문 그대로 고친다(피드백 3).
    screen = shell(
      "confirm",
      [t.entryWake, t.savedTitle, savedNeedsText(view.guide.choices, view.guide.extra, lang, t), t.savedAsk].join(". "),
      <>
        {bubble("happy", t.entryWake)}
        <h1>{t.savedTitle}</h1>
        <p className="lead">{t.savedAsk}</p>
        <FlightBoard flight={view.guide.flight} t={t} lang={lang} />
        <SavedNeeds choices={view.guide.choices} extra={view.guide.extra} lang={lang} t={t} />
      </>,
      <>
        <button className="btn btn-primary" onClick={() => setView({ kind: "services", token: view.token, guide: view.guide })}>
          {t.entryConfirmOk}
          <ArrowRight size={24} aria-hidden="true" />
        </button>
        <button className="btn" onClick={() => setView({ kind: "edit", token: view.token, guide: view.guide })}>
          <Pencil size={22} aria-hidden="true" />
          {t.savedEdit}
        </button>
      </>,
    );
  } else if (view.kind === "edit") {
    const { token: tok, guide } = view;
    screen = (
      <RegisterFlow
        mode="edit"
        initialLang={lang}
        onExit={reset}
        onBackOut={() => setView({ kind: "confirm", token: tok, guide })}
        edit={{
          token: tok,
          choices: guide.choices,
          extra: guide.extra,
          onSaved: (g) => setView({ kind: "services", token: tok, guide: g }),
        }}
      />
    );
  } else if (view.kind === "ask") {
    screen = shell(
      "ask",
      [t.entryWake, t.entryAskTitle, t.entryAskHint, ...EASY.map((e) => easyLabel(e, lang))].join(". "),
      <>
        {bubble("awake", t.entryWake)}
        <h1>{t.entryAskTitle}</h1>
        <p className="lead">
          {view.flight.flightNo} · {view.flight.destName} · {view.flight.day === "today" ? t.today : t.tomorrow} {view.flight.time}
        </p>
        <p className="muted">{t.entryAskHint}</p>
        <div className="easy-grid" role="group" aria-label={t.entryAskTitle}>
          {EASY.map((e) => (
            <button
              key={e.key}
              role="checkbox"
              aria-checked={picks.includes(e.key)}
              className={picks.includes(e.key) ? "easy-tile on" : "easy-tile"}
              onClick={() => setPicks((p) => (p.includes(e.key) ? p.filter((k) => k !== e.key) : [...p, e.key]))}
            >
              <e.Icon size={40} aria-hidden="true" />
              {easyLabel(e, lang)}
            </button>
          ))}
        </div>
      </>,
      <button className="btn btn-primary" onClick={() => setView({ kind: "proof", boarding: view.boarding, flight: view.flight })}>
        {picks.length === 0 ? t.skip : t.next}
        <ArrowRight size={24} aria-hidden="true" />
      </button>,
    );
  } else if (view.kind === "proof") {
    screen = shell(
      "proof",
      [t.entryProofTitle, t.entryProofHint, t.proofDemo].join(". "),
      <>
        <h1>{t.entryProofTitle}</h1>
        <p className="lead">{t.entryProofHint}</p>
        <div className="choices" role="radiogroup" aria-label={t.steps.target}>
          {TARGETS.map((x) => (
            <Choice
              key={x}
              code={`tg_${x}`}
              label={`${t.targets[x]} · ${t.proofDocs[x]}`}
              single
              checked={target === x}
              onToggle={() => {
                setTarget((cur) => (cur === x ? null : x));
                setProofOk(false);
              }}
            />
          ))}
        </div>
        {target && <DocScan key={target} target={target} t={t} mode="kiosk" onResult={setProofOk} />}
        <p className="fine">{t.proofDemo}</p>
      </>,
      <button className="btn btn-primary" onClick={() => setView({ kind: "consent", boarding: view.boarding, flight: view.flight })}>
        {proofOk ? t.next : t.entryProofSkip}
        <ArrowRight size={24} aria-hidden="true" />
      </button>,
      () => setView({ kind: "ask", boarding: view.boarding, flight: view.flight }),
    );
  } else if (view.kind === "consent") {
    screen = shell(
      "consent",
      `${t.entryConsentTitle}. ${t.entryConsentBody}`,
      <>
        <h1>{t.entryConsentTitle}</h1>
        <p className="lead">{t.entryConsentBody}</p>
      </>,
      <>
        <button className="btn btn-primary" onClick={() => void register(view.boarding)} disabled={busy} aria-busy={busy}>
          {busy ? t.entryRegistering : t.entryAgree}
        </button>
        <button className="btn btn-ghost" onClick={() => setView({ kind: "declined" })} disabled={busy}>
          {t.entryDecline}
        </button>
      </>,
      () => setView({ kind: "proof", boarding: view.boarding, flight: view.flight }),
    );
  } else if (view.kind === "declined") {
    screen = shell("declined", t.entryDeclined, <><h1>{t.entryDecline}</h1><p className="lead">{t.entryDeclined}</p></>, <button className="btn btn-primary" onClick={reset}>{t.entryEnd}</button>);
  } else if (view.kind === "services") {
    const { token: tok, guide } = view;
    screen = shell(
      "services",
      [t.entryServicesTitle, t.svcGuide, t.svcAssist, t.svcStatus].join(". "),
      <>
        {bubble("happy", t.entryServicesTitle)}
        <h1 className="sr-only">{t.entryServicesTitle}</h1>
        <div className="svc-grid">
          <button className="svc-card" onClick={() => setView({ kind: "guide", token: tok, guide })}>
            <Navigation size={36} aria-hidden="true" />
            <strong>{t.svcGuide}</strong>
            <span>{t.svcGuideBody}</span>
          </button>
          <button className="svc-card" onClick={() => void assist("request", tok, guide)} disabled={busy}>
            <CarFront size={36} aria-hidden="true" />
            <strong>{t.svcAssist}</strong>
            <span>{t.svcAssistBody}</span>
          </button>
          <button className="svc-card" onClick={() => void assist("status", tok, guide)} disabled={busy}>
            <ClipboardCheck size={36} aria-hidden="true" />
            <strong>{t.svcStatus}</strong>
            <span>{t.svcStatusBody}</span>
          </button>
        </div>
      </>,
      <button className="btn" onClick={reset}>
        {t.entryEnd}
      </button>,
    );
  } else if (view.kind === "guide") {
    const { token: tok, guide } = view;
    screen = shell(
      "guide",
      [t.svcGuide, t.noteLandside].join(". "),
      <>
        <h1>{t.svcGuide}</h1>
        <FlightBoard flight={guide.flight} t={t} lang={lang} />
        <p className="lead">{t.noteLandside}</p>
        <SavedNeeds choices={guide.choices} extra={guide.extra} lang={lang} t={t} />
      </>,
      <button className="btn btn-primary" onClick={() => setView({ kind: "services", token: tok, guide })}>
        {t.back}
      </button>,
      () => setView({ kind: "services", token: tok, guide }),
    );
  } else {
    const { token: tok, guide, request } = view;
    const step = request ? ["received", "assigned", "moving", "done"].indexOf(request.state) : -1;
    screen = shell(
      "assist",
      request ? `${t.assistState[request.state]}. ${t.assistStateBody[request.state]}` : t.assistNone,
      <>
        <h1>{t.assistTitle}</h1>
        {request ? (
          <>
            {request.state !== "cancelled" && (
              <ol className="assist-steps" aria-label={t.assistTitle}>
                {t.assistSteps.map((s, i) => (
                  <li key={s} className={i <= step ? "on" : ""} aria-current={i === step ? "step" : undefined}>
                    {s}
                  </li>
                ))}
              </ol>
            )}
            <p className="assist-state" role="status">
              <strong>{t.assistState[request.state]}</strong>
              <span>{t.assistStateBody[request.state]}</span>
            </p>
            <p className="muted">{t.assistAt(request.time, request.place)}</p>
            {(request.state === "received" || request.state === "assigned") && (
              <button className="btn btn-ghost" onClick={() => void assist("cancel", tok, guide)} disabled={busy}>
                <X size={20} aria-hidden="true" />
                {t.assistCancel}
              </button>
            )}
          </>
        ) : (
          <p className="lead">{t.assistNone}</p>
        )}
      </>,
      <button className="btn btn-primary" onClick={() => setView({ kind: "services", token: tok, guide })}>
        {t.back}
      </button>,
      () => setView({ kind: "services", token: tok, guide }),
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
