import Link from "next/link";
import {
  ArrowRight,
  Check,
  Plane,
  ClipboardCheck,
  MapPin,
  Sun,
} from "lucide-react";
import { PublicShell } from "../components/PublicShell";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("여행 전 지원 등록", "Register before your trip");
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
  return (
    <PublicShell lang={lang}>
      {/* 위쪽 바는 다른 여객 화면과 같은 공용 바(PublicShell)를 쓴다. 본문 모양은 .pretrip-site 아래에서 정한다. */}
      <div className="pretrip-site">
      <main id="public-main" className="prepare-layout">
        <section className="prepare-intro">
          <span className="public-eyebrow">
            <Plane size={18} aria-hidden="true" />
            {en ? "Before your airport visit" : "여행 전, 필요한 도움을 미리"}
          </span>
          <h1>
            {en ? (
              <>
                Register your support needs
              </>
            ) : (
              <>
                출발 전,
                더 편안하게.
              </>
            )}
          </h1>
          <p>
            {en
              ? "Save your support needs before you fly."
              : "나에게 필요한 공항 도움을 미리 등록하세요."}
          </p>
          <Link className="public-button" href={registrationHref}>
            {en ? "Register my needs" : "필요한 도움 등록하기"}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
          <Link className="prepare-lookup-link" href={"/prepare/booking" + (en ? "?lang=en" : "")}>
            {en ? "Find my flight" : "예약번호로 항공편 찾기"}
          </Link>
        </section>
        <aside className="prepare-steps">
          <div className="prepare-step">
            <ClipboardCheck aria-hidden="true" />
            <div>
              <h2>
                {en ? "Tell us what you need" : "필요한 도움 선택"}
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
              <h2>{en ? "Review your journey" : "항공편·등록 내용 확인"}</h2>
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
                {en ? "Continue at the airport" : "공항에서 도움 요청"}
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
    </PublicShell>
  );
}
