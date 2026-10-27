import Link from "next/link";
import {
  ArrowRight,
  Check,
  Plane,
  ClipboardCheck,
  MapPin,
  Sun,
} from "lucide-react";
import { Sunflower } from "../components/Sunflower";
import { ViewScale } from "../components/ViewScale";
export default async function PreparePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; via?: string }>;
}) {
  const params = await searchParams,
    en = params.lang === "en",
    lang = en ? "en" : "ko";
  const entry = new URLSearchParams({
    ...(params.via === "booking" ? { via: "booking" } : {}),
    ...(en ? { lang: "en" } : {}),
  });
  const registrationHref =
    "/register" + (entry.size ? "?" + entry.toString() : "");
  const languageEntry = new URLSearchParams(
    params.via === "booking" ? { via: "booking" } : {},
  );
  if (!en) languageEntry.set("lang", "en");
  return (
    <div className="pretrip-site" lang={lang}>
      <ViewScale />
      <a className="public-skip" href="#prepare-main">
        {en ? "Skip to content" : "본문 바로가기"}
      </a>
      <header className="pretrip-header">
        <Link className="public-logo" href="/prepare">
          <Sunflower />
          <span>
            공항 이용 지원
            <small>
              {en
                ? "Prepare for your airport visit"
                : "공항 이용 도움 사전등록"}
            </small>
          </span>
        </Link>
        <Link
          href={
            "/prepare" +
            (languageEntry.size ? "?" + languageEntry.toString() : "")
          }
          hrefLang={en ? "ko" : "en"}
        >
          {en ? "한국어" : "English"}
        </Link>
      </header>
      <main id="prepare-main" className="prepare-layout">
        <section className="prepare-intro">
          <span className="public-eyebrow">
            <Plane size={18} aria-hidden="true" />
            {en ? "BEFORE YOUR AIRPORT VISIT" : "여행 전, 필요한 도움을 미리"}
          </span>
          <h1>
            {en ? (
              <>
                Register your support needs
              </>
            ) : (
              <>
                출발 전 지원등록
              </>
            )}
          </h1>
          <p>
            {en
              ? "Tell us what helps you travel comfortably. Your saved needs can be used when you request assistance at the airport."
              : "필요한 도움을 한 번 알려 두세요. 공항에서 도움을 요청할 때 같은 설명을 반복하는 부담을 줄일 수 있어요."}
          </p>
          <Link className="public-button" href={registrationHref}>
            {en ? "Register my needs" : "필요한 도움 등록하기"}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
          <p className="public-caption">
            {en
              ? "This saves your needs. It does not confirm a service booking."
              : "필요 정보를 미리 저장하는 절차이며 서비스 예약 확정은 아니에요."}
          </p>
          <Link className="prepare-lookup-link" href={"/prepare/booking" + (en ? "?lang=en" : "")}>
            {en ? "Find flight by booking reference (demo)" : "예약번호로 항공편 불러오기 (시연)"}
          </Link>
        </section>
        <aside className="prepare-steps">
          <div className="prepare-step">
            <ClipboardCheck aria-hidden="true" />
            <div>
              <h2>
                {en ? "Tell us what you need" : "필요한 도움을 알려주세요"}
              </h2>
              <p>
                {en
                  ? "Choose assistance and guidance preferences."
                  : "이동·안내 방식 등 필요한 내용을 골라요."}
              </p>
            </div>
          </div>
          <div className="prepare-step">
            <MapPin aria-hidden="true" />
            <div>
              <h2>{en ? "Review your journey" : "이용 정보를 확인해요"}</h2>
              <p>
                {en
                  ? "Review your flight and the details you entered."
                  : "항공편과 입력한 내용을 확인해요."}
              </p>
            </div>
          </div>
          <div className="prepare-step">
            <Sun aria-hidden="true" />
            <div>
              <h2>
                {en ? "Continue at the airport" : "현장 요청으로 이어가요"}
              </h2>
              <p>
                {en
                  ? "Bring saved needs into your support request."
                  : "공항에서 저장한 필요 정보를 불러와요."}
              </p>
            </div>
          </div>
          <div className="prepare-benefit">
            <Check size={18} aria-hidden="true" />
            {en ? "No account required" : "회원가입 없이 이용할 수 있어요"}
          </div>
        </aside>
      </main>
      <footer className="prepare-footer">
        {en ? "Already at the airport?" : "이미 공항에 계신가요?"}{" "}
        <Link href={"/help" + (en ? "?lang=en" : "")}>
          {en ? "Request help now" : "현장 도움 요청하기"}
        </Link>
      </footer>
    </div>
  );
}
