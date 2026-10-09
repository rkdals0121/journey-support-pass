"use client";

import { Check, Delete } from "lucide-react";
import { NeedIcon } from "./NeedIcon";

/** 고르는 항목 하나. 그림, 글, 고른 표시가 한 줄에 있다. 누르는 곳이 넓다. */
export function Choice({
  code,
  label,
  note,
  checked,
  single = false,
  onToggle,
}: {
  code: string;
  label: string;
  /** 문구 아래에 작게 붙는 말. */
  note?: string;
  checked: boolean;
  /** 하나만 고르는 묶음이면 동그란 표시를 쓴다. */
  single?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      role={single ? "radio" : "checkbox"}
      aria-checked={checked}
      className={`choice ${checked ? "choice-on" : ""} ${single ? "choice-single" : ""}`}
      onClick={onToggle}
    >
      <span className="choice-icon">
        <NeedIcon code={code} />
      </span>
      <span className="choice-text">
        {label}
        {note && <small className="choice-note">{note}</small>}
      </span>
      <span className="choice-mark" aria-hidden="true">
        <Check size={18} strokeWidth={3} />
      </span>
    </button>
  );
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** 숫자판. 키오스크에는 글자판이 없으므로 화면에 둔다. */
export function NumPad({ onKey, onErase, eraseLabel }: { onKey: (k: string) => void; onErase: () => void; eraseLabel: string }) {
  return (
    <div className="pad pad-num">
      {DIGITS.map((d) => (
        <button key={d} type="button" className="pad-key" onClick={() => onKey(d)}>
          {d}
        </button>
      ))}
      <span />
      <button type="button" className="pad-key" onClick={() => onKey("0")}>
        0
      </button>
      <button type="button" className="pad-key pad-erase" onClick={onErase} aria-label={eraseLabel}>
        <Delete size={26} aria-hidden="true" />
      </button>
    </div>
  );
}

const ALNUM_ROWS = ["1234567890", "ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ"];

/**
 * 편명을 넣는 글자판. 자판에 익숙하지 않은 사람도 찾기 쉽게 가나다(ABC) 순으로 놓았다.
 * 키오스크에서만 쓴다. 휴대전화에서는 휴대전화의 자판을 쓴다.
 */
export function AlnumPad({ onKey, onErase, eraseLabel }: { onKey: (k: string) => void; onErase: () => void; eraseLabel: string }) {
  return (
    <div className="pad pad-alnum">
      {ALNUM_ROWS.map((row, i) => (
        <div className="pad-row" key={row}>
          {[...row].map((k) => (
            <button key={k} type="button" className="pad-key" onClick={() => onKey(k)}>
              {k}
            </button>
          ))}
          {i === ALNUM_ROWS.length - 1 && (
            <button type="button" className="pad-key pad-erase pad-wide" onClick={onErase} aria-label={eraseLabel}>
              <Delete size={24} aria-hidden="true" />
              <span>{eraseLabel}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
