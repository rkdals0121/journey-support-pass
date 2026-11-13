import { PublicShell } from "@/app/components/PublicShell";
import { VisitForm } from "./VisitForm";
import { CalendarClock } from "lucide-react";
import { currentSession } from "@/lib/session-server";
import { redirect } from "next/navigation";
import { SavedVisits } from "./SavedVisits";
import { pageTitle } from "@/lib/page-title";
import { kioskReturn, withPreview } from "@/lib/help-entry";

export const generateMetadata = pageTitle("만남 예약", "Book a meeting");
export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ hub?: string; pass?: string; lang?: string; preview?: string; returnTo?: string }>;
}) {
  const q = await searchParams,
    en = q.lang === "en";
  const session = await currentSession();
  if (session?.isKiosk) redirect(`/kiosk/visits${en ? "?lang=en" : ""}`);
  // 기기 화면 미리보기(?preview=1)도 실제 키오스크처럼 키오스크 예약 확인 화면으로 보낸다.
  if (q.preview === "1" && kioskReturn(q.returnTo))
    redirect(withPreview(`/kiosk/visits?returnTo=${encodeURIComponent(kioskReturn(q.returnTo)!)}${en ? "&lang=en" : ""}`, true));
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <main id="public-main" className="service-page service-short-page">
        <section className="ph-hero" aria-labelledby="visits-title">
          <div className="ph-hero-copy service-intro-copy">
            <span className="ph-hero-label">
              <CalendarClock aria-hidden="true" />
              {en
                ? "Prototype appointments · no live device connection"
                : "시연 예약 · 실제 장비 운행 미연결"}
            </span>
            <h1 id="visits-title">
              {en ? "Arrange your assistance" : "로봇·이동지원 예약"}
            </h1>
            <p>
              {en
                ? "Choose where and when to meet. Booking is separate from pre-registration."
                : "만날 장소·시간을 고르세요. 예약 확정은 사전등록과 별도예요."}
            </p>
          </div>
        </section>
        <SavedVisits en={en} />
        <VisitForm
          key={`${q.pass ?? "public"}:${q.hub ?? "any"}`}
          initialHub={q.hub}
          registrationToken={q.pass}
          en={en}
        />
      </main>
    </PublicShell>
  );
}
