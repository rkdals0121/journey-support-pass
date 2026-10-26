import Link from "next/link";
import {
  BUSINESS_AREAS,
  BUSINESS_GROUPS,
  BUSINESS_SOURCE,
  ACCESS_LABEL,
  ACCESS_EN,
} from "@/lib/operating-profile";
import { PublicShell } from "../components/PublicShell";
import { ServiceDirectory } from "../components/ServiceDirectory";
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en",
    lang = en ? "en" : "ko";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="portal-main">
        <div className="public-page-heading">
          <p className="public-eyebrow">
            {en ? "AIRPORT SERVICE DIRECTORY" : "서비스 찾기"}
          </p>
          <h1>
            {en ? "Find the help you need" : "필요한 도움부터 찾아보세요"}
          </h1>
          <p>
            {en
              ? "Choose by your situation. Staff will help confirm the right support or referral."
              : "지금 겪고 있는 상황으로 서비스를 고르세요. 담당자가 지원 방법과 연결할 업무를 확인해요."}
          </p>
        </div>
        <ServiceDirectory lang={lang} />
        <section className="business-reference">
          <h2>{en ? "Business responsibilities" : "담당 업무 전체 보기"}</h2>
          <p className="public-caption">
            {en
              ? "Four groups and twelve business areas. Specialist operations follow their own staff procedures."
              : "4개 분야·12개 사업의 담당 범위입니다. 전문 운영 업무는 해당 담당자의 절차로 처리해요."}
          </p>
          {BUSINESS_GROUPS.map((g) => (
            <section key={g.id} aria-labelledby={"business-" + g.id}>
              <h3 id={"business-" + g.id}>{en ? g.en : g.label}</h3>
              {BUSINESS_AREAS.filter((b) => b.group === g.id).map((b) => (
                <details key={b.id} id={b.id}>
                  <summary>
                    {en ? b.en : b.label}
                    <span>
                      {en ? ACCESS_EN[b.access] : ACCESS_LABEL[b.access]}
                    </span>
                  </summary>
                  <p>{en ? b.scopeEn : b.scope}</p>
                  <ul>
                    {(en ? b.tasksEn : b.tasks).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  {b.access !== "internal" && (
                    <Link
                      href={"/help?topic=other&service=guidance&business=" + b.id + (en ? "&lang=en" : "")}
                    >
                      {en
                        ? "Ask staff about this business"
                        : "이 업무 직원 상담 요청"}
                    </Link>
                  )}
                </details>
              ))}
            </section>
          ))}
          <p className="public-caption">
            <a href={BUSINESS_SOURCE}>
              {en
                ? "Official business scope"
                : "업무 범위 출처 · 공식 사업현황"}
            </a>
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
