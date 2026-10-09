"use client";

import { useSyncExternalStore } from "react";

/**
 * 화면의 「설정」에서 지금 이 기기에서만 바꾼 보기 방식.
 * 등록할 때 고른 안내 방식(큰 글씨, 소리, 그림)이 기본이고, 여기서 바꾼 값이 있으면 그 값이 이긴다.
 * 서버에 저장하지 않는다. 키오스크는 다음 사람으로 넘어갈 때 지운다(resetViewSettings).
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
let current: ViewSettings = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setViewSettings(patch: Partial<ViewSettings>) {
  current = { ...current, ...patch };
  emit();
}

/** 바꾼 것을 모두 지우고 등록할 때 고른 대로 돌아간다. */
export function resetViewSettings() {
  if (current === EMPTY) return;
  current = EMPTY;
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
