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
      <MyRequestPanel lang={lang} />
    </section>
  );
}
