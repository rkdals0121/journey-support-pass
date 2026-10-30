"use client";

import { useState, type ReactNode } from "react";
import { requestPlaceOf as placeOf } from "@/lib/service-locations";
import { facilityForPlace, facilityId, mapFacilityOf, areaBuilding, validMapDestination, type MapFacility } from "@/lib/map-facilities";
import { mobilityPickupForFacility } from "@/lib/mobility-map-places";
import { AirportRoutePlanner } from "./AirportRoutePlanner";
import { PlaceFinder } from "./PlaceFinder";
import styles from "../navigate/navigation-map.module.css";

type Props = {
  placeId:string;destinationId:string;initialPlace:string;onChange:(placeId:string,destinationId:string)=>void;
  requestContent?:ReactNode;backHref?:string;en?:boolean;disabled?:boolean;kiosk?:boolean;destinationEnabled?:boolean;
};
export function MobilityMapPlanner({placeId,destinationId,initialPlace,onChange,en=false,disabled=false,kiosk=false,destinationEnabled=true,requestContent,backHref}:Props) {
  const t=(ko:string,english:string)=>en?english:ko;
  const fromPlace=placeOf(placeId),currentPlace=placeOf(initialPlace);
  const from=facilityForPlace(fromPlace),current=facilityForPlace(currentPlace);
  const target=destinationEnabled?mapFacilityOf(destinationId):null;
  const [notice,setNotice]=useState("");
  const [expanded,setExpanded]=useState(true);
  function updatePlace(id:string) {
    setNotice("");
    onChange(id,validMapDestination(placeOf(id),destinationId)?destinationId:"");
  }
  function updateStart(p:MapFacility|null) {
    if (!p) {updatePlace("");return;}
    const pickup=mobilityPickupForFacility(p.id);
    if (!pickup) {setNotice(t("지도에서 만날 시설을 선택해 주세요.","Choose a meeting facility on the map."));return false;}
    updatePlace(pickup.id);
  }
  function updateDestination(p:MapFacility|null) {
    if (p&&fromPlace&&!validMapDestination(fromPlace,facilityId(p))) {setNotice(t("출발지와 같은 터미널·보안구역에서 목적지를 선택해 주세요.","Choose a destination in the same terminal and security area."));return false;}
    setNotice("");onChange(placeId,p?facilityId(p):"");
  }
  const fallback=<>
    {(!from||!current)&&<details className={styles.pickupFallback}><summary>{t("목록·사진으로 출발 위치 찾기","Find a start with a list or photo")}</summary>
      <PlaceFinder id="mobility-start-fallback" value={placeId} en={en} disabled={disabled} photos={!kiosk} showMap={false} onChange={updatePlace}/>
    </details>}
    {!from&&fromPlace&&<p className={styles.locationNote}>{t("선택한 위치는 3층 지도에 연결되지 않았어요. 위치 정보는 그대로 담당자에게 전달합니다.","This location is not linked to the 3F map. Its details will still be sent to staff.")}</p>}
    {notice&&<p role="alert" className={styles.error}>{notice}</p>}
  </>;
  if (!expanded) return <div className={styles.planner}><p>{fromPlace?(en?fromPlace.labelEn:fromPlace.label):""}{target?` → ${target.name}`:""}</p><button type="button" className={styles.primary} onClick={()=>setExpanded(true)}>{t("전체 화면 지도로 선택","Choose on full-screen map")}</button>{fallback}</div>;
  return <AirportRoutePlanner en={en} kiosk={kiosk} disabled={disabled} start={from} destination={target} currentLocation={current}
    onStartChange={updateStart} onDestinationChange={updateDestination}
    onEndpointsChange={(start,end)=>{
      const pickup=start?mobilityPickupForFacility(start.id):null;
      if(start&&!pickup)return false;
      const endId=end?facilityId(end):"";
      if(end&&pickup&&!validMapDestination(pickup,endId))return false;
      setNotice("");onChange(pickup?.id??"",endId);
    }} onUseCurrentLocation={currentPlace?()=>updatePlace(currentPlace.id):undefined}
    initialBuilding={areaBuilding(fromPlace?.area)} destinationEnabled={destinationEnabled&&(!fromPlace||!!from)}
    destinationRestriction={fromPlace}
    startName={!from&&fromPlace?(en?fromPlace.labelEn:fromPlace.label):undefined} startTitle={t("출발지 · 만날 곳","Start · meeting point")}
    title={t("이동 지원 · 만날 곳과 목적지","Assistance · start and destination")} backHref={backHref??"/"}
    instructions={<p className={styles.locationNote}>{t("출발지 칸을 누르고 지도에서 담당자와 만날 시설을 선택해 주세요. 현재 위치 버튼으로 등록된 키오스크 위치를 다시 설정할 수 있어요.","Select Start, then tap a facility to meet staff. Current location restores the registered kiosk location.")}</p>}
    footer={result=><>
      {result.distance!==null&&<p role="status" className={styles.mobilityDistance}>{t(`지도 경로 약 ${Math.round(result.distance)}m`,`Map route about ${Math.round(result.distance)}m`)}</p>}
      {target&&<button type="button" className={styles.clear} disabled={disabled} onClick={result.clearDestination}>{t("목적지는 담당자와 상담해서 정할게요","Confirm the destination with staff")}</button>}
      {fallback}
      {requestContent??<button type="button" className={styles.primary} disabled={disabled||!placeId} onClick={()=>setExpanded(false)}>{t("이 위치로 선택 완료","Use these locations")}</button>}
    </>}/>;
}
