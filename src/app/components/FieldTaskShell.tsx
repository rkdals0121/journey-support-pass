import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { Brand } from "./Sunflower";
import type { KioskReturn } from "@/lib/help-entry";
import { FieldTaskControls } from "./FieldTaskControls";
export function FieldTaskShell({
  en,
  returnTo,
  place,
  children,
  defaultLarge = false,
}: {
  en: boolean;
  returnTo: KioskReturn;
  place: string;
  children: React.ReactNode;
  defaultLarge?: boolean;
}) {
  return (
    <div className="field-task-shell" lang={en ? "en" : "ko"}>
      <header className="field-task-header">
        <Link
          href={returnTo + (en ? "?lang=en" : "")}
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
