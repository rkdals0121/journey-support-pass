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
  // 지금 읽고 있는 글. 새 글을 읽으려고 앞 글을 끊으면, 끊긴 앞 글의 "끝났다"는 알림이 새 글을 읽는 도중에 늦게 온다.
  // 그 알림으로 「읽는 중」을 끄면 버튼이 「멈추기」가 아니라 「듣기」로 바뀌어, 눌러도 멈추지 않고 처음부터 다시 읽는다.
  // 그래서 지금 읽는 글의 알림만 받는다.
  const cur = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    cur.current = null;
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
    cur.current = u;
    const done = () => {
      if (cur.current !== u) return;
      cur.current = null;
      setSpeaking(false);
    };
    u.onend = done;
    u.onerror = done;
    setSpeaking(true);
    synth.speak(u);
  }, []);

  return { supported, speaking, speak, stop };
}
