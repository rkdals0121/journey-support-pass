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
              ? "Choose a service to view a route or submit a work order."
              : "경로 안내는 바로 확인하고, 현장 지원·신고는 필요한 내용을 입력해 접수하세요."}
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
                        ? "Create a service request"
                        : "이 업무 요청 작성"}
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
