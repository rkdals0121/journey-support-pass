"use client";

import { ChevronLeft, House, Settings, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Prefs } from "@/lib/catalog";
import { textOf, type Lang } from "@/lib/i18n";
import { useSpeech } from "./useSpeech";
import { resetViewSettings, SCALES, setViewSettings, useViewSettings } from "./viewSettings";

interface Props {
  lang: Lang;
  prefs: Prefs;
  /** 공항 키오스크 화면이면 글자와 버튼을 키운다. */
  kiosk: boolean;
  /** 화면이 바뀔 때마다 달라지는 값. 바뀌면 제목으로 초점을 옮기고, 소리 안내를 켠 여객에게는 새 화면을 읽어 준다. */
  screenKey: string;
  /** 소리로 읽어 줄 글. 화면의 제목과 설명, 고를 것들. */
  speakText: string;
  /** 주지 않으면 「이전」이 흐리게 보이고 눌리지 않는다. 자리는 그대로다. */
  onBack?: () => void;
  onHome?: () => void;
  /** 진행 표시. 등록 화면만 쓴다. */
  progress?: { n: number; total: number; name: string };
  /** 화면 아래에 붙는 가장 중요한 버튼. */
  cta?: React.ReactNode;
  /** 휴대전화에서 버튼을 화면 아래에 붙이지 않고 내용 끝에 둔다. 끝까지 읽어야 버튼이 나오는 동의 화면에 쓴다. */
  ctaAfterContent?: boolean;
  children: React.ReactNode;
}

/**
 * 여객이 쓰는 모든 화면의 틀. 제안서의 화면 설계 원칙을 여기서 지킨다.
 *  - 「이전」「처음으로」「설정」은 항상 같은 자리(맨 위 줄)에 있다.
 *  - 「직원 부르기」는 그 바로 아래 줄, 모든 화면의 같은 자리에 있다. 키오스크가 이 틀 위에 따로 띄운다(StaffCall, .call-dock).
 *  - 여객이 고른 안내 방식(큰 글씨, 그림, 소리)은 고른 그 화면부터 바로 적용된다.
 *  - 「설정」에서 글자와 그림의 크기, 소리, 그림 크게 보기를 그 자리에서 바꿀 수 있다.
 */
export function FlowShell({ lang, prefs, kiosk, screenKey, speakText, onBack, onHome, progress, cta, ctaAfterContent, children }: Props) {
  const t = textOf(lang, prefs.easy);
  const { supported, speaking, speak, stop } = useSpeech(lang);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 등록할 때 고른 것이 기본이고, 「설정」에서 바꾼 것이 있으면 그 값을 쓴다.
  const view = useViewSettings();
  const scale = view.scale ?? (prefs.large ? 1.25 : 1);
  const picture = view.picture ?? prefs.picture;
  const voice = view.voice ?? prefs.voice;

  // 등록 화면에서 "큰 글씨·그림·소리" 항목을 직접 켜고 끄면 그쪽을 따른다. 설정에서 바꿔 둔 값이 그 선택을 가리지 않게 한다.
  const chosen = `${prefs.large}-${prefs.picture}-${prefs.voice}`;
  const lastChosen = useRef(chosen);
  useEffect(() => {
    if (lastChosen.current !== chosen) {
      lastChosen.current = chosen;
      resetViewSettings();
    }
  }, [chosen]);

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
    const apply = () => root.style.setProperty("--bar-real", `${bar.offsetHeight}px`);
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
    if (first.current) {
      first.current = false;
    } else {
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
  }, [voice, screenKey, lang, speak, stop]);

  useEffect(() => {
    if (!settingsOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const changed = view.scale !== null || view.picture !== null || view.voice !== null;

  return (
    <div className="flow" lang={lang}>
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
          <button className="bar-btn" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
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
            {speaking ? <VolumeX size={22} aria-hidden="true" /> : <Volume2 size={22} aria-hidden="true" />}
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
          <span className="step-count" aria-live="polite" aria-label={t.stepOf(progress.n, progress.total, progress.name)}>
            <b>{progress.name}</b> {progress.n}/{progress.total}
          </span>
        </div>
      )}

      <div className="flow-body" ref={bodyRef}>
        {children}
      </div>

      {cta && (
        <div className={`flow-cta ${ctaAfterContent ? "cta-after" : ""}`}>
          <div className="flow-cta-inner">{cta}</div>
        </div>
      )}

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sheet-box settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="settings-title">{t.settingsTitle}</h2>

            <div className="settings-group" role="radiogroup" aria-label={t.sizeLabel}>
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
                    <b style={{ fontSize: `${0.875 + i * 0.3}rem` }} aria-hidden="true">
                      {lang === "en" ? "A" : "가"}
                    </b>
                    <span aria-hidden="true">{t.sizes[i]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <button className="switch" role="switch" aria-checked={picture} onClick={() => setViewSettings({ picture: !picture })}>
                <span>{t.pictureToggle}</span>
                <i aria-hidden="true" />
              </button>
              {supported && (
                <button className="switch" role="switch" aria-checked={voice} onClick={() => setViewSettings({ voice: !voice })}>
                  <span>{t.voiceToggle}</span>
                  <i aria-hidden="true" />
                </button>
              )}
            </div>

            <p className="fine">{t.settingsNote}</p>
            <div className="sheet-actions">
              <button ref={closeRef} className="btn btn-primary" onClick={() => setSettingsOpen(false)}>
                {t.settingsDone}
              </button>
              {changed && (
                <button className="btn btn-ghost" onClick={resetViewSettings}>
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
