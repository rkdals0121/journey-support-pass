import { PublicShell } from "@/app/components/PublicShell";
import { VisitForm } from "./VisitForm";
import { CalendarClock } from "lucide-react";
import { currentSession } from "@/lib/session-server";
import { redirect } from "next/navigation";
import { SavedVisits } from "./SavedVisits";
export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ hub?: string; pass?: string; lang?: string }>;
}) {
  const q = await searchParams,
    en = q.lang === "en";
  const session = await currentSession();
  if (session?.isKiosk) redirect(`/kiosk/visits${en ? "?lang=en" : ""}`);
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
