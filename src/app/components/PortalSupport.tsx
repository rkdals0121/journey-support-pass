import Link from "next/link";
import { ArrowUpRight, Plane, Stamp } from "lucide-react";
import { MyRequestPanel } from "./MyRequestPanel";
export function PortalSupport({ lang = "ko", showRequests = true, showPrepare = true }: { lang?: "ko" | "en"; showRequests?: boolean; showPrepare?: boolean }) {
  const en = lang === "en";
  return (
    <section className="service-support-grid" aria-label={en ? "Your journey" : "여행과 요청 관리"}>
      {showPrepare && <article className="service-info-card service-support-card">
        <span className="service-info-icon"><Plane aria-hidden="true" /></span>
        <h2>{en ? "Before you travel" : "여행 전 지원 등록"}</h2>
        <p>{en ? "Save your flight and support needs." : "항공편과 필요한 도움을 미리 등록하세요."}</p>
        <Link className="service-card-action" href={"/prepare" + (en ? "?lang=en" : "")}>{en ? "Register support" : "사전등록"}<ArrowUpRight aria-hidden="true" /></Link>
      </article>}
      <article className="service-info-card service-support-card">
        <span className="service-info-icon"><Stamp aria-hidden="true" /></span>
        <h2>{en ? "Airport stamp book (Korean)" : "공항 스탬프북"}</h2>
        <p>{en ? "Collect six checkpoint stamps." : "아이와 체크포인트 도장 6개를 모아요."}</p>
        <Link className="service-card-action" href="/stamp">{en ? "Open stamp book" : "스탬프북 열기"}<ArrowUpRight aria-hidden="true" /></Link>
      </article>
      {showRequests && <div className="service-support-request"><MyRequestPanel lang={lang} /></div>}
    </section>
  );
}
