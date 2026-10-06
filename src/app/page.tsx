import { ArrowRight, ChevronRight, ClipboardList, Languages, PhoneOff, ScanLine, ShieldCheck, Ticket, Trash2 } from "lucide-react";
import Link from "next/link";
import { langOf, TEXT } from "@/lib/i18n";
import { Brand, PassArt } from "./components/Sunflower";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = langOf((await searchParams).lang);
  const t = TEXT[lang];
  const q = lang === "en" ? "?lang=en" : "";

  return (
    <main className="page has-cta" lang={lang}>
      <div className="hero">
        <div className="hero-top">
          <Brand />
          <Link className="lang-switch" href={lang === "en" ? "/" : "/?lang=en"} hrefLang={lang === "en" ? "ko" : "en"}>
            <Languages size={15} aria-hidden="true" />
            {t.otherLang}
          </Link>
        </div>
        <h1>
          {t.heroTitle1}
          <br />
          <em>{t.heroTitle2}</em>
        </h1>
        <p>{t.heroBody}</p>
      </div>
      <PassArt />

      <ol className="steps-list">
        <li>
          <span className="bubble">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.step1}</strong>
            <span>{t.step1Body}</span>
          </div>
        </li>
        <li>
          <span className="bubble">
            <Ticket size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.step2}</strong>
            <span>{t.step2Body}</span>
          </div>
        </li>
        <li>
          <span className="bubble bubble-sun">
            <ScanLine size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.step3}</strong>
            <span>{t.step3Body}</span>
          </div>
        </li>
      </ol>

      <div className="trust">
        <span className="chip">
          <PhoneOff size={15} aria-hidden="true" />
          {t.trust1}
        </span>
        <span className="chip">
          <Trash2 size={15} aria-hidden="true" />
          {t.trust2}
        </span>
        <span className="chip">
          <ShieldCheck size={15} aria-hidden="true" />
          {t.trust3}
        </span>
      </div>

      <Link className="home-staff" href="/staff">
        {t.staffLink}
        <ChevronRight size={16} aria-hidden="true" />
      </Link>

      <div className="cta-bar">
        <div className="cta-inner">
          <Link className="btn btn-primary" href={`/register${q}`}>
            {t.start}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
