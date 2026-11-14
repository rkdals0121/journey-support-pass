"use client";

import AirportMap from "../../../components/AirportMap";
import { MAP_FACILITIES } from "@/lib/map-facilities";
import styles from "./support-journey.module.css";

/**
 * 만남 장소를 실제 공항 실내지도(길 찾기와 같은 지도) 위에 표시한다. 장소를 바꾸면 지도도 그 자리로 옮겨 간다.
 * 만남 장소(service-hubs)마다 지도 자료에서 가장 가까운 시설을 골라 둔다. 자료에 없는 116번 탑승구 앞(탑승동 중앙)은
 * 같은 자리의 탑승동 3층 중앙 안내데스크로 표시한다.
 */
const HUB_POI: Record<string, number> = {
  "t1-departure": 36044, // T1 3층 일반지역 중앙 안내데스크(8번 출입구 부근)
  "t1-care": 33635, // T1 장애인 안심여행센터
  "t1-airside": 34504, // T1 탑승구 25
  concourse: 36041, // 탑승동 3층 중앙 안내데스크
  "t2-departure": 36036, // T2 3층 일반지역 안내데스크
  "t2-airside": 36039, // T2 면세지역 250번 게이트 부근 안내데스크
};

export function hubHasLiveMap(hubId: string) {
  return hubId in HUB_POI;
}

export function HubLiveMap({ hubId, label, en = false }: { hubId: string; label: string; en?: boolean }) {
  const poi = MAP_FACILITIES.find((f) => f.id === HUB_POI[hubId]);
  if (!poi) return null;
  return (
    <div className={styles.liveMap}>
      <AirportMap
        key={hubId}
        height="100%"
        title={en ? `Airport indoor map · ${label}` : `공항 실내지도 · ${label}`}
        state={{
          building: poi.building as 1 | 2 | 3,
          securityArea: poi.area === "LAND" ? "LAND" : "AIR",
          // 입구 고르기(체크포인트) 표시는 끈다: 이 지도는 고른 장소를 보여 주기만 한다
          checkpointSelection: false,
          showCheckpoints: false,
          selectedPoiId: poi.id,
          showLandmarkLabels: true,
          touchTargetSize: 12,
          markers: { destination: { poiId: poi.id, label } },
          fit: true,
        }}
      />
    </div>
  );
}
