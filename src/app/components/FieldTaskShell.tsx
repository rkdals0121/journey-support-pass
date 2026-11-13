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
    <div className="field-task-shell" lang={en ? "en" : "ko"}>
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
