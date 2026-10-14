"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Text } from "@/lib/i18n";
import { useFocusTrap } from "./useFocusTrap";

interface Props {
  t: Text;
  /** 켜져 있을 때만 지켜본다. 처음 화면이거나 직원을 기다리는 중이면 끈다. */
  enabled: boolean;
  /** 이만큼(초) 건드리지 않으면 묻는다. */
  askSec: number;
  /** 물은 뒤 이만큼(초) 답이 없으면 끝낸다. */
  answerSec: number;
  onTimeout: () => void;
  /** 소리 안내를 켠 여객에게 묻는 말을 읽어 준다. */
  say?: (text: string) => void;
  /** 읽던 말을 멈춘다. 「계속 이용하기」로 답했으면 이미 답한 경고를 끝까지 들려줄 까닭이 없다. */
  hush?: () => void;
}

/**
 * 키오스크를 오래 그대로 두면 "계속 이용하시겠어요?"를 묻는다.
 * 제안서의 원칙은 "시간 제한 없이 여객의 속도로"다. 그래서 화면을 말없이 끊지 않는다.
 * 묻고 나서도 답이 없을 때만 처음 화면으로 돌아간다. 앞사람의 항공편과 고른 항목을 다음 사람이 보지 않게 하기 위해서다.
 */
export function IdleGuard({ t, enabled, askSec, answerSec, onTimeout, say, hush }: Props) {
  const [left, setLeft] = useState<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const stayRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const asking = left !== null;
  // 창이 뜨기 전에 있던 자리를 기억해야 닫을 때 돌려줄 수 있다. 그래서 아래의 "버튼에 초점 두기"보다 먼저 건다.
  useFocusTrap(boxRef, asking);

  // 화면을 건드리면 처음부터 다시 잰다. 묻는 창이 떠 있는 동안에는 버튼으로만 답한다.
  useEffect(() => {
    if (!enabled || asking) return;
    let timer = setTimeout(() => setLeft(answerSec), askSec * 1000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setLeft(answerSec), askSec * 1000);
    };
    // click 도 본다. 화면 읽기 프로그램이나 스위치 같은 보조 기기는 손가락 대신 "누름"만 보내는 경우가 있다.
    const events = ["pointerdown", "keydown", "touchstart", "wheel", "click"] as const;
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

  // 소리 안내를 켠 여객에게는 묻는 말을 한 번 읽어 준다. 화면을 보지 못하면 묻는 창이 뜬 줄도 모른 채 보던 안내가 지워진다.
  // 남은 초가 줄 때마다 읽지는 않는다. 그래서 읽을 글은 ref 에 두고, 창이 뜰 때만 읽는다.
  // 누를 버튼(「계속 이용하기」)의 이름까지 읽는다. 초점을 그 버튼에 옮겨도 소리 안내는 화면 읽기 프로그램이 아니라서 알려 주지 않는다.
  // 제목이 이미 물음표로 끝나므로 마침표를 덧붙이지 않는다.
  const askRef = useRef<(() => void) | null>(null);
  askRef.current = say ? () => say(`${t.idleTitle} ${t.idleBody(answerSec)} ${t.idleStay}`) : null;
  useEffect(() => {
    if (asking) askRef.current?.();
  }, [asking]);

  if (left === null) return null;
  // 「직원 부르기」 창처럼 문서의 맨 바깥(body 바로 아래)에 띄운다. 그래야 나중에 뜬 이 창이
  // 열려 있는 「직원 부르기」 창보다 위에 보이고, 키보드 초점도 이 창이 붙든다.
  return createPortal(
    <div className="sheet-backdrop">
      <div ref={boxRef} className="sheet-box" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-body">
        <h2 id="idle-title">{t.idleTitle}</h2>
        <p id="idle-body">{t.idleBody(left)}</p>
        <div className="sheet-actions">
          <button
            ref={stayRef}
            className="btn btn-primary"
            onClick={() => {
              setLeft(null);
              hush?.();
            }}
          >
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
    </div>,
    document.body,
  );
}
