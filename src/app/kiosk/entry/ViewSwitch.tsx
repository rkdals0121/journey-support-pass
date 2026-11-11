"use client";

// 시연용 전환 버튼: 「PC 버전」(창 크기대로, 스크롤 있음) ↔ 「실제 키오스크 버전」(로봇 크기 1080×1920에 맞춤, 스크롤 없음).
// 실제 키오스크 버전은 틀(iframe) 안에서 열리므로, 눌렀을 때는 바깥 창의 주소를 바꾼다.
export function ViewSwitch({ mode, lang }: { mode: "pc" | "device"; lang: "ko" | "en" }) {
  const go = (next: "pc" | "device") => {
    if (next === mode) return;
    const url = new URL("/kiosk/entry", window.location.origin);
    if (next === "device") url.searchParams.set("view", "device");
    if (lang === "en") url.searchParams.set("lang", "en");
    (window.top ?? window).location.assign(url.toString());
  };
  const en = lang === "en";
  return (
    <div className="view-switch" role="group" aria-label={en ? "Screen version" : "화면 버전"}>
      <button type="button" className="bar-btn" aria-pressed={mode === "pc"} onClick={() => go("pc")}>
        {en ? "PC version" : "PC 버전"}
      </button>
      <button type="button" className="bar-btn" aria-pressed={mode === "device"} onClick={() => go("device")}>
        {en ? "Real kiosk version" : "실제 키오스크 버전"}
      </button>
    </div>
  );
}
