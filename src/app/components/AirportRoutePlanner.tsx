"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Flag, LocateFixed, MapPin } from "lucide-react";
import { FacilityMapPicker } from "./FacilityMapPicker";
import { facilityId, mapFacilityOf, type MapFacility } from "@/lib/map-facilities";
import type { Place } from "@/lib/airport";
import type { MapState } from "../../../components/AirportMap";
import styles from "../navigate/navigation-map.module.css";

export type RoutePlannerResult = {
  distance: number | null;
  pending: boolean;
  error: string;
  hasResult: boolean;
  findRoute: () => void;
  clearDestination: () => void;
  reset: () => void;
};
type Props = {
  start: MapFacility | null;
  destination: MapFacility | null;
  currentLocation: MapFacility | null;
  onStartChange: (facility: MapFacility | null) => boolean | void;
  onDestinationChange: (facility: MapFacility | null) => boolean | void;
  onUseCurrentLocation?: () => void;
  onEndpointsChange?: (start: MapFacility | null, destination: MapFacility | null) => boolean | void;
  en?: boolean;
  kiosk?: boolean;
  disabled?: boolean;
  initialBuilding?: 1 | 2 | 3;
  destinationEnabled?: boolean;
  allowedStartIds?: readonly (string | number)[];
  startRestriction?: Place | null;
  destinationRestriction?: Place | null;
  startName?: string;
  startTitle?: string;
  title: string;
  backHref: string;
  beforeControls?: ReactNode;
  instructions?: ReactNode;
  footer: (result: RoutePlannerResult) => ReactNode;
};

/** One map and endpoint controller for directions and mobility assistance. */
export function AirportRoutePlanner({start, destination, currentLocation, onStartChange, onDestinationChange, onUseCurrentLocation, onEndpointsChange,
  en = false, kiosk = false, disabled = false, initialBuilding = 1, destinationEnabled = true,
  allowedStartIds, startRestriction, destinationRestriction, startName, startTitle, title, backHref,
  beforeControls, instructions, footer}: Props) {
  const t = (ko: string, english: string) => en ? english : ko;
  const shell = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"start" | "destination">(start && destinationEnabled ? "destination" : "start");
  const [building, setBuilding] = useState<1 | 2 | 3>(start?.building as 1 | 2 | 3 ?? initialBuilding);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{key: string; distance: number | null; error: string} | null>(null);
  const startId = start?.id;
  const startBuilding = start?.building;
  useEffect(() => {
    setBuilding(startBuilding as 1 | 2 | 3 ?? initialBuilding);
  }, [startId, startBuilding, initialBuilding]);
  useEffect(() => {
    setMode(startId && destinationEnabled ? "destination" : "start");
    setNotice("");
  }, [startId, destinationEnabled]);
  const activeMode = destinationEnabled ? mode : "start";
  const end = destinationEnabled ? destination : null;
  const incompatible = !!start && !!end && (start.building !== end.building || start.area !== end.area);
  const same = !!start && !!end && start.id === end.id;
  const route: MapState["route"] = start && end && !incompatible && !same
    ? {start:{poiId:start.id},end:{poiId:end.id}} : null;
  const routeKey = JSON.stringify(route);
  const currentResult = result?.key === routeKey ? result : null;
  const pending = !!route && !currentResult;
  const distance = currentResult?.distance ?? null;
  const error = notice || (incompatible ? t("서로 다른 터미널·보안구역 사이의 경로는 현장 안내를 요청해 주세요.", "Ask staff for routes across terminals or security boundaries.")
    : same ? t("출발지와 목적지가 같아요.", "Start and destination are the same.") : currentResult?.error ?? "");
  function invalidate() { setNotice(""); setResult(null); setRevision(n => n + 1); }
  function choose(id: string) {
    if (disabled) return;
    const facility = mapFacilityOf(id);
    const accepted = activeMode === "start" ? onStartChange(facility) : onDestinationChange(facility);
    if (accepted === false) return;
    invalidate();
    if (facility) setBuilding(facility.building as 1 | 2 | 3);
    if (activeMode === "start" && facility && destinationEnabled) setMode("destination");
    else if (activeMode === "destination" && !start) setMode("start");
  }
  function findRoute() {
    if (disabled) return;
    if (!start) { setMode("start"); setNotice(t("출발지를 먼저 선택해 주세요.", "Choose your start first.")); return; }
    if (!end) { setMode("destination"); setNotice(t("가고 싶은 목적지를 선택해 주세요.", "Choose your destination.")); return; }
    invalidate();
  }
  function clearDestination() {
    if (disabled || onDestinationChange(null) === false) return;
    invalidate(); setMode("destination");
    if (start) setBuilding(start.building as 1 | 2 | 3);
    const search = shell.current?.querySelector<HTMLInputElement>('input[type="search"]');
    search?.focus({preventScroll:true}); search?.scrollIntoView({block:"nearest",behavior:"auto"});
  }
  function reset() {
    if (disabled) return;
    if (onEndpointsChange ? onEndpointsChange(currentLocation,null) === false : (onStartChange(currentLocation) === false || onDestinationChange(null) === false)) return;
    invalidate(); setMode(currentLocation && destinationEnabled ? "destination" : "start");
    setBuilding(currentLocation?.building as 1 | 2 | 3 ?? initialBuilding);
  }
  const controls = <>
    {beforeControls}
    <div className={styles.endpoints} role="group" aria-label={t("출발지·목적지", "Start and destination")}>
      <div className={styles.startControl}>
        <button type="button" className={styles.endpoint} disabled={disabled} aria-pressed={activeMode === "start"} onClick={()=>setMode("start")}>
          <MapPin size={22} aria-hidden="true"/><span><small>{startTitle ?? t("출발지", "Start")}{start?.id === currentLocation?.id && currentLocation ? t(" · 현재 위치", " · Current") : ""}</small>
            <strong>{startName ?? start?.name ?? t("출발지 선택", "Choose start")}</strong>{start && <em>{start.description}</em>}</span>
        </button>
        <button type="button" className={styles.current} disabled={disabled || (!currentLocation && !onUseCurrentLocation)}
          title={currentLocation || onUseCurrentLocation ? t("등록된 기기 위치를 출발지로 설정", "Use the registered device location") : t("이 화면에 등록된 기기 위치가 없어요", "No device location is registered here")}
          onClick={()=>{if (onUseCurrentLocation) {onUseCurrentLocation();invalidate();setMode(destinationEnabled?"destination":"start");return;}if (currentLocation && onStartChange(currentLocation) !== false) {invalidate();setBuilding(currentLocation.building as 1 | 2 | 3);setMode(destinationEnabled ? "destination" : "start");}}}>
          <LocateFixed aria-hidden="true"/>{t("현재 위치", "Current location")}
        </button>
      </div>
      {destinationEnabled && <>
        <button type="button" className={styles.swap} disabled={disabled || !start || !end || !!allowedStartIds && !allowedStartIds.some(id=>String(id)===String(end.id))}
          aria-label={t("출발지와 목적지 바꾸기", "Swap start and destination")}
          onClick={()=>{const accepted=onEndpointsChange ? onEndpointsChange(end,start) : onStartChange(end) !== false && onDestinationChange(start);if(accepted!==false)invalidate();}}><ArrowLeftRight aria-hidden="true"/></button>
        <button type="button" className={styles.endpoint} disabled={disabled} aria-pressed={activeMode === "destination"} onClick={()=>setMode("destination")}>
          <Flag size={22} aria-hidden="true"/><span><small>{t("목적지", "Destination")}</small><strong>{end?.name ?? t("목적지 선택", "Choose destination")}</strong>{end && <em>{end.description}</em>}</span>
        </button>
      </>}
    </div>
    {instructions ?? <>
      {!currentLocation && <p className={styles.locationNote}>{t("등록된 기기 위치가 없어요. 출발지를 직접 골라 주세요.", "No device location is registered. Choose a starting point on the map.")}</p>}
      <div className={styles.instruction} role="status"><span>{activeMode === "start" ? "1" : "2"}</span>
        {activeMode === "start" ? t("지도에서 출발할 시설을 터치하세요", "Tap your starting facility") : t("지도에서 도착할 시설을 터치하세요", "Tap your destination facility")}
      </div>
    </>}
  </>;
  const restriction = activeMode === "start" ? startRestriction : start ? destinationRestriction : null;
  return <div ref={shell} className={styles.planner} data-kiosk={kiosk}>
    <FacilityMapPicker value={(activeMode === "start" ? start : end) ? facilityId((activeMode === "start" ? start : end)!) : ""}
      onChange={choose} en={en} kiosk={kiosk} disabled={disabled} fullscreen hideSelection
      start={start} destination={end} selectionRole={activeMode} route={route}
      initialBuilding={building} selectedBuilding={building} onBuildingChange={setBuilding} focusKey={revision}
      pickup={restriction} restrictToPickup={!!restriction}
      allowedFacilityIds={activeMode === "start" ? allowedStartIds : undefined} pickupSelection={activeMode === "start" && !!allowedStartIds}
      kioskTitle={title} kioskBackHref={backHref} kioskPanel={<div className={styles.kioskInputs}>{controls}</div>}
      kioskFooter={<>{error && <p className={styles.error} role="alert">{error}</p>}{footer({distance,pending,error,hasResult:distance !== null && !pending && !error,findRoute,clearDestination,reset})}</>}
      onRoute={response=>{if(route)setResult({key:routeKey,distance:response?.distance ?? null,error:response ? "" : t("연결된 통로를 찾지 못했어요. 현장 안내를 요청해 주세요.", "No connected route was found. Please ask staff.")});}}
      onError={message=>setResult({key:routeKey,distance:null,error:message})}/>
  </div>;
}
