"use client";

import { setViewSettings, useViewSettings } from "./viewSettings";

export function TextSizeControl({ en = false }: { en?: boolean }) {
  const { scale } = useViewSettings();
  return (
    <div className="text-size-control" role="group" aria-label={en ? "Text size" : "글자 크기"}>
      {[1, 1.25, 1.5].map((value, index) => (
        <button key={value} type="button" aria-pressed={(scale ?? 1) === value}
          aria-label={en ? ["Standard text", "Large text", "Extra large text"][index] : ["기본 글자", "큰 글자", "아주 큰 글자"][index]}
          onClick={() => setViewSettings({ scale: value })}>
          {/* 영어 화면에서는 「A」로 보여 준다(한국어를 읽지 못하는 여객도 글자 크기 단추임을 알 수 있게). */}
          <span aria-hidden="true" style={{ fontSize: `${0.875 + index * 0.1875}rem` }}>{en ? "A" : "가"}</span>
        </button>
      ))}
    </div>
  );
}
