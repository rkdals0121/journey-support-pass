"use client";

import Image from "next/image";
import { ArrowRight, CalendarCheck, Keyboard, MapPin, ScanLine, Flower2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { TaskLauncher } from "./TaskLauncher";
import Link from "next/link";

/** The camera stays mounted across sleep, wake and menu transitions. */
export function HaneuliWelcome({ en, here, awake, busy, onWake, onRest, onNumber, scanner, error, listen }: {
  en: boolean; here: string; awake: boolean; busy: boolean;
  onWake: () => void; onRest: () => void; onNumber: () => void;
  scanner: ReactNode; error: ReactNode; listen: ReactNode;
}) {
  const [sleeping, setSleeping] = useState(false);
  useEffect(() => {
    if (awake) return;
    const nap = setTimeout(() => setSleeping(true), 18000);
    const cycle = setInterval(() => setSleeping((s) => !s), 32000);
    return () => { clearTimeout(nap); clearInterval(cycle); };
  }, [awake]);

  return (
    <div className={`haneuli-welcome ${awake ? "is-awake" : "is-idle"} ${!awake && sleeping ? "is-sleeping" : ""}`} onClickCapture={(event) => {
      if (awake || busy || (event.target as HTMLElement).closest(".haneuli-scan")) return;
      event.preventDefault();
      event.stopPropagation();
      onWake();
    }}>
      <section className="haneuli-intro">
        <p className="haneuli-location"><MapPin aria-hidden="true" />{here}</p>
        <p className="haneuli-eyebrow"><Flower2 aria-hidden="true" />{en ? "A little help, a brighter journey" : "작은 배려로 피어나는 편안한 여행"}</p>
        <h1>{awake ? (en ? "How can I help you?" : "어떤 도움이\n필요하세요?") : (en ? "Your journey,\nwith Haneuli" : "당신의 여행에\n하늘이가 함께해요")}</h1>
        <p className="haneuli-description">{awake ? (en ? "Choose a service. I’ll help you from here." : "필요한 서비스를 골라 주세요.\n여기서부터 함께할게요.") : (en ? "Touch the screen or show your boarding pass." : "화면을 누르거나 탑승권을 보여 주세요.")}</p>
        <div className="haneuli-garden" aria-hidden="true">
          <span className="haneuli-orbit orbit-one" /><span className="haneuli-orbit orbit-two" />
          <div className="haneuli-wander"><div className="haneuli-character">
            <Image className="haneuli-happy" src="/images/haneuli/hello.png" alt="" width={640} height={640} priority />
            <Image className="haneuli-sleep" src="/images/haneuli/sleep.png" alt="" width={640} height={640} />
            <span className="haneuli-zzz">z Z Z</span>
          </div></div>
          <span className="haneuli-ground" />
          <p className="haneuli-bubble">{busy ? (en ? "I’m finding your registration!" : "등록하신 내용을 찾고 있어요!") : awake ? (en ? "Hello! I’m Haneuli." : "안녕하세요! 저는 하늘이예요.") : sleeping ? (en ? "Taking a little nap…" : "잠깐 꿈나라 여행 중…") : (en ? "Shall we travel together?" : "우리, 함께 떠나볼까요?")}</p>
        </div>
        {!awake && <button className="haneuli-start" onClick={onWake} disabled={busy}>{en ? "Touch to start" : "화면을 눌러 시작하기"}<ArrowRight aria-hidden="true" /></button>}
        {awake && <>{listen}<button className="haneuli-rest" onClick={onRest}>{en ? "Back to welcome" : "처음 화면으로"}</button></>}
      </section>

      <section className="haneuli-menu" aria-label={en ? "Airport services" : "공항 이용 서비스"}>
        <div className="haneuli-menu-heading"><span>01 — {en ? "AIRPORT ASSIST" : "공항 이용 안내"}</span><h2>{en ? "A more comfortable airport" : "공항 이용이 더 편안해지도록"}</h2></div>
        <div className="haneuli-service-grid" inert={!awake}>
          <TaskLauncher en={en} returnTo="/kiosk/guide" field />
          <article className="task-action haneuli-appointment"><CalendarCheck className="task-action-icon" aria-hidden="true" /><Link className="task-action-link" href={"/kiosk/visits" + (en ? "?lang=en" : "")}><span><strong>{en ? "Meeting appointment" : "만남 예약 확인"}</strong><small>{en ? "Find your appointment" : "예약한 만남을 확인해요"}</small></span><ArrowRight aria-hidden="true" /></Link></article>
        </div>
        {!awake && <button className="haneuli-menu-cover" onClick={onWake} disabled={busy} aria-label={en ? "Wake Haneuli and open services" : "하늘이를 깨우고 서비스 안내 열기"}><span>{en ? "Touch to explore services" : "화면을 누르면 안내가 시작돼요"}<ArrowRight aria-hidden="true" /></span></button>}
      </section>

      <section className="haneuli-scan" aria-label={en ? "Boarding pass scanner" : "탑승권 스캔"}>
        <div className="haneuli-scan-copy"><span className="haneuli-scan-icon"><ScanLine aria-hidden="true" /></span><div><h2>{en ? "Registered before your trip?" : "미리 등록하고 오셨나요?"}</h2><p>{en ? "Show your boarding pass. I’ll find your saved support." : "탑승권을 보여 주시면 등록한 내용을 바로 불러와요."}</p></div></div>
        <div className="haneuli-camera">{scanner}</div>
        <button className="haneuli-number" onClick={onNumber} disabled={busy}><Keyboard aria-hidden="true" />{en ? "Enter pass number" : "번호로 찾기"}</button>
        <div className="haneuli-status" aria-live="polite">{busy ? <p role="status">{en ? "Checking your registration…" : "탑승권을 확인하고 있어요…"}</p> : error}</div>
      </section>
    </div>
  );
}
