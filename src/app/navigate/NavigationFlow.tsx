"use client";
import Link from "next/link";
import { useState } from "react";
import { Navigation, ArrowRight, MapPin } from "lucide-react";
import { PlaceFinder } from "../components/PlaceFinder";
import { FacilityMapPicker } from "../components/FacilityMapPicker";
import { IdleGuard } from "../components/IdleGuard";
import { placeOf } from "@/lib/airport";
import { MAP_FACILITIES, facilityId, mapFacilityOf, facilityForPlace, areaBuilding, type MapFacility } from "@/lib/map-facilities";
import type { MapState } from "../../../components/AirportMap";
import type { KioskReturn } from "@/lib/help-entry";
import { textOf } from "@/lib/i18n";

export function NavigationFlow({en, initialGate="", initialPlace="", fixedPlace=false, returnTo="/kiosk/guide", idleAskSec=120, idleAnswerSec=30}: {
  en: boolean; initialGate?: string; initialPlace?: string; fixedPlace?: boolean;
  returnTo?: KioskReturn; idleAskSec?: number; idleAnswerSec?: number;
}) {
  const t = (ko: string, english: string) => en ? english : ko;
  const [place, setPlace] = useState(initialPlace);
  const [mapStart, setMapStart] = useState<MapFacility|null>(null);
  const [destination, setDestination] = useState(()=>{
    const p = MAP_FACILITIES.find(p=>p.name === `탑승구 ${initialGate}`);
    return p ? facilityId(p) : "";
  });
  const [mode, setMode] = useState<"start"|"destination">("destination");
  const [route, setRoute] = useState<MapState["route"]>(null);
  const [distance, setDistance] = useState<number|null>(null);
  const [error, setError] = useState("");
  const from = mapStart ?? facilityForPlace(placeOf(place));
  const target = mapFacilityOf(destination);
  function clearRoute() {setRoute(null);setDistance(null);setError("");}
  function find() {
    clearRoute();
    if (!from) {setError(fixedPlace ? t("이 기기의 정확한 출발 위치가 지도에 연결되지 않았어요. 현장 안내를 요청해 주세요.", "This kiosk location has not been linked to the map. Please ask staff.") : t("지도에서 ‘출발지 선택’을 누르고 현재 계신 시설을 터치해 주세요.", "Choose Start on map and tap the facility where you are."));return;}
    if (!target) {setError(t("지도에서 목적지 시설을 터치해 주세요.", "Tap a destination facility on the map."));return;}
    if (from.building !== target.building || from.area !== target.area) {
      setError(t("서로 다른 터미널·보안구역 사이의 경로는 이 지도에서 안내하지 않아요. 현장 안내를 요청해 주세요.", "This map cannot route between different terminals or security areas. Please ask staff."));return;
    }
    if(from.id===target.id){setError(t("출발지와 목적지가 같아요.", "Start and destination are the same."));return;}
    setRoute({start:{poiId:from.id},end:{poiId:target.id}});
  }
  return <main id="public-main" className="service-workspace">
    <IdleGuard t={textOf(en?"en":"ko")} enabled={fixedPlace} askSec={idleAskSec} answerSec={idleAnswerSec} onTimeout={()=>window.location.assign(returnTo+(en?"?lang=en":""))}/>
    <header className="service-heading"><span className="service-kicker"><Navigation aria-hidden="true"/>{t("바로 이용하는 안내", "SELF-SERVICE DIRECTIONS")}</span><h1>{t("어디로 가시나요?", "Where are you heading?")}</h1><p>{t("지도에서 시설을 터치해 출발지와 목적지를 정해 주세요.", "Tap facilities on the map to set your start and destination.")}</p><span className="service-demo-label">{t("3층 시연 지도 기준", "3F prototype map")}</span></header>
    <div className="service-form-layout"><form className="service-form-card" onSubmit={e=>{e.preventDefault();find();}}>
      <section className="request-section"><h2><span>1</span>{t("출발 위치", "Start location")}</h2>
        {fixedPlace ? <p className="field-current-location"><MapPin/>{en?placeOf(place)?.labelEn:placeOf(place)?.label}</p> : <PlaceFinder id="nav-place" value={place} en={en} onChange={id=>{setPlace(id);setMapStart(null);clearRoute();}}/>}
        {from && <p role="status">{t("출발지: ","Start: ")}{from.name} · {from.description}</p>}
      </section>
      <section className="request-section"><h2><span>2</span>{t("목적지", "Destination")}</h2>
        <div role="group" aria-label={t("지도에서 선택할 위치", "Location to select on map")} style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {!fixedPlace && <button type="button" className="btn" aria-pressed={mode==="start"} onClick={()=>setMode("start")}>{t("출발지 선택", "Choose start")}</button>}
          <button type="button" className="btn" aria-pressed={mode==="destination"} onClick={()=>setMode("destination")}>{t("목적지 선택", "Choose destination")}</button>
        </div>
        <p role="status">{mode==="start"?t("현재 계신 시설을 터치하세요.", "Tap the facility where you are."):t("가고 싶은 시설을 터치하세요.", "Tap the facility you want to visit.")}</p>
        <FacilityMapPicker value={mode==="start"&&mapStart?facilityId(mapStart):mode==="destination"?destination:""} en={en}
          initialBuilding={areaBuilding(placeOf(place)?.area)} start={from} route={route}
          onChange={id=>{clearRoute();if(mode==="start"){setMapStart(mapFacilityOf(id));if(id)setMode("destination");}else setDestination(id);}}
          onRoute={r=>{if(route){setDistance(r?.distance??null);if(!r)setError(t("연결된 통로를 찾지 못했어요. 현장 안내를 요청해 주세요.", "No connected route found. Please ask staff."));}}}
          onError={message=>{setDistance(null);setError(message);}}/>
        {target && <p>{t("목적지: ","Destination: ")}{target.name} · {target.description}</p>}
        <p className="service-muted">{t("같은 터미널·보안구역의 3층 통로만 시연합니다. 계단 없는 이동의 실제 가능 여부는 직원에게 확인해 주세요.", "Prototype routes use same-area 3F corridors. Confirm step-free access with staff.")}</p>
      </section>
      {error&&<p className="error-note" role="alert">{error}</p>}
      <button className="public-button" type="submit">{t("경로 보기", "Show route")}<ArrowRight aria-hidden="true"/></button>
    </form><aside className="service-route-result" aria-live="polite" aria-label={t("경로 결과", "Route result")}>
      <Navigation aria-hidden="true"/><h2>{distance!==null?target?.name:t("나에게 맞는 경로", "Your route")}</h2>
      {distance!==null?<><p>{t("지도에 경로를 표시했어요.","Your route is shown on the map.")}</p><div className="route-metrics"><span>{Math.round(distance)} m</span></div><p>{from?.name} → {target?.name}</p><small>{t("거리와 경로는 시연 자료 기준입니다.","Distance and route use prototype data.")}</small></>:<p>{t("출발지와 목적지를 정한 뒤 경로 보기를 눌러 주세요.","Choose start and destination, then show the route.")}</p>}
      <Link className="public-text-link" href={`/help?topic=guidance&fresh=1${place?"&place="+encodeURIComponent(place):""}${fixedPlace?"&returnTo="+encodeURIComponent(returnTo):""}${en?"&lang=en":""}`}>{t("현장 안내 지원 요청", "Request on-site guidance")}<ArrowRight aria-hidden="true"/></Link>
    </aside></div>
  </main>;
}
