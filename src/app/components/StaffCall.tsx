"use client";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { useEffect } from "react";
import type { Text } from "@/lib/i18n";
import { kioskHelpHref, type KioskReturn } from "@/lib/help-entry";
interface Props {
  t: Text;
  big: boolean;
  token: string | null;
  screen: "register" | "guide";
  lang?: "ko" | "en";
  returnTo?: KioskReturn;
  /** Legacy kiosk idle callbacks: the request now lives on its own shared-device screen. */
  onActive?: (active: boolean) => void;
  onPress?: () => void;
  session?: number;
  say?: (text: string) => void;
}
/** All kiosk assistance enters the same confirmation and request-status flow. */
export function StaffCall({
  big,
  token,
  screen,
  lang = "ko",
  returnTo,
  onActive,
}: Props) {
  useEffect(() => {
    onActive?.(false);
  }, [onActive]);
  return (
    <Link
      prefetch={false}
      className={`call-btn ${big ? "call-big" : ""}`}
      href={kioskHelpHref(
        token,
        lang,
        "guidance",
        returnTo ??
          (screen === "register" ? "/kiosk/register" : "/kiosk/guide"),
      )}
    >
      <BellRing size={24} aria-hidden="true" />
      <span>{lang === "en" ? "Request assistance" : "도움 요청하기"}</span>
    </Link>
  );
}
