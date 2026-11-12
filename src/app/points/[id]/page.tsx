import Link from "next/link";
import { MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { hubOf } from "@/lib/service-hubs";
import { PublicShell } from "@/app/components/PublicShell";
import { HubMap } from "@/app/components/HubMap";
import styles from "@/app/components/support-journey.module.css";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("만남 장소", "Meeting point");
export default async function PointPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  const t = (ko: string, english: string) => (en ? english : ko);
  const hub = hubOf((await params).id);
  if (!hub) notFound();
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      {/* 만남 장소 찾기(/points)와 같은 틀: 소개 상자 아래 두 칸. 제목이 상자 없이 떠 있던 것. */}
      <main id="public-main" className="service-page service-short-page">
        <section className="ph-hero" aria-labelledby="point-title">
          <div className="ph-hero-copy service-intro-copy">
            <span className="ph-hero-label">
              <MapPin aria-hidden="true" />
              {t("만남 장소 · 시범 거점(실제 장비 운행 미연결)", "Meeting point · Prototype (hardware not connected)")}
            </span>
            <h1 id="point-title">{en ? hub.en : hub.label}</h1>
          </div>
        </section>
        <div className={styles.layout}>
          <section className={styles.panel}>
            <h2>
              {t(
                "이곳에서 무엇을 하시겠어요?",
                "What would you like to do here?",
              )}
            </h2>
            <div className={styles.actions}>
              <Link
                className={styles.button}
                href={`/visits?hub=${hub.id}${en ? "&lang=en" : ""}`}
              >
                {t("로봇·이동지원 예약", "Book robot or mobility assistance")}
              </Link>
              <Link
                className={styles.secondary}
                href={`/help?topic=guidance&place=${hub.placeId}&fresh=1${en ? "&lang=en" : ""}`}
              >
                {t("이 위치로 직원 도움 요청", "Request staff here")}
              </Link>
              <Link className={styles.secondary} href={"/stamp" + (en ? "?lang=en" : "")}>
                {t("스탬프북 열기", "Open stamp book")}
              </Link>
            </div>
            <p className={styles.muted}>
              {t(
                "직원 도움 요청은 현재 자리로 연결됩니다. 거점으로 이동하기 어려우면 현장 도움 요청에서 지금 계신 위치를 선택하세요.",
                "Staff assistance uses this location. Choose your current location instead if you cannot reach this meeting point.",
              )}
            </p>
            <Link
              className={styles.link}
              href={`/help?fresh=1${en ? "&lang=en" : ""}`}
            >
              {t("다른 위치에서 도움 요청", "Request help elsewhere")}
            </Link>
          </section>
          <aside className={styles.panel}>
            <HubMap hubId={hub.id} en={en} photo />
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
