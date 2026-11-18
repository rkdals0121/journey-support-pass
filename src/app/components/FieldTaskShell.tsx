import { type KioskReturn, kioskHomeHref } from "@/lib/help-entry";
import { FieldTaskControls } from "./FieldTaskControls";
import { FieldTaskNav } from "./FieldTaskNav";
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
  /** 이 기기의 자리. 위쪽 바에는 두지 않고(키오스크 바와 같게) 화면 읽기 프로그램에만 알린다. */
  place: string;
  children: React.ReactNode;
  defaultLarge?: boolean;
  /** 기기 화면 미리보기(?preview=1) 안이면 「처음으로」도 미리보기로 돌아간다 */
  preview?: boolean;
}) {
  return (
    // 키오스크·안내로봇에서 연 화면: 기기 첫 화면과 같은 글자 기준으로 화면을 채운다(devices.css). 로봇은 세로 배치
    // 위쪽 바는 키오스크 바와 같은 짜임(이전·처음으로 | 글자 크기·English). 여객 웹의 상표·위치 줄을 두 번째 바처럼 또 보이던 것을 뺐다.
    <div className="field-task-shell" lang={en ? "en" : "ko"} data-device={returnTo === "/kiosk/entry" ? "robot" : "kiosk"}>
      <header className="field-task-header">
        <FieldTaskNav en={en} homeHref={kioskHomeHref(returnTo, en, preview)} />
        {place && <span className="sr-only">{place}</span>}
        <FieldTaskControls en={en} defaultLarge={defaultLarge} />
      </header>
      {children}
    </div>
  );
}
