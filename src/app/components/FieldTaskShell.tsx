import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { Brand } from "./Sunflower";
import { kioskHomeHref, type KioskReturn } from "@/lib/help-entry";
import { FieldTaskControls } from "./FieldTaskControls";
export function FieldTaskShell({
  en,
  returnTo,
  place,
  children,
  defaultLarge = false,
  preview = false,
}: {
  en: boolean;
  returnTo: KioskReturn;
  place: string;
  children: React.ReactNode;
  defaultLarge?: boolean;
  /** 기기 화면 미리보기(?preview=1) 안이면 「서비스 선택」도 미리보기로 돌아간다 */
  preview?: boolean;
}) {
  return (
    // 안내로봇(입구, 세로 1080×1920)에서 연 화면: 로봇 첫 화면과 같은 글자 기준·세로 배치를 쓴다(devices.css)
    <div className="field-task-shell" lang={en ? "en" : "ko"} data-device={returnTo === "/kiosk/entry" ? "robot" : undefined}>
      <header className="field-task-header">
        <Link
          href={kioskHomeHref(returnTo, en, preview)}
          className="field-task-back"
        >
          <ArrowLeft aria-hidden="true" />
          {en ? "Services" : "서비스 선택"}
        </Link>
        <Brand />
        <span>
          <MapPin aria-hidden="true" />
          {place}
        </span>
        <FieldTaskControls en={en} defaultLarge={defaultLarge} />
      </header>
      {children}
    </div>
  );
}
