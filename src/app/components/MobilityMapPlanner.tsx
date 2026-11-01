"use client";

import { useId, useState, type ReactNode } from "react";
import { Bot, MapPin, UserRound } from "lucide-react";
import { requestPlaceOf as placeOf } from "@/lib/service-locations";
import { facilityForPlace, facilityId, mapFacilityOf, areaBuilding, validMapDestination, type MapFacility } from "@/lib/map-facilities";
import { mobilityPickupForFacility } from "@/lib/mobility-map-places";
import { AirportRoutePlanner } from "./AirportRoutePlanner";
import { NavigationResult } from "../navigate/NavigationFlow";
import { PlaceFinder } from "./PlaceFinder";
import styles from "../navigate/navigation-map.module.css";

type Props = {
  initialSupportMode?:"staff"|"robot";
  placeId:string;destinationId:string;initialPlace:string;onChange:(placeId:string,destinationId:string)=>void;
  requestContent?:ReactNode;backHref?:string;en?:boolean;disabled?:boolean;kiosk?:boolean;destinationEnabled?:boolean;
};
export function MobilityMapPlanner({initialSupportMode="staff",placeId,destinationId,initialPlace,onChange,en=false,disabled=false,kiosk=false,destinationEnabled=true,requestContent,backHref}:Props) {
  const t=(ko:string,english:string)=>en?english:ko;
  const fromPlace=placeOf(placeId),currentPlace=placeOf(initialPlace);
  const from=facilityForPlace(fromPlace),current=facilityForPlace(currentPlace);
  const modeName=useId();
  const [supportMode,setSupportMode]=useState<"staff"|"robot">(initialSupportMode);
  const [robotPhase,setRobotPhase]=useState<"idle"|"guiding"|"arrived"|"ended">("idle");
  const robotMode=supportMode==="robot";
  const robotActive=robotMode&&(robotPhase==="guiding"||robotPhase==="arrived");
  const allowDestination=robotMode||destinationEnabled;
  const target=allowDestination?mapFacilityOf(destinationId):null;
  const [notice,setNotice]=useState("");
  const [expanded,setExpanded]=useState(true);
  const [confirming,setConfirming]=useState(false);
  function updatePlace(id:string) {
    setNotice("");setRobotPhase("idle");
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
    setNotice("");setRobotPhase("idle");onChange(placeId,p?facilityId(p):"");
  }
  const alternateFinder=(!from||!current)&&<details className={styles.pickupFallback}><summary>{t("목록·사진으로 출발 위치 찾기","Find a start with a list or photo")}</summary>
      <PlaceFinder id="mobility-start-fallback" value={placeId} en={en} disabled={disabled} photos={!kiosk} showMap={false} onChange={updatePlace}/>
    </details>;
  const fallback=<>
    {!from&&fromPlace&&<p className={styles.locationNote}>{t("선택한 위치는 3층 지도에 연결되지 않았어요. 위치 정보는 그대로 담당자에게 전달합니다.","This location is not linked to the 3F map. Its details will still be sent to staff.")}</p>}
    {notice&&<p role="alert" className={styles.error}>{notice}</p>}
  </>;
  if (!expanded) return <div className={styles.planner}><p>{fromPlace?(en?fromPlace.labelEn:fromPlace.label):""}{target?` → ${target.name}`:""}</p><button type="button" className={styles.primary} onClick={()=>setExpanded(true)}>{t("전체 화면 지도로 선택","Choose on full-screen map")}</button>{fallback}{alternateFinder}</div>;
  return <AirportRoutePlanner en={en} kiosk={kiosk} disabled={disabled||robotActive} start={from} destination={target} currentLocation={current}
    onStartChange={updateStart} onDestinationChange={updateDestination}
    onEndpointsChange={(start,end)=>{
      const pickup=start?mobilityPickupForFacility(start.id):null;
      if(start&&!pickup)return false;
      const endId=end?facilityId(end):"";
      if(end&&pickup&&!validMapDestination(pickup,endId))return false;
      setNotice("");setRobotPhase("idle");onChange(pickup?.id??"",endId);
    }} onUseCurrentLocation={currentPlace?()=>updatePlace(currentPlace.id):undefined}
    initialBuilding={areaBuilding(fromPlace?.area)} destinationEnabled={allowDestination&&(!fromPlace||!!from)}
    destinationRestriction={fromPlace}
    startName={!from&&fromPlace?(en?fromPlace.labelEn:fromPlace.label):undefined} startTitle={robotMode?t("출발지","Start"):t("만날 곳","Meeting place")}
    selectionControls={initialSupportMode!=="robot"&&!confirming&&<fieldset className={styles.deviceMode}>
      <legend>{t("도움받는 방법", "How would you like help?")}</legend>
      {(["staff","robot"] as const).map(value=><label key={value}>
        <input type="radio" name={modeName} value={value} checked={supportMode===value} disabled={disabled}
          onChange={()=>{setSupportMode(value);setRobotPhase("idle");setConfirming(false);}}/>
        {value==="staff"?<UserRound aria-hidden="true"/>:<Bot aria-hidden="true"/>}
        <span>{value==="staff"?t("현장 안내","Staff assistance"):t("저니봇","Journey Bot")}</span>
      </label>)}
    </fieldset>}
    showSelectionTools={!confirming&&!robotActive}
    additionalHelp={!confirming ? alternateFinder : undefined}
    title={t("이동 도움받기","Mobility assistance")} backHref={backHref??"/"}
    footer={result=><>
      {!confirming&&result.distance!==null&&<p role="status" className={styles.mobilityDistance}>{t(`지도 경로 약 ${Math.round(result.distance)}m`,`Map route about ${Math.round(result.distance)}m`)}</p>}
      {!confirming&&!robotMode&&target&&<button type="button" className={styles.clear} disabled={disabled} onClick={result.clearDestination}>{t("목적지는 직원과 정할게요","Choose the destination with staff")}</button>}
      {!confirming && fallback}
      {robotMode ? <>
        {!result.hasResult&&<button type="button" className={styles.primary} disabled={disabled||!from||!target||result.pending} onClick={result.findRoute}>
          {result.pending?t("경로 확인 중…","Finding route…"):t("경로 보기","Show route")}
        </button>}
        <NavigationResult en={en} from={from} target={target} homeHref={backHref??"/"} helpHref="/help?topic=guidance&fresh=1" isRobotMode robotPhase={robotPhase} setRobotPhase={setRobotPhase} result={result}/>
      </> : requestContent ? confirming ? <>
        <h2 className={styles.reviewHeading} tabIndex={-1}>{t("필요한 도움을 확인해 주세요", "Choose the help you need")}</h2>
        <p className={styles.meetingSummary}><MapPin aria-hidden="true"/>{fromPlace ? (en ? fromPlace.labelEn : fromPlace.label) : ""}</p>
        <button type="button" className={styles.clear} disabled={disabled} onClick={()=>setConfirming(false)}>{t("장소 다시 선택", "Change places")}</button>
        {requestContent}
      </> : <button type="button" className={styles.primary} disabled={disabled||!placeId} onClick={()=>setConfirming(true)}>{t("이 장소에서 도움받기", "Get help here")}</button>
      : <button type="button" className={styles.primary} disabled={disabled||!placeId} onClick={()=>setExpanded(false)}>{t("이 위치로 선택 완료","Use these locations")}</button>}
    </>}/>;
}
