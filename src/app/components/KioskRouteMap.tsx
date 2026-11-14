"use client";

import AirportMap from "../../../components/AirportMap";
import { placeOf } from "@/lib/airport";
import { MAP_FACILITIES, facilityForPlace } from "@/lib/map-facilities";

/**
 * 키오스크 「가는 길」 화면의 지도. 내비게이션처럼 지금 계신 곳에서 목적지까지 길을 그린다.
 * 같은 건물 안이면 길을 그리고, 셔틀트레인으로 건물을 옮기는 길이면 목적지 쪽 지도에 도착 지점만 표시한다.
 * 시설로 가는 길은 그 시설이 붙어 있는 탑승구를 도착 지점으로 쓴다(지도 자료의 시설 이름과 안내 시설 종류가 1:1 이 아니어서).
 */
export function KioskRouteMap({ fromPlaceId, gate, label, en = false }: { fromPlaceId: string | null; gate: number; label: string; en?: boolean }) {
  const from = facilityForPlace(placeOf(fromPlaceId ?? ""));
  const to = MAP_FACILITIES.find((f) => f.name === `탑승구 ${gate}`) ?? null;
  if (!to) return null;
  const same = !!from && from.building === to.building;
  return (
    <div className="kc-route-map-frame">
    <AirportMap
      height="100%"
      minHeight={0}
      title={en ? `Route map · ${label}` : `가는 길 지도 · ${label}`}
      state={{
        building: to.building as 1 | 2 | 3,
        securityArea: to.area === "LAND" ? "LAND" : "AIR",
        checkpointSelection: false,
        showCheckpoints: false,
        showLandmarkLabels: true,
        touchTargetSize: 18,
        markers: {
          user: same && from ? { poiId: from.id, label: en ? "You are here" : "지금 계신 곳" } : null,
          destination: { poiId: to.id, label },
        },
        route: same && from ? { start: { poiId: from.id }, end: { poiId: to.id } } : null,
        fit: true,
      }}
    />
    </div>
  );
}
