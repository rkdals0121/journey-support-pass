import Link from "next/link";
import { PublicShell } from "@/app/components/PublicShell";
import { SERVICE_HUBS } from "@/lib/service-hubs";
import styles from "@/app/components/support-journey.module.css";
export default function PointsPage() { return <PublicShell><main id="public-main" className={styles.page}><p className={styles.eyebrow}>공항 이용 지원</p><h1>만남 장소 찾기</h1><p>표지의 거점 번호와 지금 계신 장소를 확인해 주세요.</p><p className={styles.demo}>시연용 배치 · 실제 설치 위치는 운영기관 협의 필요</p><div className={styles.grid}>{SERVICE_HUBS.map(h => <article key={h.id} className={styles.panel}><span className={styles.badge}>{h.code}</span><h2>{h.label}</h2><p>{h.landmark}</p><Link className={styles.link} href={`/points/${h.id}`}>위치와 이용 방법 보기 →</Link></article>)}</div><Link className={styles.link} href="/points/print">거점 QR 인쇄물 보기</Link></main></PublicShell>; }
