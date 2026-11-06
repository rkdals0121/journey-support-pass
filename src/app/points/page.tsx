import Link from "next/link";
import { PublicShell } from "@/app/components/PublicShell";
import { SERVICE_HUBS } from "@/lib/service-hubs";
import { ArrowRight, MapPin, QrCode } from "lucide-react";
export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  const t = (ko: string, english: string) => (en ? english : ko);
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <main id="public-main" className="service-page service-short-page">
        <section className="ph-hero" aria-labelledby="points-title">
          <div className="ph-hero-copy service-intro-copy">
            <span className="ph-hero-label">
              <MapPin aria-hidden="true" />
              {t(
                "시연용 배치 · 설치 위치는 운영기관 협의 필요",
                "Prototype layout · Locations need operator approval",
              )}
            </span>
            <h1 id="points-title">{t("만남 장소 찾기", "Find a meeting point")}</h1>
            <p>
              {t(
                "표지의 거점 번호와 지금 계신 장소를 확인해 주세요.",
                "Check the point code on the sign and your current location.",
              )}
            </p>
          </div>
        </section>
        <div className="ph-list">
          {SERVICE_HUBS.map((h) => (
            <article key={h.id} className="task-action">
              <MapPin aria-hidden="true" className="task-action-icon" strokeWidth={1.7} />
              <Link
                className="task-action-link"
                href={`/points/${h.id}${en ? "?lang=en" : ""}`}
              >
                <span>
                  <strong>{en ? h.en : h.label}</strong>
                  <small>
                    {h.code} · {en ? h.landmarkEn : h.landmark}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
        <Link className="ph-text-link" href="/points/print">
          <QrCode aria-hidden="true" />
          {t("거점 QR 인쇄물 보기", "View printable point QR signs")}
        </Link>
      </main>
    </PublicShell>
  );
}
