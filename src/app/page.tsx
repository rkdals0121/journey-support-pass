import { ArrowRight, ChevronRight, ClipboardList, ConciergeBell, FileCheck2, Languages, ShieldCheck, Ticket, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { langOf, textOf } from "@/lib/i18n";
import { Brand, PassArt } from "./components/Sunflower";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = langOf((await searchParams).lang);
  const t = textOf(lang);
  const q = lang === "en" ? "?lang=en" : "";

  return (
    <main className="page has-cta" lang={lang}>
      <div className="hero">
        <div className="hero-top">
          <Brand />
          <Link className="lang-switch" href={lang === "en" ? "/" : "/?lang=en"} hrefLang={lang === "en" ? "ko" : "en"} lang={lang === "en" ? "ko" : "en"}>
            <Languages size={16} aria-hidden="true" />
            {t.otherLang}
          </Link>
        </div>
        <h1>
          {lang === "en" ? "The help you need" : "공항에서 필요한 도움"}
          <br />
          <em>{lang === "en" ? "connected in one place" : "접수부터 지원까지 한곳에서"}</em>
        </h1>
        <p>{lang === "en" ? "Save your needs before your trip, or request help where you are. Follow your request from staff confirmation to completion." : "필요한 도움을 미리 등록하거나 공항에서 바로 요청하세요. 현재 위치에서 접수하고 담당자 확인부터 완료까지 살펴볼 수 있습니다."}</p>
      </div>
      <section className="dx-home-links" aria-label={lang === "en" ? "Choose when you need help" : "도움받을 시점 선택"}>
        <Link className="btn btn-primary" href={`/help${q}`}>{lang === "en" ? "Request help now" : "지금 도움 요청하기"}</Link>
        <Link className="btn btn-ghost" href={`/register${q}`}>{lang === "en" ? "Register needs in advance" : "미리 필요한 도움 등록하기"}</Link>
        <p className="fine">{lang === "en" ? "Registration saves your needs. It does not confirm a staff, robot or vehicle booking." : "사전등록은 필요한 도움을 미리 알려 두는 기능입니다. 직원·로봇·차량의 예약 확정은 아닙니다."}</p>
      </section>
      <PassArt label={t.passNo} />
      <p className="assist"><Link href={lang === "en" ? "/services?lang=en" : "/services"}>{lang === "en" ? "Explore airport services and support" : "공항 서비스·담당 업무 살펴보기"}</Link></p>

      <ol className="steps-list">
        <li>
          <span className="bubble">
            <ClipboardList size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>{lang === "en" ? "Save your needs in advance" : "필요한 도움을 미리 알려 두세요"}</strong>
            <span>{lang === "en" ? "Pre-registration is optional for on-site requests." : "사전등록을 해 두면 현장에서 답을 다시 입력하는 부담을 줄일 수 있습니다."}</span>
          </div>
        </li>
        <li>
          <span className="bubble">
            <FileCheck2 size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>{lang === "en" ? "Request at your current pickup point" : "현재 위치에서 도움을 요청하세요"}</strong>
            <span>{lang === "en" ? "You can also start without pre-registration or documents." : "등록하지 않았어도 필요한 도움과 만날 곳을 확인해 접수할 수 있습니다."}</span>
          </div>
        </li>
        <li>
          <span className="bubble bubble-sun">
            <Ticket size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>{lang === "en" ? "See how your request is handled" : "담당자 확인부터 완료까지 살펴보세요"}</strong>
            <span>{lang === "en" ? "Assignment is confirmed by staff, not by registration alone." : "사전등록과 요청 접수는 직원·로봇·차량의 배정 확정이 아닙니다."}</span>
          </div>
        </li>
      </ol>

      <p className="assist">
        <ConciergeBell size={20} aria-hidden="true" />
        <span>{t.assist}</span>
      </p>

      <div className="trust">
        <span className="chip">
          <UserX size={16} aria-hidden="true" />
          {t.trust1}
        </span>
        <span className="chip">
          <Trash2 size={16} aria-hidden="true" />
          {t.trust2}
        </span>
        <span className="chip">
          <ShieldCheck size={16} aria-hidden="true" />
          {t.trust3}
        </span>
      </div>

      <div className="home-links">
        <Link className="home-staff" href={`/demo/booking${q}`}>
          {t.bookingDemoLink}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link className="home-staff" href="/staff">
          {t.staffLink}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link className="home-staff" href="/kiosk">
          {t.kioskLink}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="cta-bar">
        <div className="cta-inner">
          <Link className="btn btn-primary" href={`/register${q}`}>
            {t.start}
            <ArrowRight size={22} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
