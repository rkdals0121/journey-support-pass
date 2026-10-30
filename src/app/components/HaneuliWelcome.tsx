"use client";

import Image from "next/image";
import { Accessibility, ArrowRight, BookUser, Keyboard, MapPin, ScanLine } from "lucide-react";
import { type ReactNode } from "react";

/** 새 하늘이 그림(배경이 투명한 정면·옆모습). 스탬프북과 같은 그림을 쓴다. */
const POSES = {
  front: "/stamp/haneul.webp",
  left: "/stamp/haneul-left.webp",
  right: "/stamp/haneul-right.webp",
} as const;

/** 하늘이가 한마디 한다. 안내 키오스크의 여러 화면에서 같은 모습으로 쓴다. */
export function HaneuliSays({ text, size = "md", pose = "front" }: { text: string; size?: "sm" | "md" | "lg"; pose?: keyof typeof POSES }) {
  return (
    <div className={`haneuli-says haneuli-says-${size}`}>
      <Image className="haneuli-says-face" src={POSES[pose]} alt="" width={320} height={320} />
      <p className="haneuli-says-bubble">{text}</p>
    </div>
  );
}

/**
 * 안내 키오스크 첫 장면. 웹 첫 화면과 같은 틀: 위에 큰 소개 박스(제목 + 잠든 하늘이), 아래에 같은 크기의 카드 세 개.
 * 교통약자 전용 키오스크라 본인 확인을 먼저 한다. 카드: 탑승권 스캔(카메라), 여권 스캔, 예약번호 입력.
 * 탑승권을 바로 비추면 하늘이가 깨며 다음 화면으로 간다. 화면만 누르면 하늘이가 깨어 카드 중 하나를 고르라고 알려 준다.
 * The camera stays mounted across sleep and wake.
 */
export function HaneuliWelcome({ en, here, awake, busy, onWake, onRest, onNumber, onPassport, scanner, error }: {
  en: boolean; here: string; awake: boolean; busy: boolean;
  onWake: () => void; onRest: () => void; onNumber: () => void; onPassport: () => void;
  scanner: ReactNode; error: ReactNode;
}) {
  const bubble = busy
    ? (en ? "Finding your registration!" : "찾고 있어요!")
    : !awake
      ? (en ? "Scan your boarding pass!" : "탑승권을 스캔해 주세요!")
      : (en ? "Choose one below!" : "아래에서 하나를 골라 주세요!");

  return (
    <div className={`haneuli-welcome ${awake ? "is-awake" : "is-idle"}`} onClickCapture={(event) => {
      if (awake || busy || (event.target as HTMLElement).closest(".haneuli-ways, .hw-rest")) return;
      event.preventDefault();
      event.stopPropagation();
      onWake();
    }}>
      <section className="hw-hero">
        <div className="hw-hero-copy">
          <p className="hw-label"><Accessibility aria-hidden="true" />{en ? "Accessible kiosk" : "교통약자 전용"}</p>
          <h1>{en ? "Accessible kiosk" : "교통약자 전용 키오스크"}</h1>
          <p className="hw-here"><MapPin aria-hidden="true" />{here}</p>
          {awake && <button className="hw-rest" onClick={onRest}>{en ? "Back to welcome" : "처음 화면으로"}</button>}
        </div>
        <div className="haneuli-center" aria-hidden="true">
          <p className="haneuli-bubble">{bubble}</p>
          <div className="hw-art">
            <span className="hw-orbit" />
            <div className="haneuli-character">
              <Image className="haneuli-happy" src={POSES.front} alt="" width={640} height={640} priority />
              {/* 잠든 모습: 새 그림에는 눈을 감은 모습이 없어서, 잘 때만 눈 위에 감은 눈을 얹는다. */}
              <span className="haneuli-lid haneuli-lid-l" />
              <span className="haneuli-lid haneuli-lid-r" />
              <span className="haneuli-zzz">z Z Z</span>
            </div>
          </div>
        </div>
      </section>

      <section className="haneuli-ways" aria-label={en ? "Check in" : "확인 방법"}>
        <div className="hw-card haneuli-scan">
          <p className="hw-card-head">
            <span className="hw-icon"><ScanLine aria-hidden="true" /></span>
            <strong>{en ? "Scan boarding pass" : "탑승권 스캔"}</strong>
          </p>
          <div className="haneuli-camera">{scanner}</div>
        </div>
        <button className="hw-card haneuli-way haneuli-passport" onClick={onPassport} disabled={busy}>
          <span className="hw-icon"><BookUser aria-hidden="true" /></span>
          <strong>{en ? "Scan passport" : "여권 스캔"}</strong>
          <small>{en ? "Photo page" : "사진면을 카메라에"}</small>
          <ArrowRight aria-hidden="true" className="hw-arrow" />
        </button>
        <button className="hw-card haneuli-way haneuli-number" onClick={onNumber} disabled={busy}>
          <span className="hw-icon"><Keyboard aria-hidden="true" /></span>
          <strong>{en ? "Enter booking number" : "예약번호 입력"}</strong>
          <small>{en ? "Registration or airline number" : "고유 일련 번호 · 항공 예약번호"}</small>
          <ArrowRight aria-hidden="true" className="hw-arrow" />
        </button>
        <div className="haneuli-status" aria-live="polite">{busy ? <p role="status">{en ? "Checking your registration…" : "등록 내용을 확인하고 있습니다…"}</p> : error}</div>
      </section>
    </div>
  );
}
