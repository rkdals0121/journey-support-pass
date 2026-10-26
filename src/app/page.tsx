import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  ChevronRight,
  Plane,
  Monitor,
  Bot,
} from "lucide-react";
import { PublicShell } from "./components/PublicShell";
import { ServiceDirectory } from "./components/ServiceDirectory";
import { MyRequestPanel } from "./components/MyRequestPanel";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en",
    lang = en ? "en" : "ko",
    q = en ? "?lang=en" : "";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="portal-main">
        <div className="portal-hero">
          <section className="portal-intro">
            <span className="public-eyebrow">
              <MapPin size={17} aria-hidden="true" />
              {en ? "AIRPORT SUPPORT, CONNECTED" : "인천공항 통합 지원"}
            </span>
            <h1>
              {en ? (
                <>
                  Your airport support,
                  <br />
                  all in one place.
                </>
              ) : (
                <>
                  공항에서 필요한 도움,
                  <br />
                  <em>지금 있는 곳에서.</em>
                </>
              )}
            </h1>
            <p>
              {en
                ? "Request assistance and follow its progress."
                : "필요한 도움을 요청하고, 처리 현황을 확인하세요."}
            </p>
            <div className="portal-hero-actions">
              <Link className="public-button" href={"/help" + q}>
                {en ? "Request help now" : "지금 도움 요청하기"}
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
              <Link className="public-text-link" href={"/services" + q}>
                {en ? "Explore services" : "서비스 살펴보기"}
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </section>
          <MyRequestPanel lang={lang} />
        </div>
        <ServiceDirectory lang={lang} compact />
        <section
          className="portal-device-link"
          aria-label={en ? "Airport devices" : "공항 현장 기기"}
        >
          <span className="device-link-icon">
            <Monitor aria-hidden="true" />
            <Bot aria-hidden="true" />
          </span>
          <div>
            <h2>{en ? "Kiosk & guide robot" : "키오스크 · 안내로봇"}</h2>
            <p>
              {en
                ? "Explore the airport device screens."
                : "공항 현장 화면을 살펴보세요."}
            </p>
          </div>
          <Link href={"/devices" + q}>
            {en ? "View screens" : "화면 보기"}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
        <section className="portal-before">
          <div>
            <span className="public-eyebrow">
              <Plane size={17} aria-hidden="true" />
              {en ? "BEFORE YOU TRAVEL" : "아직 공항에 오기 전이라면"}
            </span>
            <h2>
              {en
                ? "Tell us your needs in advance"
                : "필요한 도움을 미리 알려 두세요"}
            </h2>
            <p>
              {en
                ? "Save your needs before your trip and bring them into your on-site request."
                : "여행 전에 저장한 필요 정보를 현장 도움 요청에 이어서 사용할 수 있어요."}
            </p>
          </div>
          <Link
            className="public-button public-button-secondary"
            href={"/prepare" + q}
          >
            {en ? "Prepare for your journey" : "여행 전 사전등록"}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
    </PublicShell>
  );
}
