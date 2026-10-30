import { PublicShell } from "@/app/components/PublicShell";
import { VisitForm } from "./VisitForm";
import styles from "@/app/components/support-journey.module.css";
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
      <main id="public-main" className={styles.page}>
        <p className={styles.eyebrow}>
          Journey Support Pass
        </p>
        <h1>{en ? "Arrange your assistance" : "로봇·이동지원 예약"}</h1>
        <p>
          {en
            ? "Choose where and when to meet. Saved support needs and a confirmed appointment are separate."
            : "만날 장소와 시간을 골라 주세요. 사전등록한 도움과 예약 확정은 별도입니다."}
        </p>
        <p className={styles.demo}>
          {en
            ? "Prototype appointments · no live device connection"
            : "시연 예약 · 실제 장비 운행 미연결"}
        </p>
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
