"use client";
import { useState } from "react";
import { OFFICIAL_AIRPORT_MAP } from "@/lib/official-map";
export function OfficialMapPanel({ en = false, appearance = "standard" }: { en?: boolean; appearance?: "standard" | "service" }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={appearance === "service" ? "service-map-panel" : "official-map-panel"}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {en
          ? "Check the official airport floor map"
          : "공식 공항 층별 지도에서 위치 확인"}
      </summary>
      <a href={OFFICIAL_AIRPORT_MAP} target="_blank" rel="noreferrer">
        {en ? "Open map in a full window ↗" : "지도를 큰 화면으로 열기 ↗"}
      </a>
      {open && (
        <iframe
          src={OFFICIAL_AIRPORT_MAP}
          title={
            en
              ? "Incheon Airport official floor map"
              : "인천공항 공식 층별 지도"
          }
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </details>
  );
}
