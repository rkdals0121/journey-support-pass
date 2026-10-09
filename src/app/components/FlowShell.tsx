"use client";

import { ChevronLeft, House, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Prefs } from "@/lib/catalog";
import { textOf, type Lang } from "@/lib/i18n";
import { useSpeech } from "./useSpeech";

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
  children: React.ReactNode;
}

/**
 * 여객이 쓰는 모든 화면의 틀. 제안서의 화면 설계 원칙을 여기서 지킨다.
 *  - 「이전」과 「처음으로」는 항상 같은 자리(왼쪽 위)에 있다.
 *  - 「직원 부르기」는 모든 화면의 같은 자리(오른쪽 위)에 있다. 키오스크가 이 틀 위에 따로 띄운다(StaffCall, .call-dock).
 *  - 여객이 고른 안내 방식(큰 글씨, 그림, 소리)은 고른 그 화면부터 바로 적용된다.
 */
export function FlowShell({ lang, prefs, kiosk, screenKey, speakText, onBack, onHome, progress, cta, children }: Props) {
  const t = textOf(lang, prefs.easy);
  const { supported, speaking, speak, stop } = useSpeech(lang);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 글자 크기와 그림 크기는 문서 전체에 건다. 화면의 모든 치수가 글자 크기를 따라 함께 커진다.
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-kiosk", kiosk);
    root.toggleAttribute("data-large", prefs.large);
    root.toggleAttribute("data-picture", prefs.picture);
    root.lang = lang;
    return () => {
      root.removeAttribute("data-kiosk");
      root.removeAttribute("data-large");
      root.removeAttribute("data-picture");
      root.lang = "ko";
    };
  }, [kiosk, prefs.large, prefs.picture, lang]);

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
    if (prefs.voice) speak(speakRef.current);
    else stop();
  }, [prefs.voice, screenKey, lang, speak, stop]);

  return (
    <div className="flow" lang={lang}>
      <header className="flow-bar">
        <div className="flow-bar-side">
          <button className="bar-btn" onClick={onBack} disabled={!onBack}>
            <ChevronLeft size={22} aria-hidden="true" />
            <span>{t.back}</span>
          </button>
          <button className="bar-btn" onClick={onHome} disabled={!onHome}>
            <House size={20} aria-hidden="true" />
            <span>{t.home}</span>
          </button>
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
        </div>
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
        <div className="flow-cta">
          <div className="flow-cta-inner">{cta}</div>
        </div>
      )}
    </div>
  );
}
