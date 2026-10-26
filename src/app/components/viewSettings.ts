"use client";

import { useSyncExternalStore } from "react";

/**
 * 화면의 「설정」에서 지금 이 기기에서만 바꾼 보기 방식.
 * 등록할 때 고른 안내 방식(큰 글씨, 소리, 그림)이 기본이고, 여기서 바꾼 값이 있으면 그 값이 이긴다.
 * 서버에 저장하지 않는다. 이 탭에만 기억해 두어(sessionStorage) 등록을 마치고 패스 화면으로 넘어가도 이어진다.
 * 키오스크는 다음 사람으로 넘어갈 때 지운다(resetViewSettings). 휴대전화는 글자 크기를 유지하고 새 등록에서 음성·그림 설정만 초기화한다.
 */
export interface ViewSettings {
  /** 글자와 그림의 크기 배율. null 이면 등록할 때 고른 대로(큰 글씨면 1.25, 아니면 1). */
  scale: number | null;
  voice: boolean | null;
  picture: boolean | null;
}

/** 고를 수 있는 크기. 작게, 보통, 크게, 아주 크게. */
export const SCALES = [0.9, 1, 1.25, 1.5] as const;

const EMPTY: ViewSettings = { scale: null, voice: null, picture: null };
const KEY = "jsp:view";

function load(): ViewSettings {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<ViewSettings>;
    const scale = typeof v.scale === "number" && (SCALES as readonly number[]).includes(v.scale) ? v.scale : null;
    const voice = typeof v.voice === "boolean" ? v.voice : null;
    const picture = typeof v.picture === "boolean" ? v.picture : null;
    return scale === null && voice === null && picture === null ? EMPTY : { scale, voice, picture };
  } catch {
    return EMPTY;
  }
}
function save(v: ViewSettings) {
  try {
    if (v === EMPTY) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 저장하지 못해도 이 화면에서는 그대로 쓴다.
  }
}

let current: ViewSettings = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setViewSettings(patch: Partial<ViewSettings>) {
  current = { ...current, ...patch };
  save(current);
  emit();
}

/** 바꾼 것을 모두 지우고 등록할 때 고른 대로 돌아간다. */
export function resetViewSettings() {
  if (current === EMPTY) return;
  current = EMPTY;
  save(current);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useViewSettings(): ViewSettings {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}
