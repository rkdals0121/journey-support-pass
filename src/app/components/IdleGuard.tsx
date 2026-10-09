"use client";

import { useEffect, useRef, useState } from "react";
import type { Text } from "@/lib/i18n";

interface Props {
  t: Text;
  /** 켜져 있을 때만 지켜본다. 처음 화면이거나 직원을 기다리는 중이면 끈다. */
  enabled: boolean;
  /** 이만큼(초) 건드리지 않으면 묻는다. */
  askSec: number;
  /** 물은 뒤 이만큼(초) 답이 없으면 끝낸다. */
  answerSec: number;
  onTimeout: () => void;
}

/**
 * 키오스크를 오래 그대로 두면 "계속 이용하시겠어요?"를 묻는다.
 * 제안서의 원칙은 "시간 제한 없이 여객의 속도로"다. 그래서 화면을 말없이 끊지 않는다.
 * 묻고 나서도 답이 없을 때만 처음 화면으로 돌아간다. 앞사람의 항공편과 고른 항목을 다음 사람이 보지 않게 하기 위해서다.
 */
export function IdleGuard({ t, enabled, askSec, answerSec, onTimeout }: Props) {
  const [left, setLeft] = useState<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const stayRef = useRef<HTMLButtonElement>(null);
  const asking = left !== null;

  // 화면을 건드리면 처음부터 다시 잰다. 묻는 창이 떠 있는 동안에는 버튼으로만 답한다.
  useEffect(() => {
    if (!enabled || asking) return;
    let timer = setTimeout(() => setLeft(answerSec), askSec * 1000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setLeft(answerSec), askSec * 1000);
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled, asking, askSec, answerSec]);

  useEffect(() => {
    if (!enabled) setLeft(null);
  }, [enabled]);

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      setLeft(null);
      onTimeoutRef.current();
      return;
    }
    const timer = setTimeout(() => setLeft((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  useEffect(() => {
    if (asking) stayRef.current?.focus();
  }, [asking]);

  if (left === null) return null;
  return (
    <div className="sheet-backdrop">
      <div className="sheet-box" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-body">
        <h2 id="idle-title">{t.idleTitle}</h2>
        <p id="idle-body">{t.idleBody(left)}</p>
        <div className="sheet-actions">
          <button ref={stayRef} className="btn btn-primary" onClick={() => setLeft(null)}>
            {t.idleStay}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setLeft(null);
              onTimeoutRef.current();
            }}
          >
            {t.idleEnd}
          </button>
        </div>
      </div>
    </div>
  );
}
