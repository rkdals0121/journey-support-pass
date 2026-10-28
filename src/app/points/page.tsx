import Link from "next/link";
import { PublicShell } from "@/app/components/PublicShell";
import { SERVICE_HUBS } from "@/lib/service-hubs";
import styles from "@/app/components/support-journey.module.css";
export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  const t = (ko: string, english: string) => (en ? english : ko);
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <main id="public-main" className={styles.page}>
        <p className={styles.eyebrow}>
          {t("공항 이용 지원", "Airport assistance")}
        </p>
        <h1>{t("만남 장소 찾기", "Find a meeting point")}</h1>
        <p>
          {t(
            "표지의 거점 번호와 지금 계신 장소를 확인해 주세요.",
            "Check the point code on the sign and your current location.",
          )}
        </p>
        <p className={styles.demo}>
          {t(
            "시연용 배치 · 실제 설치 위치는 운영기관 협의 필요",
            "Prototype layout · Installation locations require operator approval",
          )}
        </p>
        <div className={styles.grid}>
          {SERVICE_HUBS.map((h) => (
            <article key={h.id} className={styles.panel}>
              <span className={styles.badge}>{h.code}</span>
              <h2>{en ? h.en : h.label}</h2>
              <p>{en ? h.landmarkEn : h.landmark}</p>
              <Link
                className={styles.link}
                href={`/points/${h.id}${en ? "?lang=en" : ""}`}
              >
                {t(
                  "위치와 이용 방법 보기 →",
                  "View location and instructions →",
                )}
              </Link>
            </article>
          ))}
        </div>
        <Link className={styles.link} href="/points/print">
          {t("거점 QR 인쇄물 보기", "View printable point QR signs")}
        </Link>
      </main>
    </PublicShell>
  );
}
