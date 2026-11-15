"use client";

import AirportMap from "../../../components/AirportMap";
import { MAP_FACILITIES } from "@/lib/map-facilities";
import { HUB_POI } from "@/lib/hub-map";
import styles from "./support-journey.module.css";

/** 만남 장소를 실제 공항 실내지도(길 찾기와 같은 지도) 위에 표시한다. 장소를 바꾸면 지도도 그 자리로 옮겨 간다. */
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
