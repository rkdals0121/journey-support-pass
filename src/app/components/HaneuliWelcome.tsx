"use client";

import Image from "next/image";
import { BookUser, Keyboard, MapPin } from "lucide-react";
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

/** 원 안의 큰 나랑이(정면, 깨어 있는 모습). 안내 키오스크 첫 화면과 같은 크기 규칙(--hw-art)을 쓴다. */
export function HaneuliArt() {
  return (
    <div className="hw-art" aria-hidden="true">
      <span className="hw-orbit" />
      <div className="haneuli-character">
        <Image className="haneuli-happy" src={POSES.front} alt="" width={640} height={640} priority />
      </div>
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
 * 안내 키오스크 첫 장면(2026-11 스케치). 한 상자 안에 제목, 큰 나랑이와 오른쪽 말풍선,
 * 맨 아래 「탑승권이 없으신가요?」와 여권 스캔 · 예약번호 입력 · 소리 안내(둥근 단추)를 한 줄로 둔다.
 * 현재 위치는 위쪽 바(로고 옆)에 있고, 위쪽 바의 소리 단추는 이 화면에서 빼고 아래 둥근 소리 단추만 둔다.
 * 탑승권 읽기(카메라)는 칸 없이 켜 두고, 카메라를 못 쓸 때만 말풍선 아래에 안내가 보인다.
 * 나랑이는 건드리지 않으면 자고 있다. 탑승권을 비추면 깨며 다음 화면으로 가고, 화면만 누르면 깨어 아래 단추를 고르라고 알려 준다.
 * The camera stays mounted across sleep and wake.
 */
export function HaneuliWelcome({ en, awake, busy, onWake, onNumber, onPassport, scanner, error, listen }: {
  en: boolean; awake: boolean; busy: boolean;
  onWake: () => void; onNumber: () => void; onPassport: () => void;
  scanner: ReactNode; error: ReactNode; listen: ReactNode;
}) {
  // 말풍선 문구는 정해진 그대로 둔다(바꾸지 않는다).
  const bubble = busy
    ? (en ? "Finding your registration!" : "찾고 있어요!")
    : !awake
      ? (en ? "Scan your boarding pass to wake me up!" : "탑승권을 스캔해서\n나랑이를 깨워 주세요!")
      : (en ? "Choose one way to check in!" : "확인 방법을\n하나 골라 주세요!");

  return (
    <div className={`haneuli-welcome ${awake ? "is-awake" : "is-idle"}`} onClickCapture={(event) => {
      if (awake || busy || (event.target as HTMLElement).closest(".haneuli-ways")) return;
      event.preventDefault();
      event.stopPropagation();
      onWake();
    }}>
      <section className="hw-hero hw-welcome-hero">
        <div className="hw-welcome-title">
          <h1>{en ? "Accessible kiosk" : "교통약자 전용 키오스크"}</h1>
        </div>
        <div className="hw-welcome-stage">
          <div className="hw-art" aria-hidden="true">
            <span className="hw-orbit" />
            <div className="haneuli-character">
              <Image className="haneuli-happy" src={POSES.front} alt="" width={640} height={640} priority />
              <Image className="haneuli-sleep" src="/images/haneuli/narangi-sleep.webp" alt="" width={640} height={640} priority />
              <span className="haneuli-zzz">z Z Z</span>
            </div>
          </div>
          <div className="hw-welcome-side">
            <p className="haneuli-bubble hw-welcome-bubble" aria-live="polite">
              <strong>{bubble}</strong>
            </p>
            {/* 탑승권 읽기(카메라)는 칸 없이 켜 두고, 못 쓸 때만 안내가 보인다. 찾는 중·오류도 여기에 */}
            <div className="haneuli-status" aria-live="polite">
              <div className="haneuli-camera sr-only">{scanner}</div>
              {busy ? <p role="status">{en ? "Checking your registration…" : "등록 내용을 확인하고 있습니다…"}</p> : error}
            </div>
          </div>
        </div>

        {/* 「탑승권이 없으신가요?」 줄도 나랑이 상자 안에 둔다(2026-11-12 사용자 요청: 상자가 아래 단추까지 감싸게) */}
        <div className="haneuli-ways" role="group" aria-labelledby="hw-ways-title">
          <p className="hw-ways-title" id="hw-ways-title">{en ? "No boarding pass?" : "탑승권이 없으신가요?"}</p>
          <div className="hw-ways-row">
            <button className="hw-card haneuli-way haneuli-passport" onClick={onPassport} disabled={busy}>
              <BookUser aria-hidden="true" className="hw-way-icon" />
              <strong>{en ? "Scan passport" : "여권 스캔"}</strong>
            </button>
            <button className="hw-card haneuli-way haneuli-number" onClick={onNumber} disabled={busy}>
              <Keyboard aria-hidden="true" className="hw-way-icon" />
              <strong>{en ? "Enter booking number" : "예약번호 입력"}</strong>
            </button>
            <div className="hw-listen">{listen}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
