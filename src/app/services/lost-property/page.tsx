import Link from "next/link";
import { Search, HandHelping, Briefcase, ArrowUpRight, MapPin } from "lucide-react";
import { PublicShell } from "../../components/PublicShell";
export default async function LostProperty({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const en = (await searchParams).lang === "en";
  return <PublicShell lang={en ? "en" : "ko"}>
    <main id="public-main" className="service-page">
      <section className="ph-hero" aria-labelledby="lost-title">
        <div className="ph-hero-copy service-intro-copy">
          <span className="ph-hero-label"><Briefcase aria-hidden="true" />{en ? "Airport information" : "공항 이용 안내"}</span>
          <h1 id="lost-title">{en ? "Lost property" : "분실물 안내"}</h1>
          <p>{en ? "Get help with a lost or found item." : "물건을 잃어버렸거나 주웠을 때 확인하세요."}</p>
        </div>
      </section>
      <div className="service-info-grid service-lost-grid">
        <section className="service-info-card">
          <header className="service-info-heading"><span className="service-info-icon"><HandHelping aria-hidden="true" /></span><h2>{en ? "Found an item?" : "물건을 주우셨나요?"}</h2></header>
          <p>{en ? "Hand it to an airport employee or information desk." : "가까운 공항 직원이나 안내데스크에 인계해 주세요."}</p>
          <Link className="btn btn-primary service-primary-action" href={"/services/desks" + (en ? "?lang=en" : "")}><MapPin aria-hidden="true" />{en ? "View information desk locations" : "안내데스크 위치 보기"}</Link>
        </section>
        <section className="service-info-card">
          <header className="service-info-heading"><span className="service-info-icon"><Search aria-hidden="true" /></span><h2>{en ? "Lost an item?" : "물건을 잃어버리셨나요?"}</h2></header>
          <p>{en ? "Ask an information desk; for items onboard, contact your airline." : "안내데스크에 문의해 주세요. 기내 분실물은 항공사로 문의하세요."}</p>
          <a className="service-card-action" href="https://business.airport.kr/ap_ko/924/subview.do" target="_blank" rel="noreferrer">{en ? "Incheon Airport lost-property contacts" : "인천공항 유실물 담당기관·연락처 확인"}<ArrowUpRight aria-hidden="true" /></a>
        </section>
      </div>
    </main>
  </PublicShell>;
}
