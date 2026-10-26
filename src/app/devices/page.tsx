import Link from "next/link";
import { ArrowRight, Bot, Monitor, Settings2 } from "lucide-react";
import { PublicShell } from "../components/PublicShell";
import { Robot } from "../components/Robot";

export default async function Devices({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en",
    lang = en ? "en" : "ko",
    q = en ? "?lang=en" : "";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="portal-main devices-main">
        <div className="public-page-heading">
          <span className="public-eyebrow">
            {en ? "AIRPORT DEVICES" : "공항 현장 기기"}
          </span>
          <h1>{en ? "Kiosk & guide robot" : "키오스크 · 안내로봇"}</h1>
          <p>
            {en
              ? "Preview a screen, or set up an airport device."
              : "화면을 미리 보거나, 현장 기기를 설치하세요."}
          </p>
        </div>
        <div className="device-cards">
          <article className="device-card">
            <div className="device-art">
              <Robot mood="awake" size={200} />
            </div>
            <div className="device-card-body">
              <span className="public-eyebrow">
                <Bot aria-hidden="true" />
                {en ? "ENTRANCE" : "공항 입구"}
              </span>
              <h2>{en ? "Guide robot" : "안내로봇"}</h2>
              <p>
                {en
                  ? "Boarding pass → saved needs → assistance"
                  : "탑승권 확인 → 필요한 도움 → 서비스 연결"}
              </p>
              <Link className="public-button" href={"/devices/robot" + q}>
                {en ? "Preview screen" : "화면 미리보기"}
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="public-text-link" href="/kiosk?use=entry">
                {en ? "Set up this device" : "이 기기에 설치"}
              </Link>
            </div>
          </article>
          <article className="device-card">
            <div className="device-art">
              <div className="kiosk-illustration" aria-hidden="true">
                <Monitor />
                <span>분(分)실</span>
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="device-card-body">
              <span className="public-eyebrow">
                <Monitor aria-hidden="true" />
                {en ? "DEPARTURE AREA" : "출국심사 뒤"}
              </span>
              <h2>{en ? "Information kiosk" : "안내 키오스크"}</h2>
              <p>
                {en
                  ? "Personalised gate and facility guidance"
                  : "탑승구·편의시설 맞춤 안내와 도움 요청"}
              </p>
              <Link className="public-button" href={"/devices/kiosk" + q}>
                {en ? "Preview screen" : "화면 미리보기"}
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="public-text-link" href="/kiosk?use=guide">
                {en ? "Set up this device" : "이 기기에 설치"}
              </Link>
            </div>
          </article>
        </div>
        <p className="device-install-note">
          <Settings2 aria-hidden="true" />
          {en
            ? "Device setup requires a staff installation code."
            : "현장 기기 설치에는 직원용 설치 코드가 필요합니다."}
        </p>
      </main>
    </PublicShell>
  );
}
