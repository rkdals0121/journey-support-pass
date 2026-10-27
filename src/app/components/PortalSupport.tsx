import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MyRequestPanel } from "./MyRequestPanel";
export function PortalSupport({ lang = "ko" }: { lang?: "ko" | "en" }) {
  const en = lang === "en";
  return (
    <section
      className="airport-portal-support"
      aria-label={en ? "Your journey" : "여행과 요청 관리"}
    >
      <div className="airport-portal-links">
        <Link
          className="airport-prepare-link"
          href={"/prepare" + (en ? "?lang=en" : "")}
        >
          <div>
            <h2>
              {en ? "Prepare before you travel" : "출발 전에 지원을 준비하세요"}
            </h2>
            <p>
              {en
                ? "Connect your flight and save your support needs."
                : "항공편 예약 후 필요한 지원을 미리 등록하세요."}
            </p>
          </div>
          <ArrowUpRight size={22} aria-hidden="true" />
        </Link>
        {/* 스탬프북은 한국어 화면만 있다. */}
        <Link className="airport-prepare-link airport-stamp-link" href="/stamp">
          <div>
            <h2>
              {en ? "Airport stamp book for kids (Korean)" : "아이와 함께라면, 공항 스탬프북"}
            </h2>
            <p>
              {en
                ? "Scan checkpoint QR codes and collect six stamps."
                : "체크포인트 QR을 찍어 도장 6개를 모으고 인증 사진을 받아요."}
            </p>
          </div>
          <ArrowUpRight size={22} aria-hidden="true" />
        </Link>
      </div>
      <MyRequestPanel lang={lang} />
    </section>
  );
}
