import Link from "next/link";
import {
  BUSINESS_AREAS,
  BUSINESS_GROUPS,
  BUSINESS_SOURCE,
  ACCESS_LABEL,
  ACCESS_EN,
} from "@/lib/operating-profile";
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  return (
    <main className="page dx-page" lang={en ? "en" : "ko"}>
      <div className="dx-toolbar">
        <Link href={en ? "/?lang=en" : "/"}>{en ? "Home" : "첫 화면"}</Link>
        <Link
          href={en ? "/services" : "/services?lang=en"}
          hrefLang={en ? "ko" : "en"}
        >
          {en ? "한국어" : "English"}
        </Link>
      </div>
      <h1>{en ? "Airport service directory" : "공항 서비스 안내"}</h1>
      <p>
        {en
          ? "Explore the 12 business areas of Incheon Airport Operation Services across four groups."
          : "인천공항운영서비스의 4개 분야·12개 사업에서 필요한 업무와 담당을 확인하세요."}
      </p>
      <p className="dx-notice">
        {en
          ? "Contest demonstration. Enquiries are reviewed in the demo staff queue. Actual service provision and department referrals are confirmed by staff."
          : "공모전 시연입니다. 상담은 통합 요청에서 직원이 확인하며, 실제 서비스 제공·전문 부서 연결은 현장에서 확인해야 합니다."}
      </p>
      <Link className="btn btn-primary" href={en ? "/help?lang=en" : "/help"}>
        {en
          ? "Request assistance where you are"
          : "현재 위치에서 도움 요청하기"}
      </Link>
      {BUSINESS_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={group.id}>
          <h2 id={group.id}>{en ? group.en : group.label}</h2>
          <div className="dx-business-grid">
            {BUSINESS_AREAS.filter((b) => b.group === group.id).map((b) => (
              <article key={b.id} id={b.id} className="dx-card">
                <h3>{en ? b.en : b.label}</h3>
                <p className="fine">
                  {en ? ACCESS_EN[b.access] : ACCESS_LABEL[b.access]}
                </p>
                <p>{en ? b.scopeEn : b.scope}</p>
                <ul>
                  {(en ? b.tasksEn : b.tasks).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                {b.access === "internal" ? (
                  <p>
                    {en
                      ? "Handled through specialist staff procedures."
                      : "전문 담당자의 업무 절차로 처리합니다."}
                  </p>
                ) : (
                  <Link
                    className="btn btn-ghost"
                    href={"/help?business=" + b.id + (en ? "&lang=en" : "")}
                  >
                    {en
                      ? "Ask staff about this service"
                      : "이 업무 직원 상담 요청"}
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="fine">
        <a href={BUSINESS_SOURCE}>
          {en
            ? "Official business scope · Incheon Airport Operation Services"
            : "업무 범위 출처 · 인천공항운영서비스 공식 사업현황"}
        </a>
      </p>
    </main>
  );
}
