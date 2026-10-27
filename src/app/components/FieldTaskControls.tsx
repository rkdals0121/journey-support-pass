"use client";
import Link from "next/link";
import { Type } from "lucide-react";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useViewSettings, setViewSettings } from "./viewSettings";
export function FieldTaskControls({
  en,
  defaultLarge = false,
}: {
  en: boolean;
  defaultLarge?: boolean;
}) {
  const view = useViewSettings();
  const scale = view.scale ?? (defaultLarge ? 1.25 : 1);
  const path = usePathname(),
    params = new URLSearchParams(useSearchParams().toString());
  if (en) params.delete("lang");
  else params.set("lang", "en");
  useEffect(() => {
    document.documentElement.style.setProperty("--scale", String(scale));
    return () => {
      document.documentElement.style.removeProperty("--scale");
    };
  }, [scale]);
  return (
    <div className="field-task-tools">
      <button
        type="button"
        aria-pressed={scale > 1}
        aria-label={en ? "Larger text" : "글자 크게"}
        onClick={() => setViewSettings({ scale: scale > 1 ? 1 : 1.25 })}
      >
        <Type aria-hidden="true" />
        <span>{en ? "Text size" : "글자 크기"}</span>
      </button>
      <Link
        href={path + (params.size ? "?" + params.toString() : "")}
        hrefLang={en ? "ko" : "en"}
      >
        {en ? "한국어" : "English"}
      </Link>
    </div>
  );
}
