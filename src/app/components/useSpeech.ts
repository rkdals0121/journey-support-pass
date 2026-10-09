"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

/**
 * 화면의 글을 소리로 읽는다. 브라우저에 들어 있는 읽기 기능(speechSynthesis)을 쓴다.
 * 브라우저는 사람이 화면을 한 번이라도 누른 뒤에만 소리를 낸다. 그래서 키오스크는 한 화면(페이지) 안에서 계속 돌게 만들었다.
 * 지원하지 않는 기기에서는 아무 일도 하지 않고 supported 가 false 다.
 */
export function useSpeech(lang: Lang) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const code = langRef.current === "en" ? "en-US" : "ko-KR";
    u.lang = code;
    // 그 언어의 목소리가 있으면 고른다. 없으면 브라우저가 기본 목소리로 읽는다.
    const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").startsWith(code.slice(0, 2)));
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }, []);

  return { supported, speaking, speak, stop };
}
