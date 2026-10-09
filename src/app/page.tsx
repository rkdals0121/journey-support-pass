import { ArrowRight, ChevronRight, ClipboardList, ConciergeBell, Languages, QrCode, ScanLine, ShieldCheck, Trash2, UserX } from "lucide-react";
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
            <ClipboardList size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.step1}</strong>
            <span>{t.step1Body}</span>
          </div>
        </li>
        <li>
          <span className="bubble">
            <QrCode size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.step2}</strong>
            <span>{t.step2Body}</span>
          </div>
        </li>
        <li>
          <span className="bubble bubble-sun">
            <ScanLine size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.step3}</strong>
            <span>{t.step3Body}</span>
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
