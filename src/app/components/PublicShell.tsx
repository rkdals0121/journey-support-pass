"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Sunflower } from "./Sunflower";
import { useViewSettings, setViewSettings } from "./viewSettings";
export function PublicShell({
  lang = "ko",
  children,
}: {
  lang?: "ko" | "en";
  children: React.ReactNode;
}) {
  const en = lang === "en",
    path = usePathname();
  const currentParams = useSearchParams(),
    languageParams = new URLSearchParams(currentParams.toString());
  if (en) languageParams.delete("lang");
  else languageParams.set("lang", "en");
  const languageHref =
    path + (languageParams.size ? "?" + languageParams.toString() : "");
  const [menu, setMenu] = useState(false);
  const view = useViewSettings(),
    large = (view.scale ?? 1) > 1;
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--scale",
      String(view.scale ?? 1),
    );
    return () => {
      document.documentElement.style.removeProperty("--scale");
    };
  }, [view.scale]);
  const suffix = en ? "?lang=en" : "";
  const items = [
    ["/services", en ? "Find a service" : "서비스 찾기"],
    ["/help", en ? "Request help" : "현장 도움 요청"],
    ["/help?resume=1", en ? "My request" : "내 요청 확인"],
    ["/prepare", en ? "Before you travel" : "여행 전 사전등록"],
    ["/devices", en ? "Kiosk & robot" : "키오스크·로봇"],
  ];
  return (
    <div className="public-site" lang={lang}>
      <a className="public-skip" href="#public-main">
        {en ? "Skip to content" : "본문 바로가기"}
      </a>
      <header className="public-header">
        <div className="public-header-inner">
          <Link href={"/" + suffix} className="public-logo">
            <Sunflower />
            <span>
              분(分)실<small>Journey Support Pass</small>
            </span>
          </Link>
          <div className="public-tools">
            <Link href={languageHref} hrefLang={en ? "ko" : "en"}>
              {en ? "한국어" : "English"}
            </Link>
            <button
              type="button"
              aria-pressed={large}
              onClick={() => setViewSettings({ scale: large ? 1 : 1.25 })}
            >
              {en ? "Larger text" : "글자 크게"}
            </button>
            <button
              className="public-menu-toggle"
              type="button"
              aria-expanded={menu}
              aria-controls="public-nav"
              onClick={() => setMenu((v) => !v)}
              aria-label={en ? "Menu" : "전체 메뉴"}
            >
              {menu ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>
        <nav
          id="public-nav"
          className={menu ? "public-nav is-open" : "public-nav"}
          aria-label={en ? "Main navigation" : "주 메뉴"}
        >
          {items.map(([href, label]) => (
            <Link
              key={href}
              href={
                href +
                (en ? (href.includes("?") ? "&lang=en" : "?lang=en") : "")
              }
              aria-current={
                path === href.split("?")[0] &&
                (href.startsWith("/help")
                  ? href.includes("resume") ===
                    (currentParams.get("resume") === "1")
                  : true)
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
      <footer className="public-footer">
        <div>
          <span className="public-footer-brand">
            분(分)실 · Journey Support Pass
          </span>
          <p className="public-caption">
            {en
              ? "Contest prototype"
              : "공모전 시제품"}
          </p>
        </div>
        <div className="public-footer-links">
          <Link href={"/services" + suffix}>
            {en ? "Service guide" : "서비스 이용 안내"}
          </Link>
          <Link href={"/demo/booking" + suffix}>
            {en ? "Booking connection demo" : "예매 연결 시연"}
          </Link>
          <Link href={"/devices" + suffix}>{en ? "Kiosk & robot" : "키오스크·로봇"}</Link>
          <Link href="/staff">
            {en ? "Staff workspace" : "직원 업무 화면"}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
