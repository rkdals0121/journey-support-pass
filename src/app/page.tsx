import Link from "next/link";
import { ArrowRight, MapPin, ChevronRight, Check, Plane } from "lucide-react";
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
              {en
                ? "AIRPORT SUPPORT, CONNECTED"
                : "공항에서 필요한 도움을 연결합니다"}
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
                ? "Find a service, request help and follow staff progress. You can start without pre-registration."
                : "서비스를 찾고, 도움을 요청하고, 담당자의 처리까지 확인하세요. 사전등록 없이도 바로 시작할 수 있어요."}
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
            <p className="portal-trust">
              <Check size={16} aria-hidden="true" />
              {en
                ? "Pre-registration is optional · staff confirmation required"
                : "사전등록 없이 접수 · 담당자 확인 후 지원"}
            </p>
          </section>
          <MyRequestPanel lang={lang} />
        </div>
        <ServiceDirectory lang={lang} compact />
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
