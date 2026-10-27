import Link from "next/link";
import { PublicShell } from "../../components/PublicShell";
export default async function LostProperty({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <main id="public-main" className="booking-lookup">
        <h1>{en ? "Lost property" : "분실물 안내"}</h1>
        <h2>{en ? "Found an item?" : "물건을 주우셨나요?"}</h2>
        <p>
          {en
            ? "Hand it to the nearest airport employee or information desk."
            : "가까이 있는 공항 직원이나 안내데스크에 직접 인계해 주세요."}
        </p>
        <h2>{en ? "Lost an item?" : "물건을 잃어버리셨나요?"}</h2>
        <p>
          {en
            ? "Ask a nearby information desk. For items left onboard, contact your airline."
            : "주변 안내데스크에 문의해 주세요. 항공기 안에 두고 내린 물건은 이용한 항공사에 문의해 주세요."}
        </p>
        <Link
          className="public-button"
          href={"/services/desks" + (en ? "?lang=en" : "")}
        >
          {en ? "View information desk locations" : "안내데스크 위치 보기"}
        </Link>
        <p>
          <a
            href="https://business.airport.kr/ap_ko/924/subview.do"
            target="_blank"
            rel="noreferrer"
          >
            {en
              ? "Incheon Airport lost-property contacts"
              : "인천공항 유실물 담당기관·연락처 확인"}
          </a>
        </p>
      </main>
    </PublicShell>
  );
}
