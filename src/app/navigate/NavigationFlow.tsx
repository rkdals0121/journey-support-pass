"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Navigation, Bot, ArrowRight } from "lucide-react";
import { AirportRoutePlanner, type RoutePlannerResult } from "../components/AirportRoutePlanner";
import { IdleGuard } from "../components/IdleGuard";
import { placeOf } from "@/lib/airport";
import { MAP_FACILITIES, facilityForPlace, areaBuilding, type MapFacility } from "@/lib/map-facilities";
import type { KioskReturn } from "@/lib/help-entry";
import { textOf } from "@/lib/i18n";
import styles from "./navigation-map.module.css";

type RobotPhase = "idle" | "guiding" | "arrived" | "ended";
type Props = {
  backHref?: string;
  en: boolean; initialGate?: string; initialPlace?: string; fixedPlace?: boolean; robotGuidance?: boolean;
  returnTo?: KioskReturn; idleAskSec?: number; idleAnswerSec?: number;
};
export function NavigationResult({en,from,target,homeHref,helpHref,isRobotMode,robotPhase,setRobotPhase,result}: {
  en:boolean;from:MapFacility|null;target:MapFacility|null;homeHref:string;helpHref:string;
  isRobotMode:boolean;robotPhase:RobotPhase;setRobotPhase:(phase:RobotPhase)=>void;result:RoutePlannerResult;
}) {
  const t = (ko:string,english:string)=>en?english:ko;
  const {distance,hasResult}=result;
  const chooseAnotherDestination=()=>{setRobotPhase("idle");result.clearDestination();};
  const resultRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(hasResult)resultRef.current?.scrollIntoView({block:"nearest",behavior:"auto"});},[hasResult,robotPhase]);
  if (!hasResult) return null;
  const completionActions = !isRobotMode ? <>
    <button type="button" className={styles.clear} onClick={chooseAnotherDestination}>{t("목적지 다시 선택", "Choose another destination")}</button>
    <Link className={styles.primary} href={homeHref}>{t("처음 화면으로", "Back to home")}<ArrowRight size={20} aria-hidden="true" /></Link>
  </> : robotPhase === "guiding" ? <>
    <p role="status">{t("저니봇이 목적지까지 안내하고 있어요.", "Journey Bot is guiding you to your destination.")}</p>
    <button type="button" className={styles.primary} onClick={()=>setRobotPhase("arrived")}>{t("목적지 도착 확인(시연)", "Confirm arrival (demo)")}</button>
    <button type="button" className={styles.clear} onClick={()=>setRobotPhase("idle")}>{t("안내 취소", "Cancel guidance")}</button>
  </> : robotPhase === "arrived" ? <>
    <p role="status">{t(`${target?.name ?? "목적지"}에 도착했어요.`, `You have arrived at ${target?.name ?? "your destination"}.`)}</p>
    <button type="button" className={styles.primary} onClick={()=>setRobotPhase("ended")}>{t("안내 종료", "End guidance")}</button>
  </> : <>
    {robotPhase === "ended" ? <p role="status">{t("안내가 끝났어요. 저니봇을 이용해 주셔서 감사합니다.", "Guidance has ended. Thank you for using Journey Bot.")}</p> : <button type="button" className={styles.primary} onClick={()=>setRobotPhase("guiding")}>{t("안내 시작", "Start guidance")}</button>}
    <button type="button" className={styles.clear} onClick={chooseAnotherDestination}>{t("목적지 다시 선택", "Choose another destination")}</button>
    <Link className={robotPhase === "ended" ? styles.primary : styles.clear} href={homeHref}>{t("처음 화면으로", "Back to home")}</Link>
  </>;
  const resultTitle = isRobotMode && robotPhase !== "idle"
    ? robotPhase === "guiding" ? t("저니봇 안내 중", "Journey Bot guidance") : robotPhase === "arrived" ? t("목적지 도착", "Destination reached") : t("안내 종료", "Guidance ended")
    : t("경로 확인 완료", "Route ready");
  const summary = (
<aside ref={resultRef} className={styles.summary} aria-live="polite" aria-label={t("경로 결과", "Route result")}>
          {isRobotMode ? <Bot aria-hidden="true" /> : <Navigation aria-hidden="true" />}<h2>{hasResult ? resultTitle : t("한 지도에서 바로 찾기", "Find it on one map")}</h2>
          {hasResult ? <><strong className={styles.distance}>{Math.round(distance!)} m</strong>
            <dl className={styles.routeEndpoints}>
              <div><dt>{t("출발지", "Start")}</dt><dd>{from?.name}<small>{from?.description}</small></dd></div>
              <div><dt>{t("목적지", "Destination")}</dt><dd>{target?.name}<small>{target?.description}</small></dd></div>
            </dl>
            <p>{t("지도에 표시된 경로를 확인해 주세요.", "Check the route displayed on the map.")}</p>
            {isRobotMode && <p className={styles.locationNote}>{t("안내 시연 · 실제 로봇 이동과 자동 도착 감지는 연결되지 않았어요.", "Guidance demo · robot movement and automatic arrival detection are not connected.")}</p>}
            <div className={styles.completionActions}>{completionActions}</div></> : <p>{t("출발지와 목적지 칸을 누르고 지도에서 장소를 선택하세요.", "Select Start or Destination, then choose a place on the map.")}</p>}
          <details className={styles.moreInfo}><summary>{t("이용 전 확인", "Before you go")}</summary><p>{t("3층 시연 지도입니다. 실제 이동·계단 없는 접근 가능 여부는 직원에게 확인해 주세요.", "3F prototype. Confirm actual routes and step-free access with staff.")}</p></details>
          <Link className={styles.help} href={helpHref}>
            {t("현장 안내 지원 요청", "Ask staff for guidance")}<ArrowRight size={18} aria-hidden="true" />
          </Link>
        </aside>
  );
  return summary;
}
export function NavigationFlow({ backHref, en, initialGate = "", initialPlace = "", fixedPlace = false, robotGuidance = false,
  returnTo = "/kiosk/guide", idleAskSec = 120, idleAnswerSec = 30 }: Props) {
  const t=(ko:string,english:string)=>en?english:ko;
  const deviceModeName=useId();
  const [deviceMode,setDeviceMode]=useState<"kiosk"|"robot">(robotGuidance?"robot":"kiosk");
  const [robotPhase,setRobotPhase]=useState<RobotPhase>("idle");
  const isRobotMode=deviceMode==="robot";
  const robotActive=isRobotMode&&(robotPhase==="guiding"||robotPhase==="arrived");
  const currentLocation=facilityForPlace(placeOf(initialPlace));
  const [from,setFrom]=useState<MapFacility|null>(()=>facilityForPlace(placeOf(initialPlace)));
  const [target,setTarget]=useState<MapFacility|null>(()=>MAP_FACILITIES.find(p=>p.name===`탑승구 ${initialGate}`)??null);
  const homeHref=backHref??(fixedPlace?returnTo:isRobotMode?"/devices/robot":"/")+(en?"?lang=en":"");
  const helpHref=`/help?topic=guidance&fresh=1${initialPlace?"&place="+encodeURIComponent(initialPlace):""}${fixedPlace?"&returnTo="+encodeURIComponent(returnTo):""}${en?"&lang=en":""}`;
  const deviceControls=<fieldset className={styles.deviceMode}>
    <legend>{t("이용 기기 · 시연","Device · demo")}</legend>
    {(["kiosk","robot"] as const).map(value=><label key={value}>
      <input type="radio" name={deviceModeName} value={value} checked={deviceMode===value} onChange={()=>{setDeviceMode(value);setRobotPhase("idle");}}/>
      <span>{value==="robot"?t("저니봇","Journey Bot"):t("키오스크","Kiosk")}</span>
    </label>)}
  </fieldset>;
  return <main id="public-main" className={styles.workspace} data-kiosk={fixedPlace}>
    <IdleGuard t={textOf(en?"en":"ko")} enabled={fixedPlace&&!robotActive} askSec={idleAskSec} answerSec={idleAnswerSec} onTimeout={()=>window.location.assign(returnTo+(en?"?lang=en":""))}/>
    <AirportRoutePlanner en={en} kiosk={fixedPlace} disabled={robotActive} start={from} destination={target} currentLocation={currentLocation}
      onStartChange={p=>{setFrom(p);setRobotPhase("idle");}} onDestinationChange={p=>{setTarget(p);setRobotPhase("idle");}}
      initialBuilding={areaBuilding(placeOf(initialPlace)?.area)}
      title={isRobotMode?t("저니봇 길 안내","Journey Bot guidance"):t("탑승구·시설 찾기","Gates & facilities")}
      backHref={homeHref} beforeControls={deviceControls}
      instructions={robotActive?<p className={styles.instruction} role="status">{t("아래에서 저니봇 안내 상태를 확인하세요","Check Journey Bot guidance below")}</p>:undefined}
      footer={result=><>
        {!result.hasResult&&<div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={result.pending||robotActive} onClick={result.findRoute}>{result.pending?t("경로 확인 중…","Finding route…"):t("경로 보기","Show route")}<ArrowRight size={20} aria-hidden="true"/></button>
          <button type="button" className={styles.clear} disabled={robotActive} onClick={result.reset}>{t("다시 선택","Start over")}</button>
        </div>}
        <NavigationResult en={en} from={from} target={target} homeHref={homeHref} helpHref={helpHref} isRobotMode={isRobotMode} robotPhase={robotPhase} setRobotPhase={setRobotPhase} result={result}/>
      </>}/>
  </main>;
}
