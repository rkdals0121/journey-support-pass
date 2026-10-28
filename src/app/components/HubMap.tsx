import Link from "next/link";
import Image from "next/image";
import { hubOf, hubsFor } from "@/lib/service-hubs";
import { placeOf } from "@/lib/airport";
import { OFFICIAL_AIRPORT_MAP } from "@/lib/official-map";
import styles from "./support-journey.module.css";
export function HubMap({ hubId, photo = false }: { hubId: string; photo?: boolean }) {
  const hub = hubOf(hubId);
  if (!hub) return null;
  const place = placeOf(hub.placeId)!;
  const points = hubsFor(place.area);
  return <section aria-label="만남 장소 안내">
    <h2>{hub.label}</h2><p>{hub.landmark}</p>
    <svg className={styles.map} viewBox="0 0 380 210" role="img" aria-label={`${place.area} 3층 시범 배치도, 선택한 지점 ${hub.label}`}>
      <rect x="12" y="12" width="356" height="186" fill="#f4f7f2" stroke="#9ab29f" />
      <text x="28" y="38" fontSize="13" fill="#284c35">{place.area} · 3층</text>
      <path d="M25 112H355" stroke="#93a995" strokeDasharray="5 4" />
      <text x="28" y="100" fontSize="11" fill="#526a59">보안검색 후 구역</text>
      <text x="28" y="185" fontSize="11" fill="#526a59">보안검색 전 출발층</text>
      {points.map((p, i) => <g key={p.id}><circle cx={p.x * 3.8} cy={p.y * 2.1} r={p.id === hub.id ? 18 : 13} fill={p.id === hub.id ? "#1c6b49" : "#dce8df"} stroke="#436d50" /><text x={p.x * 3.8} y={p.y * 2.1 + 5} textAnchor="middle" fontSize="14" fill={p.id === hub.id ? "#fff" : "#28503a"}>{i + 1}</text></g>)}
    </svg>
    <ul className={styles.mapLegend}>{points.map((p, i) => <li key={p.id}><b aria-hidden="true">{i + 1}</b><Link href={`/points/${p.id}`} aria-current={p.id === hub.id ? "location" : undefined}>{p.label}{p.id === hub.id ? " · 선택한 장소" : ""}</Link></li>)}</ul>
    <p className={styles.muted}>시연용 거점 배치도입니다. 현장 설치 위치는 표지와 공식 지도로 확인해 주세요.</p>
    <a className={styles.link} href={OFFICIAL_AIRPORT_MAP} target="_blank" rel="noreferrer">공식 공항 지도 열기 ↗</a>
    {photo && <figure style={{ margin: "1rem 0" }}><Image className={styles.photo} src="/images/meeting-point-demo.png" width={1448} height={1086} alt="멀리서 보이는 만남 표지와 QR이 있는 미팅포인트 구조물 디자인 시안" sizes="(max-width: 760px) 90vw, 400px" /><figcaption className={styles.muted}>거점 표지 디자인 시안 · 실제 설치 사진 아님</figcaption></figure>}
  </section>;
}
