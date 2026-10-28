import QRCode from "qrcode";
import Image from "next/image";
import { SERVICE_HUBS } from "@/lib/service-hubs";
import { config } from "@/lib/config";
import styles from "@/app/components/support-journey.module.css";
export default async function PointPrint() {
  const cards = await Promise.all(SERVICE_HUBS.map(async h => ({ ...h, qr: await QRCode.toDataURL(`${config.baseUrl}/points/${h.id}`, { width: 240, margin: 2, errorCorrectionLevel: "M" }) })));
  return <main className={styles.page}><h1>만남 장소 · 체크포인트 QR</h1><p className={styles.demo}>시연용 설치물 · 실제 배치·운영 허가 필요</p><div className={styles.printGrid}>{cards.map(h => <article key={h.id}><h2>{h.label}</h2><Image src={h.qr} alt={`${h.label} 만남 장소 안내 QR`} width={240} height={240} unoptimized /><p>도움 요청 · 로봇 만남 · 도장 받기</p><strong>{h.code}</strong><p>{h.landmark}</p></article>)}</div></main>;
}
