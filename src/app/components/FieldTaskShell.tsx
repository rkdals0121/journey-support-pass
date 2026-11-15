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
    // 키오스크·안내로봇에서 연 화면: 기기 첫 화면과 같은 글자 기준으로 화면을 채운다(devices.css). 로봇은 세로 배치
    <div className="field-task-shell" lang={en ? "en" : "ko"} data-device={returnTo === "/kiosk/entry" ? "robot" : "kiosk"}>
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
