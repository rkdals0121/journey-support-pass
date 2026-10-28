import Link from "next/link";
import Image from "next/image";
import { hubOf, hubsFor } from "@/lib/service-hubs";
import { placeOf } from "@/lib/airport";
import { OFFICIAL_AIRPORT_MAP } from "@/lib/official-map";
import styles from "./support-journey.module.css";
/** A labelled prototype zone diagram, deliberately not a claimed official floor plan. */
export function HubMap({
  hubId,
  photo = false,
  en = false,
}: {
  hubId: string;
  photo?: boolean;
  en?: boolean;
}) {
  const hub = hubOf(hubId);
  if (!hub) return null;
  const t = (ko: string, english: string) => (en ? english : ko);
  const place = placeOf(hub.placeId)!,
    concourse = place.area === "CONCOURSE";
  const points = hubsFor(place.area);
  const gates = concourse
    ? [103, 116, 130]
    : place.area === "T2"
      ? [212, 250, 286]
      : [10, 25, 41];
  const position = (id: string) => {
    const h = hubOf(id)!;
    return concourse
      ? { x: 200, y: 110 }
      : { x: h.x * 4, y: placeOf(h.placeId)!.landside ? 204 : 82 };
  };
  return (
    <section
      aria-label={t("만남 장소 안내", "Meeting-point directions")}
      className={styles.hubMap}
    >
      <h2>{en ? hub.en : hub.label}</h2>
      <p className={styles.landmark}>{en ? hub.landmarkEn : hub.landmark}</p>
      <figure style={{ margin: 0 }}>
        <svg
          className={styles.map}
          viewBox="0 0 400 280"
          role="img"
          aria-label={t(
            `${place.area} 시연 구역도. ${hub.landmark}`,
            `${place.area} prototype zone diagram. ${hub.landmarkEn}`,
          )}
        >
          <rect
            x="1"
            y="1"
            width="398"
            height="278"
            rx="5"
            fill="#f4f8f5"
            stroke="#a4b9ac"
          />
          <text x="20" y="28" fontSize="16" fontWeight="700" fill="#234b35">
            {place.area} · 3F
          </text>
          <text x="20" y="50" fontSize="13" fill="#385a46">
            {t("보안검색 후 · 탑승구 구역", "Airside · boarding gates")}
          </text>
          <path
            d={concourse ? "M35 110H365" : "M35 82H365"}
            stroke="#729280"
            strokeWidth="12"
          />
          {gates.map((gate, i) => (
            <g key={gate}>
              <path
                d={`M${55 + i * 145} ${concourse ? 110 : 82}v-16`}
                stroke="#456a54"
                strokeWidth="2"
              />
              <text
                x={55 + i * 145}
                y={concourse ? 84 : 66}
                textAnchor="middle"
                fill="#234b35"
                fontSize="15"
              >
                {gate}
              </text>
            </g>
          ))}
          {!concourse && (
            <>
              <path d="M20 142H380" stroke="#7d9384" strokeDasharray="6 5" />
              <rect x="135" y="130" width="130" height="26" fill="#f4f8f5" />
              <text
                x="200"
                y="148"
                fontSize="13"
                textAnchor="middle"
                fill="#34543f"
              >
                {t("보안검색·출국심사", "Security / immigration")}
              </text>
              <text x="20" y="180" fontSize="14" fill="#234b35">
                {t("출발층 · 보안검색 전", "Departures · landside")}
              </text>
              <path d="M35 204H365" stroke="#bdcfc3" strokeWidth="10" />
              <text x="22" y="254" fontSize="13" fill="#34543f">
                {t("체크인·안내 창구", "Check-in and information")}
              </text>
            </>
          )}
          {concourse && (
            <>
              <path
                d="M200 133v57h100"
                stroke="#567f65"
                strokeWidth="2"
                strokeDasharray="5 4"
                fill="none"
              />
              <rect
                x="287"
                y="177"
                width="24"
                height="24"
                rx="3"
                fill="#e1ece4"
                stroke="#567f65"
              />
              <text
                x="299"
                y="195"
                textAnchor="middle"
                fontSize="17"
                fill="#234b35"
              >
                ↕
              </text>
              <text x="30" y="232" fontSize="14" fill="#234b35">
                {t("셔틀트레인 · 지하 1층", "Shuttle train · B1")}
              </text>
              <text x="30" y="254" fontSize="13" fill="#34543f">
                {t(
                  "엘리베이터·이동 표지를 확인하세요",
                  "Follow the lift and transfer signs",
                )}
              </text>
            </>
          )}
          {points.map((p, i) => {
            const { x, y } = position(p.id),
              selected = p.id === hub.id;
            return (
              <g key={p.id}>
                <circle
                  cx={x}
                  cy={y}
                  r={selected ? 19 : 14}
                  fill={selected ? "#176541" : "#ffffff"}
                  stroke="#176541"
                  strokeWidth={selected ? 3 : 2}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill={selected ? "#ffffff" : "#234b35"}
                  fontSize="16"
                  fontWeight="700"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
        <figcaption className={styles.demo}>
          {t(
            "위치 이해를 위한 시연 구역도 · 실제 평면도와 다름",
            "Prototype zone diagram · not an official floor plan",
          )}
        </figcaption>
      </figure>
      <ul className={styles.mapLegend}>
        {points.map((p, i) => (
          <li key={p.id}>
            <b aria-hidden="true">{i + 1}</b>
            <Link
              href={`/points/${p.id}${en ? "?lang=en" : ""}`}
              aria-current={p.id === hub.id ? "location" : undefined}
            >
              {en ? p.en : p.label}
              {p.id === hub.id ? t(" · 선택한 장소", " · selected") : ""}
            </Link>
          </li>
        ))}
      </ul>
      <a
        className={styles.link}
        href={OFFICIAL_AIRPORT_MAP}
        target="_blank"
        rel="noreferrer"
      >
        {t("공식 공항 지도에서 위치 확인", "Check the official airport map")} ↗
      </a>
      {photo && (
        <details>
          <summary>
            {t("공통 만남 표지 디자인 참고", "Meeting-sign design reference")}
          </summary>
          <figure style={{ margin: "1rem 0" }}>
            <Image
              className={styles.photo}
              src="/images/meeting-point-demo.png"
              width={1448}
              height={1086}
              alt={t(
                "만남 표지 구조물 디자인 시안",
                "Meeting-sign structure design concept",
              )}
              sizes="(max-width: 760px) 90vw, 400px"
            />
            <figcaption className={styles.demo}>
              {t(
                "공통 구조물 시안 · 이 장소의 실제 사진 아님",
                "Shared structure concept · not a photo of this location",
              )}
            </figcaption>
          </figure>
        </details>
      )}
    </section>
  );
}
