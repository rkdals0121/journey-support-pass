"use client";

import Image from "next/image";
import { ArrowRight, ClipboardCheck, FilePenLine, Keyboard, MapPin, ScanLine } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** 하늘이가 한마디 한다. 안내 키오스크의 여러 화면에서 같은 모습으로 쓴다. */
export function HaneuliSays({ text, size = "md" }: { text: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`haneuli-says haneuli-says-${size}`}>
      <Image className="haneuli-says-face" src="/images/haneuli/friend.webp" alt="" width={320} height={320} />
      <p className="haneuli-says-bubble">{text}</p>
    </div>
  );
}

/** The camera stays mounted across sleep and wake. */
export function HaneuliWelcome({ en, here, awake, busy, onWake, onRest, onNumber, onNew, scanner, error, listen }: {
  en: boolean; here: string; awake: boolean; busy: boolean;
  onWake: () => void; onRest: () => void; onNumber: () => void; onNew: () => void;
  scanner: ReactNode; error: ReactNode; listen: ReactNode;
}) {
  // 「미리 작성했어요」를 고르면 스캔 칸을 강조한다. 카메라는 늘 켜 둔 채라 칸을 새로 그리지 않는다.
  const [pre, setPre] = useState(false);
  const scanRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!awake) setPre(false); }, [awake]);

  const bubble = busy
    ? (en ? "I’m finding your registration!" : "등록하신 내용을 찾고 있어요!")
    : !awake
      ? (en ? "Scan your boarding pass to wake me up!" : "탑승권을 스캔하여\n저를 깨워 주세요!")
      : pre
        ? (en ? "Hold your boarding pass to the camera." : "탑승권을 카메라에\n대 주세요.")
        : (en ? "Hello! I’m Haneuli. Let’s check the help you need." : "안녕하세요! 저는 하늘이예요.\n필요한 도움을 확인할게요.");

  return (
    <div className={`haneuli-welcome ${awake ? "is-awake" : "is-idle"} ${pre ? "is-pre" : ""}`} onClickCapture={(event) => {
      if (awake || busy || (event.target as HTMLElement).closest(".haneuli-scan, .haneuli-actions")) return;
      event.preventDefault();
      event.stopPropagation();
      onWake();
    }}>
      <section className="haneuli-stage">
        <p className="haneuli-location"><MapPin aria-hidden="true" />{here}</p>
        <div className="haneuli-hero" aria-hidden="true">
          <p className="haneuli-bubble">{bubble}</p>
          <div className="haneuli-character">
            <Image className="haneuli-happy" src="/images/haneuli/hello.png" alt="" width={640} height={640} priority />
            <Image className="haneuli-sleep" src="/images/haneuli/sleep.png" alt="" width={640} height={640} />
            <span className="haneuli-zzz">z Z Z</span>
          </div>
        </div>
        <div className="haneuli-actions">
          {listen}
          {!awake
            ? <button className="haneuli-start" onClick={onWake} disabled={busy}>{en ? "Start with help" : "도움받아 시작"}<ArrowRight aria-hidden="true" /></button>
            : <button className="haneuli-rest" onClick={onRest}>{en ? "Back to welcome" : "처음 화면으로"}</button>}
        </div>
      </section>

      <section className="haneuli-panel">
        {!awake ? (
          <div className="haneuli-title">
            <h1>{en ? "Airport Assistance" : "공항 이용 지원"}</h1>
            <p>{en ? "From boarding to getting around, we are here to help." : "탑승부터 이동까지, 편안한 공항 이용을 도와드립니다."}</p>
          </div>
        ) : (
          <div className="haneuli-choose">
            <h1>{en ? "Let’s check the help you need" : "필요한 도움을 확인해요"}</h1>
            <div className="haneuli-choices">
              <button className="haneuli-choice" onClick={() => { setPre(true); scanRef.current?.focus(); }} aria-pressed={pre}>
                <ClipboardCheck aria-hidden="true" />
                <strong>{en ? "I filled it in before" : "미리 작성했어요"}</strong>
                <span>{en ? "Scan your boarding pass or enter your number" : "탑승권을 스캔하거나 번호로 찾아요"}</span>
              </button>
              <button className="haneuli-choice" onClick={onNew}>
                <FilePenLine aria-hidden="true" />
                <strong>{en ? "I haven’t filled it in yet" : "아직 작성하지 않았어요"}</strong>
                <span>{en ? "Enter the help you need now" : "지금 필요한 도움을 입력해요"}</span>
              </button>
            </div>
          </div>
        )}

        <section className="haneuli-scan" ref={scanRef} tabIndex={-1} aria-label={en ? "Boarding pass scanner" : "탑승권 스캔"}>
          <div className="haneuli-scan-copy"><span className="haneuli-scan-icon"><ScanLine aria-hidden="true" /></span><div><h2>{en ? "Boarding pass scan" : "탑승권 스캔"}</h2><p>{en ? "Scan your boarding pass to load your saved support." : "탑승권을 스캔하시면 등록하신 내용을 불러옵니다."}</p></div></div>
          <div className="haneuli-camera">{scanner}</div>
          <button className="haneuli-number" onClick={onNumber} disabled={busy}><Keyboard aria-hidden="true" />{en ? "Enter pass number" : "번호로 찾기"}</button>
          <div className="haneuli-status" aria-live="polite">{busy ? <p role="status">{en ? "Checking your registration…" : "탑승권을 확인하고 있습니다…"}</p> : error}</div>
        </section>
      </section>
    </div>
  );
}
