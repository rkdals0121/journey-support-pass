"use client";

import Image from "next/image";
import { ArrowRight, BookUser, Keyboard, MapPin } from "lucide-react";
import { type ReactNode } from "react";

/** 새 나랑이 그림(배경이 투명한 정면·옆모습). 스탬프북과 같은 그림을 쓴다. */
const POSES = {
  front: "/stamp/narangi.webp",
  left: "/stamp/narangi-left.webp",
  right: "/stamp/narangi-right.webp",
} as const;

/** 나랑이가 한마디 한다. 안내 키오스크의 여러 화면에서 같은 모습으로 쓴다. */
export function HaneuliSays({ text, size = "md", pose = "front" }: { text: string; size?: "sm" | "md" | "lg"; pose?: keyof typeof POSES }) {
  return (
    <div className={`haneuli-says haneuli-says-${size}`}>
      <Image className="haneuli-says-face" src={POSES[pose]} alt="" width={320} height={320} />
      <p className="haneuli-says-bubble">{text}</p>
    </div>
  );
}

/**
 * 큰 나랑이 상자. 안내 키오스크 첫 화면(왼쪽)과 입구·안내로봇 처음 화면(왼쪽, 세로에서는 위)이 같은 모양을 쓴다.
 * 위에 제목·위치와 소리 안내 단추, 아래에 원 안의 큰 나랑이와 그 옆에 걸친 말풍선.
 * 자는 모습(.is-idle)과 깨어 있는 모습은 바깥 틀이 건 클래스(.is-idle, .is-awake)로 정한다.
 */
export function HaneuliStage({ title, here, listen, bubble }: { title: string; here: string; listen: ReactNode; bubble: string }) {
  return (
    <section className="hw-hero">
      <div className="hw-hero-copy">
        <div className="hw-hero-title">
          <h1>{title}</h1>
          <p className="hw-here"><MapPin aria-hidden="true" />{here}</p>
        </div>
        {/* 소리 안내를 쓰는 분은 탑승권을 대기 전에도 여기서 켠다 */}
        <div className="hw-actions">{listen}</div>
      </div>
      <div className="haneuli-center" aria-hidden="true">
        <p className="haneuli-bubble">{bubble}</p>
        <div className="hw-art">
          <span className="hw-orbit" />
          <div className="haneuli-character">
            <Image className="haneuli-happy" src={POSES.front} alt="" width={640} height={640} priority />
            {/* 잠든 모습: 자는 동안에는 잠든 그림으로 바꿔 보여 준다(haneuli.css 의 .is-idle). */}
            <Image className="haneuli-sleep" src="/images/haneuli/narangi-sleep.webp" alt="" width={640} height={640} />
            <span className="haneuli-zzz">z Z Z</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 안내 키오스크 첫 장면. 왼쪽에 큰 나랑이(말풍선과 함께), 오른쪽에 확인 방법 카드 세 개.
 * 교통약자 전용 키오스크라 본인 확인을 먼저 한다. 카드: 탑승권 스캔(카메라), 여권 스캔, 예약번호 입력.
 * 나랑이는 건드리지 않으면 자고 있다. 탑승권을 바로 비추면 깨며 다음 화면으로 가고, 화면만 누르면 깨어 카드 중 하나를 고르라고 알려 준다.
 * The camera stays mounted across sleep and wake.
 */
export function HaneuliWelcome({ en, here, awake, busy, onWake, onNumber, onPassport, scanner, error, listen }: {
  en: boolean; here: string; awake: boolean; busy: boolean;
  onWake: () => void; onNumber: () => void; onPassport: () => void;
  scanner: ReactNode; error: ReactNode; listen: ReactNode;
}) {
  const bubble = busy
    ? (en ? "Finding your registration!" : "찾고 있어요!")
    : !awake
      ? (en ? "Scan your boarding pass to wake me up!" : "탑승권을 스캔해서\n나랑이를 깨워 주세요!")
      : (en ? "Choose one way to check in!" : "확인 방법을\n하나 골라 주세요!");

  return (
    <div className={`haneuli-welcome ${awake ? "is-awake" : "is-idle"}`} onClickCapture={(event) => {
      if (awake || busy || (event.target as HTMLElement).closest(".haneuli-ways, .hw-actions")) return;
      event.preventDefault();
      event.stopPropagation();
      onWake();
    }}>
      <HaneuliStage
        title={en ? "Accessible kiosk" : "교통약자 전용 키오스크"}
        here={here}
        listen={listen}
        bubble={bubble}
      />

      <section className="haneuli-ways" aria-label={en ? "Check in" : "확인 방법"}>
        <button className="hw-card haneuli-way haneuli-passport" onClick={onPassport} disabled={busy}>
          <span className="hw-icon"><BookUser aria-hidden="true" /></span>
          <span className="hw-way-text">
            <strong>{en ? "Scan passport" : "여권 스캔"}</strong>
            <small>{en ? "Photo page, Korean passport" : "한국 여권 사진면을 카메라에"}</small>
          </span>
          <ArrowRight aria-hidden="true" className="hw-arrow" />
        </button>
        <button className="hw-card haneuli-way haneuli-number" onClick={onNumber} disabled={busy}>
          <span className="hw-way-text">
            <strong>{en ? "Enter booking number" : "예약번호 입력"}</strong>
            {/* 입력 칸처럼 보이지만 누르면 숫자판이 열린다. */}
            <span className="hw-field" aria-hidden="true">
              <Keyboard />
              <span>{en ? "Tap to type your number" : "눌러서 번호를 입력하세요"}</span>
            </span>
            <small>{en ? "Registration or airline number" : "고유 일련 번호 · 항공 예약번호"}</small>
          </span>
          <ArrowRight aria-hidden="true" className="hw-arrow" />
        </button>
        {/* 탑승권 읽기(카메라)는 화면에 칸을 두지 않고 그대로 켜 둔다. 카메라를 못 쓸 때만 안내가 보인다. */}
        <div className="haneuli-status" aria-live="polite">
          <div className="haneuli-camera sr-only">{scanner}</div>
          {busy ? <p role="status">{en ? "Checking your registration…" : "등록 내용을 확인하고 있습니다…"}</p> : error}
        </div>
      </section>
    </div>
  );
}
