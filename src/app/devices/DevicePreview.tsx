"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MapPin, Ticket, ArrowRight } from "lucide-react";
import { TaskLauncher } from "../components/TaskLauncher";
import { Sunflower } from "../components/Sunflower";
import { Robot } from "../components/Robot";
export function DevicePreview({
  device,
  initialLang,
}: {
  device: "robot" | "kiosk";
  initialLang: "ko" | "en";
}) {
  const [lang, setLang] = useState(initialLang);
  const en = lang === "en",
    robot = device === "robot",
    q = en ? "?lang=en" : "";
  return (
    <main
      className={
        "device-preview task-device-preview " +
        (robot ? "robot-preview" : "kiosk-preview")
      }
      lang={lang}
    >
      <div className="device-preview-status">
        <Link href={"/devices" + q}>
          <ArrowLeft aria-hidden="true" />
          {en ? "Devices" : "기기 목록"}
        </Link>
        <span>
          {en
            ? "Device preview · service links open the working web app"
            : "기기 화면 미리보기 · 서비스 선택 시 실제 웹앱으로 연결"}
        </span>
      </div>
      <header className="device-preview-header">
        <span className="device-brand">
          <Sunflower />
          공항 이용 지원
        </span>
        <span>
          {robot
            ? en
              ? "Guide robot"
              : "안내로봇"
            : en
              ? "Information kiosk"
              : "안내 키오스크"}
        </span>
        <button onClick={() => setLang(en ? "ko" : "en")}>
          {en ? "한국어" : "English"}
        </button>
      </header>
      <section className="device-preview-body">
        {robot && (
          <div className="task-robot-face">
            <Robot mood="awake" size={180} />
          </div>
        )}
        <div className="kiosk-task-heading">
          <p>
            <MapPin aria-hidden="true" />
            {en
              ? "Location is set when installed"
              : "설치 시 현재 위치가 연결됩니다"}
          </p>
          <h1>
            {en
              ? "What would you like to do?"
              : "어떤 서비스를 이용하시겠어요?"}
          </h1>
        </div>
        <TaskLauncher en={en} device={device} field topics={robot ? ["guidance", "mobility"] : undefined} />
        <Link className="device-booking-entry" href={"/prepare/booking" + q}>
          <Ticket aria-hidden="true" />
          <span>
            {en ? "Retrieve flight information" : "예약정보로 항공편 불러오기"}
            <small>{en ? "Demo booking lookup" : "시연 예약 조회"}</small>
          </span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>
      <footer className="device-preview-footer">
        <Link href={"/devices" + q}>
          <ArrowLeft aria-hidden="true" />
          {en ? "Device list" : "기기 목록"}
        </Link>
        <Link href={"/kiosk?use=" + (robot ? "entry" : "guide")}>
          {en ? "Install device" : "현장 기기에 설치"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
