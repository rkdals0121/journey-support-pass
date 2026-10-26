"use client";

import { ChevronLeft, House, Settings, Volume2, VolumeX } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Prefs } from "@/lib/catalog";
import { textOf, type Lang } from "@/lib/i18n";
import { useFocusTrap } from "./useFocusTrap";
import { useSpeech } from "./useSpeech";
import {
  resetViewSettings,
  SCALES,
  setViewSettings,
  useViewSettings,
} from "./viewSettings";

const SETTLE_MS = 500;
// 마지막으로 사람이 화면을 누른 시각. 화면이 "누름 때문에" 바뀌었는지 가리는 데 쓴다.
let lastTapAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.isTrusted) lastTapAt = Date.now();
    },
    true,
  );
}

interface Props {
  lang: Lang;
  prefs: Prefs;
  /** 공항 키오스크 화면이면 글자와 버튼을 키운다. */
  kiosk: boolean;
  /** 화면이 바뀔 때마다 달라지는 값. 바뀌면 제목으로 초점을 옮기고, 소리 안내를 켠 여객에게는 새 화면을 읽어 준다. */
  screenKey: string;
  /** 소리로 읽어 줄 글. 화면의 제목과 설명, 고를 것들. */
  speakText: string;
  /** 같은 화면 안에서 내용이 바뀌어 다시 읽어 줘야 할 때 달라지는 값. 제목으로 초점을 옮기거나 맨 위로 올리지는 않는다. */
  speakKey?: string;
  /** 주지 않으면 「이전」이 흐리게 보이고 눌리지 않는다. 자리는 그대로다. */
  onBack?: () => void;
  onHome?: () => void;
  /** 진행 표시. 등록 화면만 쓴다. */
  progress?: { n: number; total: number; name: string };
  /** 화면 아래에 붙는 가장 중요한 버튼. */
  cta?: React.ReactNode;
  /** 버튼을 화면 아래에 붙이지 않고 내용 끝에 둔다. 글이 길면 끝까지 읽어야 버튼이 나오는 동의 화면에 쓴다. */
  ctaAfterContent?: boolean;
  children: React.ReactNode;
  desktopSteps?: { label: string; current: boolean; done: boolean }[];
  desktopSummary?: React.ReactNode;
}

/**
 * 여객이 쓰는 모든 화면의 틀. 제안서의 화면 설계 원칙을 여기서 지킨다.
 *  - 「이전」「처음으로」「설정」은 항상 같은 자리(맨 위 줄)에 있다.
 *  - 「직원 부르기」는 그 바로 아래 줄, 모든 화면의 같은 자리에 있다. 키오스크가 이 틀 위에 따로 띄운다(StaffCall, .call-dock).
 *  - 여객이 고른 안내 방식(큰 글씨, 그림, 소리)은 고른 그 화면부터 바로 적용된다.
 *  - 「설정」에서 글자와 그림의 크기, 소리, 그림 크게 보기를 그 자리에서 바꿀 수 있다.
 */
// 이 페이지에서 화면 틀을 한 번이라도 그렸는지. 처음 연 화면에서만 초점을 옮기지 않는다.
let shellShown = false;

export function FlowShell({
  lang,
  prefs,
  kiosk,
  screenKey,
  speakText,
  speakKey,
  onBack,
  onHome,
  progress,
  cta,
  ctaAfterContent,
  children,
  desktopSteps,
  desktopSummary,
}: Props) {
  const t = textOf(lang, prefs.easy);
  const { supported, speaking, speak, stop } = useSpeech(lang, prefs.slow);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 화면이 바뀌면 설정 창을 닫는다. 앞사람이 열어 둔 채 떠나 처음 화면으로 돌아가도 다음 사람에게 남지 않게 한다.
  useEffect(() => setSettingsOpen(false), [screenKey]);
  // 화면이 바뀐 직후 잠깐은 누름을 받지 않는다. 손이 떨려 같은 자리를 두 번 누르면 두 번째 누름이
  // 다음 화면의 같은 자리 버튼(「동의하고 계속」, 「등록하기」)에 들어가, 읽지도 않고 넘어가 버리기 때문이다.
  // 누름 때문에 화면이 바뀐 경우에만 막는다. QR 을 대서 바뀌었거나 저절로 바뀐 화면은 바로 누를 수 있다.
  // 타이머로 풀지 않고 누른 시각을 견준다. 탭이 뒤로 갔다 오면 타이머가 늦게 돌아 계속 막혀 있을 수 있기 때문이다.
  const settleUntil = useRef(0);
  useLayoutEffect(() => {
    const now = Date.now();
    settleUntil.current = now - lastTapAt < SETTLE_MS ? now + SETTLE_MS : 0;
  }, [screenKey]);
  const swallowEarly = (e: React.MouseEvent) => {
    // 사람이 실제로 누른 것만 본다(화면 점검 프로그램이 코드로 누르는 것은 막지 않는다).
    if (e.nativeEvent.isTrusted && Date.now() < settleUntil.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, settingsOpen);

  // 등록할 때 고른 것이 기본이고, 「설정」에서 바꾼 것이 있으면 그 값을 쓴다.
  const view = useViewSettings();
  const scale = view.scale ?? (prefs.large ? 1.25 : 1);
  const picture = view.picture ?? prefs.picture;
  const voice = view.voice ?? prefs.voice;

  // 등록 화면에서 "큰 글씨·그림·소리" 항목을 직접 켜고 끄면 그쪽을 따른다. 설정에서 바꿔 둔 값이 그 선택을 가리지 않게 한다.
  // 바뀐 항목만 되돌린다. 키오스크 처음 화면에서 소리를 켠 여객이 QR 을 댔을 때 소리가 꺼지지 않게 하기 위해서다.
  const last = useRef(prefs);
  useEffect(() => {
    const before = last.current;
    last.current = prefs;
    const patch: { scale?: null; picture?: null; voice?: null } = {};
    if (before.large !== prefs.large) patch.scale = null;
    if (before.picture !== prefs.picture) patch.picture = null;
    if (before.voice !== prefs.voice) patch.voice = null;
    if (Object.keys(patch).length > 0) setViewSettings(patch);
  }, [prefs]);

  // 글자 크기와 그림 크기는 문서 전체에 건다. 화면의 모든 치수가 글자 크기를 따라 함께 커진다.
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-kiosk", kiosk);
    root.toggleAttribute("data-picture", picture);
    root.style.setProperty("--scale", String(scale));
    root.lang = lang;
    return () => {
      root.removeAttribute("data-kiosk");
      root.removeAttribute("data-picture");
      root.style.removeProperty("--scale");
      root.lang = "ko";
    };
  }, [kiosk, scale, picture, lang]);

  // 위쪽 줄의 실제 높이를 재 둔다. 글자를 키워 버튼이 두 줄이 되어도 「직원 부르기」 줄이 그 바로 아래에 온다.
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty("--bar-real", `${bar.offsetHeight}px`);
    apply();
    const watcher = new ResizeObserver(apply);
    watcher.observe(bar);
    return () => {
      watcher.disconnect();
      root.style.removeProperty("--bar-real");
    };
  }, []);

  // 화면이 바뀌면 맨 위로 올리고 제목에 초점을 둔다. 화면 읽기 프로그램이 새 화면을 바로 읽는다.
  const first = useRef(true);
  useEffect(() => {
    // 페이지를 처음 열었을 때만 초점을 옮기지 않는다. 키오스크처럼 다른 종류의 화면으로 바뀌며 이 틀이 새로 만들어진 때는
    // 옮긴다(전에는 그때도 건너뛰어 초점이 사라졌다).
    if (first.current && !shellShown) {
      first.current = false;
      shellShown = true;
    } else {
      first.current = false;
      const heading = bodyRef.current?.querySelector("h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    }
  }, [screenKey]);

  // 소리 안내를 켠 여객에게는 화면이 바뀔 때마다 읽어 준다. 끄면 바로 멈춘다.
  const speakRef = useRef(speakText);
  speakRef.current = speakText;
  useEffect(() => {
    if (voice) speak(speakRef.current);
    else stop();
  }, [voice, screenKey, speakKey, lang, speak, stop]);

  useEffect(() => {
    if (!settingsOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 설정 창 위에 다른 창(「계속 이용하시겠어요?」, 직원 부르기)이 떠 있으면 그 창의 Esc 다. 밑에 깔린 설정 창을 닫지 않는다.
      // 닫으면 초점이 위 창 뒤의 「설정」 단추로 빠져, 키보드로 쓰는 여객이 위 창에서 길을 잃는다.
      const modals = [...document.querySelectorAll('[aria-modal="true"]')];
      if (modals.length > 0 && modals[modals.length - 1] !== sheetRef.current)
        return;
      setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const changed =
    view.scale !== null || view.picture !== null || view.voice !== null;

  return (
    <div
      className={desktopSteps ? "flow flow-pretrip" : "flow"}
      lang={lang}
      onClickCapture={swallowEarly}
    >
      <header className="flow-bar" ref={barRef}>
        <div className="flow-bar-side">
          <button className="bar-btn" onClick={onBack} disabled={!onBack}>
            <ChevronLeft size={22} aria-hidden="true" />
            <span>{t.back}</span>
          </button>
          <button className="bar-btn" onClick={onHome} disabled={!onHome}>
            <House size={20} aria-hidden="true" />
            <span>{t.home}</span>
          </button>
          <button
            className="bar-btn"
            onClick={() => setSettingsOpen(true)}
            aria-haspopup="dialog"
          >
            <Settings size={20} aria-hidden="true" />
            <span>{t.settings}</span>
          </button>
        </div>
        {supported && (
          <button
            className={`bar-btn bar-icon ${speaking ? "on" : ""}`}
            onClick={() => (speaking ? stop() : speak(speakText))}
            aria-label={speaking ? t.listenStop : t.listen}
            aria-pressed={speaking}
          >
            {speaking ? (
              <VolumeX size={22} aria-hidden="true" />
            ) : (
              <Volume2 size={22} aria-hidden="true" />
            )}
          </button>
        )}
      </header>

      {progress && (
        <div className="flow-progress">
          <div className="progress" aria-hidden="true">
            {Array.from({ length: progress.total }, (_, i) => (
              <i key={i} className={i < progress.n ? "on" : ""} />
            ))}
          </div>
          <span
            className="step-count"
            aria-live="polite"
            aria-label={t.stepOf(progress.n, progress.total, progress.name)}
          >
            <b>{progress.name}</b> {progress.n}/{progress.total}
          </span>
        </div>
      )}

      <div className="flow-workspace">
        {desktopSteps && (
          <aside className="flow-desktop-steps">
            <p>{lang === "en" ? "PRE-REGISTRATION" : "여행 전 사전등록"}</p>
            <h2>
              {lang === "en" ? "Your registration" : "필요한 도움 미리 등록"}
            </h2>
            <ol>
              {desktopSteps.map((s, i) => (
                <li
                  key={i}
                  aria-current={s.current ? "step" : undefined}
                  className={s.done ? "done" : ""}
                >
                  <span>{s.done ? "✓" : i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>
          </aside>
        )}
        <div className="flow-form-area">
          <div className="flow-body" ref={bodyRef}>
            {children}
          </div>

          {cta && (
            <div className={`flow-cta ${ctaAfterContent ? "cta-after" : ""}`}>
              <div className="flow-cta-inner">{cta}</div>
            </div>
          )}
        </div>
        {desktopSummary && (
          <aside className="flow-desktop-summary">{desktopSummary}</aside>
        )}
      </div>

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div
            ref={sheetRef}
            className="sheet-box settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="settings-title">{t.settingsTitle}</h2>

            <div
              className="settings-group"
              role="radiogroup"
              aria-label={t.sizeLabel}
            >
              <span className="settings-label">{t.sizeLabel}</span>
              <div className="size-pick">
                {SCALES.map((s, i) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={scale === s}
                    className={scale === s ? "on" : ""}
                    onClick={() => setViewSettings({ scale: s })}
                    aria-label={t.sizes[i]}
                  >
                    {/* 글자 "가"를 그 크기대로 보여준다. 눌러 보기 전에 얼마나 커지는지 알 수 있다. */}
                    <b
                      style={{ fontSize: `${0.875 + i * 0.3}rem` }}
                      aria-hidden="true"
                    >
                      {lang === "en" ? "A" : "가"}
                    </b>
                    <span aria-hidden="true">{t.sizes[i]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <button
                className="switch"
                role="switch"
                aria-checked={picture}
                onClick={() => setViewSettings({ picture: !picture })}
              >
                <span>{t.pictureToggle}</span>
                <i aria-hidden="true" />
              </button>
              {supported && (
                <button
                  className="switch"
                  role="switch"
                  aria-checked={voice}
                  onClick={() => setViewSettings({ voice: !voice })}
                >
                  <span>{t.voiceToggle}</span>
                  <i aria-hidden="true" />
                </button>
              )}
            </div>

            <p className="fine">{t.settingsNote}</p>
            <div className="sheet-actions">
              <button
                ref={closeRef}
                className="btn btn-primary"
                onClick={() => setSettingsOpen(false)}
              >
                {t.settingsDone}
              </button>
              {changed && (
                // 되돌리면 이 버튼이 사라진다. 초점을 먼저 「완료」로 옮겨 둔다. 그대로 두면 초점이 창 밖(문서 맨 위)으로 떨어져
                // 화면 읽기 프로그램이 창 뒤의 화면을 읽기 시작한다.
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    closeRef.current?.focus();
                    resetViewSettings();
                  }}
                >
                  {t.settingsReset}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
