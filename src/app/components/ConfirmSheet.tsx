"use client";

import { useEffect, useRef } from "react";

interface Props {
  title: string;
  body: string;
  /** 되돌릴 수 없는 동작의 버튼 글자. */
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 되돌릴 수 없는 동작을 하기 전에 한 번 더 묻는 창. 화면 아래에서 올라온다.
 * 처음 초점은 "그만두기"에 둔다. 실수로 Enter 를 눌러도 지워지지 않는다. Esc 로 닫힌다.
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel = "그만두기",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // 화면이 다시 그려져도 초점을 다시 옮기지 않도록, 닫는 동작은 최신 것을 따로 들고 있는다.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelRef.current();
      // 초점이 창 밖으로 나가지 않게 두 버튼 사이에서 돈다.
      if (e.key === "Tab") {
        const buttons = sheetRef.current?.querySelectorAll("button");
        if (!buttons || buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div
        ref={sheetRef}
        className="sheet-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="row">
          <button ref={cancelRef} className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
