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
          <span aria-hidden="true" style={{ fontSize: `${14 + index * 3}px` }}>가</span>
        </button>
      ))}
    </div>
  );
}
