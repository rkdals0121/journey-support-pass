"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/i18n";
import { speechText } from "@/lib/speech-text";

// 지금 읽고 있는 글. 브라우저의 읽기 기능은 화면 전체에 하나뿐이라, 「읽는 중」도 이 훅을 쓰는 곳 모두가 함께 본다.
// 키오스크는 오류·직원 호출 소식·"계속 이용하시겠어요?"를 화면 글과 다른 곳에서 읽는다. 따로 들고 있으면
// 그 소식을 읽는 동안 오른쪽 위 버튼이 「듣기」로 보여, 멈추려고 누르면 오히려 화면 글을 처음부터 읽는다.
// 새 글을 읽으려고 앞 글을 끊으면 끊긴 앞 글의 "끝났다"는 알림이 늦게 오므로, 지금 읽는 글의 알림만 받는다.
let active: SpeechSynthesisUtterance | null = null;
const subs = new Set<() => void>();
function setActive(u: SpeechSynthesisUtterance | null) {
  active = u;
  subs.forEach((f) => f());
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
const isSpeaking = () => active !== null;
const notSpeaking = () => false;

/**
 * 화면의 글을 소리로 읽는다. 브라우저에 들어 있는 읽기 기능(speechSynthesis)을 쓴다.
 * 브라우저는 사람이 화면을 한 번이라도 누른 뒤에만 소리를 낸다. 그래서 키오스크는 한 화면(페이지) 안에서 계속 돌게 만들었다.
 * 지원하지 않는 기기에서는 아무 일도 하지 않고 supported 가 false 다.
 * speaking 과 stop 은 이 화면의 모든 읽기에 함께 쓰인다. 어디서 읽든 「멈추기」로 보이고, 누르면 멈춘다.
 * 한국어는 화면 글을 안내 방송 말투(합니다·하십시오)로 바꿔 읽는다(speech-text.ts).
 * slow 는 「천천히 설명해 주세요」를 고른 여객에게 더 느리게 읽는다.
 */
export function useSpeech(lang: Lang, slow = false) {
  const [supported, setSupported] = useState(false);
  const speaking = useSyncExternalStore(subscribe, isSpeaking, notSpeaking);
  const langRef = useRef(lang);
  langRef.current = lang;
  const slowRef = useRef(slow);
  slowRef.current = slow;
  // 이 자리에서 마지막으로 읽기 시작한 글. 사라질 때 남이 읽는 글까지 끊지 않도록 제 것만 끊는다.
  const mine = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      if (active === null || active !== mine.current) return;
      setActive(null);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setActive(null);
    window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(speechText(text, langRef.current));
    const code = langRef.current === "en" ? "en-US" : "ko-KR";
    u.lang = code;
    // 그 언어의 목소리가 있으면 고른다. 없으면 브라우저가 기본 목소리로 읽는다.
    const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").startsWith(code.slice(0, 2)));
    if (voice) u.voice = voice;
    u.rate = slowRef.current ? 0.75 : 0.95;
    const done = () => {
      if (active === u) setActive(null);
    };
    u.onend = done;
    u.onerror = done;
    // 앞 글을 끊기 전에 새 글로 바꿔 둔다. 끊긴 앞 글의 알림이 바로 와도 「읽는 중」이 꺼지지 않는다.
    mine.current = u;
    setActive(u);
    synth.cancel();
    synth.speak(u);
  }, []);

  return { supported, speaking, speak, stop };
}
