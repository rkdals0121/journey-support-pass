import Link from "next/link";
import { notFound } from "next/navigation";
import { hubOf } from "@/lib/service-hubs";
import { PublicShell } from "@/app/components/PublicShell";
import { HubMap } from "@/app/components/HubMap";
import styles from "@/app/components/support-journey.module.css";
export default async function PointPage({ params }: { params: Promise<{ id: string }> }) {
  const hub = hubOf((await params).id);
  if (!hub) notFound();
  return <PublicShell><main id="public-main" className={styles.page}><p className={styles.eyebrow}>만남 장소 · 체크포인트</p><h1>{hub.label}</h1><p className={styles.demo}>시범 거점 · 실제 장비 운행 미연결</p><div className={styles.layout}><section className={styles.panel}><h2>이곳에서 무엇을 하시겠어요?</h2><div className={styles.actions}><Link className={styles.button} href={`/visits?hub=${hub.id}`}>로봇·이동지원 예약</Link><Link className={styles.secondary} href={`/help?topic=guidance&place=${hub.placeId}&fresh=1`}>이 위치로 직원 도움 요청</Link><Link className={styles.secondary} href={`/stamp/c/${hub.code}`}>스탬프 받기</Link></div><p className={styles.muted}>직원 도움 요청은 현재 자리로 연결됩니다. 거점으로 이동하기 어려우면 현장 도움 요청에서 지금 계신 위치를 선택하세요.</p><Link className={styles.link} href={`/help?fresh=1`}>다른 위치에서 도움 요청</Link></section><aside className={styles.panel}><HubMap hubId={hub.id} photo /></aside></div></main></PublicShell>;
}
