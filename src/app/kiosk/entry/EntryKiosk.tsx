"use client";

import {
  ArrowRight,
  Baby,
  BookOpen,
  CarFront,
  ClipboardCheck,
  Ear,
  Eye,
  Footprints,
  Keyboard,
  Navigation,
  Pencil,
  PersonStanding,
  ScanLine,
} from "lucide-react";
import Link from "next/link";
import { kioskHelpHref } from "@/lib/help-entry";
import { useCallback, useRef, useState } from "react";
import { labelOf, prefsOf } from "@/lib/catalog";
import type { Target } from "@/lib/docscan";
import type { GuideDto } from "@/lib/guide";
import { textOf, type Lang } from "@/lib/i18n";
import { ErrorNote } from "../../components/Alert";
import { DocScan } from "../../components/DocScan";
import { FlowShell } from "../../components/FlowShell";
import { FlightBoard } from "../../components/GuideParts";
import { IdleGuard } from "../../components/IdleGuard";
import { Choice, NumPad } from "../../components/Inputs";
import { ListenStart } from "../../components/ListenStart";
import { RegisterFlow } from "../../components/RegisterFlow";
import { Robot } from "../../components/Robot";
import { KioskHome } from "../../components/KioskHome";
import { SavedNeeds, savedNeedsText } from "../../components/SavedNeeds";
import { Scanner } from "../../components/Scanner";
import { StaffCall } from "../../components/StaffCall";
import { useRobotTheme } from "../../components/useRobotTheme";
import { useSpeech } from "../../components/useSpeech";
import {
  resetViewSettings,
  useViewSettings,
} from "../../components/viewSettings";

// 공항 입구의 교통약자 전용 안내 키오스크(안내로봇). 참고 그림 "탑승권으로 깨우는 공항 도우미"의 흐름이다.
//  1. 탑승권 스캔: 로봇이 자다가 탑승권을 찍으면 깨어난다.
//  2. 필요한 도움 확인: 미리 등록한 여객은 고른 도움을 확인하고, 등록하지 않은 여객은 그 자리에서 불편을 고르고
//     서류를 인식시켜(이 기기 안에서) 등록한다. 토큰은 찍은 탑승권에 잇는다.
//  3. 서비스 연결: 맞춤 안내, 이동지원(전동차) 요청, 접수 상태 확인.

const REQ_TIMEOUT_MS = 15_000;

// 그 자리에서 고르는 불편. 체크리스트 1쪽의 묶음 이름을 그대로 쓰고, 고르면 화면과 길 안내가 달라지도록 가지 안의 답을 함께 넣는다.
// 자세한 답은 등록한 뒤 「고치기」에서 체크리스트 질문 그대로 고칠 수 있다.
const EASY = [
  {
    key: "walk",
    codes: ["tr_walk", "mov_no_stairs", "mov_need_rest"],
    Icon: Footprints,
  },
  {
    key: "stand",
    codes: ["tr_stand", "mov_no_standing"],
    Icon: PersonStanding,
  },
  { key: "see", codes: ["tr_see", "gd_large"], Icon: Eye },
  { key: "hear", codes: ["tr_hear", "hear_text"], Icon: Ear },
  {
    key: "understand",
    codes: ["tr_understand", "gd_easy", "gd_picture"],
    Icon: BookOpen,
  },
  { key: "child", codes: ["tr_child", "chd_diaper"], Icon: Baby },
] as const;
const easyLabel = (e: (typeof EASY)[number], lang: Lang) =>
  labelOf(e.codes[0], lang);
type EasyKey = (typeof EASY)[number]["key"];
const TARGETS: Target[] = ["elderly", "infant", "disabled", "pregnant"];

interface FlightLite {
  flightNo: string;
  destName: string;
  time: string;
  day: "today" | "tomorrow";
}

type View =
  | { kind: "sleep" }
  | { kind: "confirm"; token: string; guide: GuideDto }
  | { kind: "edit"; token: string; guide: GuideDto }
  | { kind: "ask"; boarding: string; flight: FlightLite }
  | { kind: "proof"; boarding: string; flight: FlightLite }
  | { kind: "consent"; boarding: string; flight: FlightLite }
  | { kind: "declined" }
  | { kind: "services"; token: string; guide: GuideDto }
  | { kind: "guide"; token: string; guide: GuideDto };

interface Props {
  initialLang?: Lang;
  placeLabel: string;
  placeLabelEn: string;
  idleAskSec: number;
  idleAnswerSec: number;
}

async function post(
  url: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const limit = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(limit);
  }
}

export function EntryKiosk({
  initialLang = "ko",
  placeLabel,
  placeLabelEn,
  idleAskSec,
  idleAnswerSec,
}: Props) {
  useRobotTheme();
  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>({ kind: "sleep" });
  const [scanOpen, setScanOpen] = useState(false);
  const [passNo, setPassNo] = useState("");
  const [numberOpen, setNumberOpen] = useState(false);
  const lookupBusy = useRef(false);
  const [picks, setPicks] = useState<EasyKey[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [proofOk, setProofOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 다음 여객으로 넘어갈 때마다 올린다. 늦게 온 답이 다음 사람의 화면을 바꾸지 않게 한다.
  const seq = useRef(0);
  const startedAt = useRef(new Date().toISOString());

  const pickedCodes = EASY.filter((e) => picks.includes(e.key)).flatMap(
    (e) => e.codes,
  );
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
    setScanOpen(false);
    setPassNo("");
    setNumberOpen(false);
    lookupBusy.current = false;
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
    setError(
      typeof body.error === "string"
        ? lang === "en"
          ? t.failed
          : body.error
        : t.failed,
    );
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
          setView({
            kind: "ask",
            boarding: res.body.boarding as string,
            flight: res.body.flight as FlightLite,
          });
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

  async function findNumber() {
    if (lookupBusy.current || busy || !/^\d{6}$/.test(passNo)) return;
    lookupBusy.current = true;
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const res = await post("/api/kiosk/resolve", {
        passNo,
        purpose: "guide",
      });
      if (mine !== seq.current) return;
      if (res.status !== 200) {
        failed(res.status, res.body);
        setPassNo("");
        return;
      }
      const guide = res.body.guide as GuideDto;
      startedAt.current = new Date().toISOString();
      setLang(guide.lang);
      setPassNo("");
      setView({ kind: "confirm", token: res.body.token as string, guide });
    } catch {
      if (mine === seq.current) setError(t.offline);
    } finally {
      if (mine === seq.current) {
        setBusy(false);
        lookupBusy.current = false;
      }
    }
  }

  async function register(boarding: string) {
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const res = await post("/api/kiosk/onsite", {
        boarding,
        choices: pickedCodes,
        lang,
        consent: true,
        proof: proofOk,
        startedAt: startedAt.current,
      });
      if (mine !== seq.current) return;
      if (res.status !== 200) return failed(res.status, res.body);
      setView({
        kind: "services",
        token: res.body.token as string,
        guide: res.body.guide as GuideDto,
      });
    } catch {
      if (mine === seq.current) setError(t.offline);
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }

  const call = (
    <div className="call-dock">
      <div className="call-dock-inner">
        <StaffCall
          lang={lang}
          returnTo="/kiosk/entry"
          t={t}
          big={prefs.wantsStaff}
          token={token}
          screen="guide"
          session={seq.current}
          say={voiceOn ? speak : undefined}
        />
      </div>
    </div>
  );
  const idle = (
    <IdleGuard
      t={t}
      enabled={view.kind !== "sleep" || numberOpen || scanOpen}
      askSec={idleAskSec}
      answerSec={idleAnswerSec}
      onTimeout={reset}
      say={voiceOn ? speak : undefined}
      hush={voiceOn ? stop : undefined}
    />
  );
  const shell = (
    key: string,
    speakText: string,
    body: React.ReactNode,
    cta?: React.ReactNode,
    onBack?: () => void,
  ) => (
    <FlowShell
      lang={lang}
      prefs={prefs}
      kiosk
      screenKey={key}
      serviceHome={key === "sleep"}
      headerTools={
        key === "sleep" ? (
          <button
            className="bar-btn"
            onClick={() => setLang((l) => (l === "en" ? "ko" : "en"))}
            lang={lang === "en" ? "ko" : "en"}
          >
            {t.otherLang}
          </button>
        ) : undefined
      }
      speakText={speakText}
      onBack={onBack ?? reset}
      onHome={reset}
      cta={cta}
    >
      {body}
      {error && !(view.kind === "sleep" && numberOpen) && (
        <ErrorNote>{error}</ErrorNote>
      )}
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
      `${t.entrySleep}. ${lang === "en" ? "Find a gate or request mobility assistance." : "탑승구와 시설을 찾거나 이동 도움을 요청할 수 있어요."} ${scanOpen ? t.entrySleepHint : ""}`,
      <KioskHome
        en={lang === "en"}
        here={here}
        title={t.entrySleep}
        lead={
          lang === "en"
            ? "Find your way or ask for mobility help. If you registered before your trip, show your boarding pass."
            : "길을 찾거나 이동 도움을 받을 수 있어요. 미리 등록하셨다면 탑승권을 보여 주세요."
        }
        figure={
          <div className="kx-robot" aria-hidden="true">
            <Robot mood="awake" size={120} />
            <span>{t.entryTitle}</span>
          </div>
        }
        topics={["guidance", "mobility"]}
        returnTo="/kiosk/entry"
        appointmentLabel={
          lang === "en" ? "Confirm a meeting appointment" : "만남 예약 확인"
        }
        listen={<ListenStart t={t} />}
        pass={
          <>
            <details
              className="robot-pass-entry kx-pass-option"
              open={scanOpen}
              onToggle={(e) => {
                setScanOpen(e.currentTarget.open);
                if (e.currentTarget.open) {
                  setNumberOpen(false);
                  setError(null);
                }
              }}
            >
              <summary>
                <ScanLine aria-hidden="true" className="kx-pass-icon" />
                <span>
                  <strong>
                    {lang === "en"
                      ? "Retrieve saved needs with your boarding pass"
                      : "탑승권으로 등록한 도움 불러오기"}
                  </strong>
                  <small>
                    {lang === "en"
                      ? "For passengers who registered before the trip"
                      : "여행 전에 미리 등록하신 분"}
                  </small>
                </span>
              </summary>
              {scanOpen && (
                <div className="robot-scan kx-pass-body">
                  <Scanner
                    onScan={(s) => void onScan(s)}
                    paused={busy}
                    prefer="user"
                    text={{
                      starting: t.camStarting,
                      ready: t.entrySleepHint,
                      read: t.camRead,
                      none: t.entryCamNone,
                      switchCamera: t.camSwitch,
                    }}
                  />
                </div>
              )}
            </details>
            <details
              className="robot-number-entry kx-pass-option"
              open={numberOpen}
              onToggle={(e) => {
                const open = e.currentTarget.open;
                setNumberOpen(open);
                if (open) {
                  setScanOpen(false);
                  setError(null);
                } else setPassNo("");
              }}
            >
              <summary>
                <Keyboard aria-hidden="true" className="kx-pass-icon" />
                <span>
                  <strong>
                    {lang === "en"
                      ? "Find by registration number"
                      : "고유 일련 번호로 찾기"}
                  </strong>
                  <small>
                    {lang === "en"
                      ? "The 6 digits shown after registering"
                      : "등록을 마치면 받은 숫자 6자리"}
                  </small>
                </span>
              </summary>
              <form
                className="kx-pass-body"
                onSubmit={(e) => {
                  e.preventDefault();
                  void findNumber();
                }}
              >
                <label htmlFor="entry-pass-number">
                  {lang === "en"
                    ? "6-digit registration number"
                    : "고유 일련 번호 6자리"}
                </label>
                <input
                  id="entry-pass-number"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={passNo}
                  disabled={busy}
                  aria-invalid={!!error}
                  aria-describedby={error ? "entry-number-error" : undefined}
                  onChange={(e) =>
                    setPassNo(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                {error && (
                  <div id="entry-number-error">
                    <ErrorNote>{error}</ErrorNote>
                  </div>
                )}
                <fieldset disabled={busy} className="entry-number-pad">
                  <legend className="sr-only">
                    {lang === "en" ? "Number pad" : "숫자 입력판"}
                  </legend>
                  <NumPad
                    onKey={(digit) =>
                      setPassNo((value) => (value + digit).slice(0, 6))
                    }
                    onErase={() => setPassNo((value) => value.slice(0, -1))}
                    eraseLabel={
                      lang === "en" ? "Delete a digit" : "한 자리 지우기"
                    }
                  />
                </fieldset>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || passNo.length !== 6}
                >
                  {busy
                    ? lang === "en"
                      ? "Checking…"
                      : "확인 중…"
                    : lang === "en"
                      ? "Retrieve saved needs"
                      : "등록한 도움 불러오기"}
                </button>
              </form>
            </details>
          </>
        }
      />,
    );
  } else if (view.kind === "confirm") {
    // 미리 등록한 내용을 먼저 보여 주고, 고칠 것이 있으면 체크리스트 질문 그대로 고친다(피드백 3).
    screen = shell(
      "confirm",
      [
        t.entryWake,
        t.savedTitle,
        savedNeedsText(view.guide.choices, view.guide.extra, lang, t),
        t.savedAsk,
      ].join(". "),
      <>
        {bubble("happy", t.entryWake)}
        <h1>{t.savedTitle}</h1>
        <p className="lead">{t.savedAsk}</p>
        <FlightBoard flight={view.guide.flight} t={t} lang={lang} />
        <SavedNeeds
          choices={view.guide.choices}
          extra={view.guide.extra}
          lang={lang}
          t={t}
        />
      </>,
      <>
        <button
          className="btn btn-primary"
          onClick={() =>
            setView({ kind: "services", token: view.token, guide: view.guide })
          }
        >
          {t.entryConfirmOk}
          <ArrowRight size={24} aria-hidden="true" />
        </button>
        <button
          className="btn"
          onClick={() =>
            setView({ kind: "edit", token: view.token, guide: view.guide })
          }
        >
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
      [
        t.entryWake,
        t.entryAskTitle,
        t.entryAskHint,
        ...EASY.map((e) => easyLabel(e, lang)),
      ].join(". "),
      <>
        {bubble("awake", t.entryWake)}
        <h1>{t.entryAskTitle}</h1>
        <p className="lead">
          {view.flight.flightNo} · {view.flight.destName} ·{" "}
          {view.flight.day === "today" ? t.today : t.tomorrow}{" "}
          {view.flight.time}
        </p>
        <p className="muted">{t.entryAskHint}</p>
        <div className="easy-grid" role="group" aria-label={t.entryAskTitle}>
          {EASY.map((e) => (
            <button
              key={e.key}
              role="checkbox"
              aria-checked={picks.includes(e.key)}
              className={picks.includes(e.key) ? "easy-tile on" : "easy-tile"}
              onClick={() =>
                setPicks((p) =>
                  p.includes(e.key)
                    ? p.filter((k) => k !== e.key)
                    : [...p, e.key],
                )
              }
            >
              <e.Icon size={40} aria-hidden="true" />
              {easyLabel(e, lang)}
            </button>
          ))}
        </div>
      </>,
      <button
        className="btn btn-primary"
        onClick={() =>
          setView({
            kind: "proof",
            boarding: view.boarding,
            flight: view.flight,
          })
        }
      >
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
        {target && (
          <DocScan
            key={target}
            target={target}
            t={t}
            mode="kiosk"
            onResult={setProofOk}
          />
        )}
        <p className="fine">{t.proofDemo}</p>
      </>,
      <button
        className="btn btn-primary"
        onClick={() =>
          setView({
            kind: "consent",
            boarding: view.boarding,
            flight: view.flight,
          })
        }
      >
        {proofOk ? t.next : t.entryProofSkip}
        <ArrowRight size={24} aria-hidden="true" />
      </button>,
      () =>
        setView({ kind: "ask", boarding: view.boarding, flight: view.flight }),
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
        <button
          className="btn btn-primary"
          onClick={() => void register(view.boarding)}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? t.entryRegistering : t.entryAgree}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setView({ kind: "declined" })}
          disabled={busy}
        >
          {t.entryDecline}
        </button>
      </>,
      () =>
        setView({
          kind: "proof",
          boarding: view.boarding,
          flight: view.flight,
        }),
    );
  } else if (view.kind === "declined") {
    screen = shell(
      "declined",
      t.entryDeclined,
      <>
        <h1>{t.entryDecline}</h1>
        <p className="lead">{t.entryDeclined}</p>
      </>,
      <button className="btn btn-primary" onClick={reset}>
        {t.entryEnd}
      </button>,
    );
  } else if (view.kind === "services") {
    const { token: tok, guide } = view;
    screen = shell(
      "services",
      [t.entryServicesTitle, t.svcGuide, t.svcAssist, t.svcStatus].join(". "),
      <>
        {bubble("happy", t.entryServicesTitle)}
        <h1 className="sr-only">{t.entryServicesTitle}</h1>
        <div className="svc-grid">
          <button
            className="svc-card"
            onClick={() => setView({ kind: "guide", token: tok, guide })}
          >
            <Navigation size={36} aria-hidden="true" />
            <strong>{t.svcGuide}</strong>
            <span>{t.svcGuideBody}</span>
          </button>
          <Link
            className="svc-card"
            prefetch={false}
            href={kioskHelpHref(tok, lang, "mobility", "/kiosk/entry")}
          >
            <CarFront size={36} aria-hidden="true" />
            <strong>{t.svcAssist}</strong>
            <span>
              {lang === "en"
                ? "Confirm your pickup point and assistance needs before sending."
                : "현재 위치와 필요한 도움을 확인한 뒤 접수합니다."}
            </span>
          </Link>
          <Link
            className="svc-card"
            prefetch={false}
            href={kioskHelpHref(tok, lang, "guidance", "/kiosk/entry", true)}
          >
            <ClipboardCheck size={36} aria-hidden="true" />
            <strong>{t.svcStatus}</strong>
            <span>{t.svcStatusBody}</span>
          </Link>
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
        <SavedNeeds
          choices={guide.choices}
          extra={guide.extra}
          lang={lang}
          t={t}
        />
      </>,
      <button
        className="btn btn-primary"
        onClick={() => setView({ kind: "services", token: tok, guide })}
      >
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
