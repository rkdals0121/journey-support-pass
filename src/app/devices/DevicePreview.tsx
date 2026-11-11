import Link from "next/link";
import { ArrowLeft, Bot, Monitor, Settings2 } from "lucide-react";
import { PublicShell } from "../components/PublicShell";
import { DeviceFrame } from "./DeviceFrame";

// 기기 화면 미리보기. 모형이 아니라 실제 키오스크 화면(/kiosk/entry, /kiosk/guide)을 그대로 띄운다(DeviceFrame).
// 첫 화면(/)과 같은 틀: 위쪽 바 아래 소개 박스, 그 아래 기기 화면.
export function DevicePreview({ device, lang }: { device: "robot" | "kiosk"; lang: "ko" | "en" }) {
  const en = lang === "en",
    robot = device === "robot",
    q = en ? "?lang=en" : "";
  const Icon = robot ? Bot : Monitor;
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="task-home">
        <div className="dv-home dv-preview">
          <section className="ph-hero" aria-labelledby="preview-title">
            <div className="ph-hero-copy">
              <span className="ph-hero-label">
                <Icon aria-hidden="true" />
                {en ? "Screen preview" : "화면 미리보기"}
              </span>
              <h1 id="preview-title">
                {robot ? (en ? "Guide robot (airport entrance)" : "안내로봇 (공항 입구)") : en ? "Information kiosk (after immigration)" : "안내 키오스크 (출국심사 뒤)"}
              </h1>
              <p className="dv-hero-links">
                <Link className="ph-text-link" href={"/devices" + q}>
                  <ArrowLeft aria-hidden="true" />
                  {en ? "Device list" : "기기 목록"}
                </Link>
                <Link className="ph-text-link" href={"/kiosk?use=" + (robot ? "entry" : "guide")}>
                  <Settings2 aria-hidden="true" />
                  {en ? "Install on a device" : "현장 기기에 설치"}
                </Link>
              </p>
            </div>
          </section>
          <DeviceFrame device={device} lang={lang} />
        </div>
      </main>
    </PublicShell>
  );
}
