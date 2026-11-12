"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Flag, LocateFixed, MapPin, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { FacilityMapPicker } from "./FacilityMapPicker";
import { useSpeech } from "./useSpeech";
import { facilityId, mapFacilityOf, mapFacilityPlace, type MapFacility } from "@/lib/map-facilities";
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
  deviceLayout?: "kiosk" | "robot";
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
  selectionControls?: ReactNode;
  instructions?: ReactNode;
  showSelectionTools?: boolean;
  additionalHelp?: ReactNode;
  pageHeading?: boolean;
  footer: (result: RoutePlannerResult) => ReactNode;
};

/** One map and endpoint controller for directions and mobility assistance. */
export function AirportRoutePlanner({start, destination, currentLocation, onStartChange, onDestinationChange, onUseCurrentLocation, onEndpointsChange,
  en = false, kiosk = false, deviceLayout: requestedLayout, disabled = false, initialBuilding = 1, destinationEnabled = true,
  allowedStartIds, startRestriction, destinationRestriction, startName, startTitle, title, backHref,
  beforeControls, selectionControls, instructions, showSelectionTools = true, additionalHelp, pageHeading = false, footer}: Props) {
  const t = (ko: string, english: string) => en ? english : ko;
  const shell = useRef<HTMLDivElement>(null);
  const [phoneViewport, setPhoneViewport] = useState(false);
  useEffect(() => {
    if (kiosk) return;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setPhoneViewport(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, [kiosk]);

  const compactMobile = !kiosk && phoneViewport;
  // Robot assistance can run on a phone without using the robot display layout.
  const deviceLayout = compactMobile && requestedLayout === "robot" ? undefined : requestedLayout;
  const deviceControls = kiosk || deviceLayout === "robot";
  const previousTools = useRef(showSelectionTools);
  useEffect(() => {
    if (previousTools.current !== showSelectionTools) {
      const target = shell.current?.querySelector<HTMLElement>(showSelectionTools ? 'input[type="search"]' : 'h2[tabindex="-1"]');
      target?.focus({preventScroll:true});
      target?.scrollIntoView({block:"nearest"});
    }
    previousTools.current = showSelectionTools;
  }, [showSelectionTools]);
  const [mode, setMode] = useState<"start" | "destination">(start && destinationEnabled ? "destination" : "start");
  const [building, setBuilding] = useState<1 | 2 | 3>(start?.building as 1 | 2 | 3 ?? initialBuilding);
  const [revision, setRevision] = useState(0);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [voice, setVoice] = useState(false);
  const {supported, speaking, speak, stop} = useSpeech(en ? "en" : "ko", true);
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
  const stepText = !showSelectionTools ? t("장소를 확인하고 필요한 도움을 선택해 주세요.", "Check the meeting place and choose the help you need.")
    : disabled ? t("아래에서 안내 상태를 확인해 주세요.", "Check guidance below.")
    : activeMode === "start" ? t("지금 계신 곳을 눌러주세요", "Choose where you are now")
    : t("가고 싶은 곳을 눌러주세요", "Choose where you want to go");
  const spokenText = error || (pending ? t("경로를 확인하고 있어요.", "Finding your route.") : distance !== null
    ? t(`${start?.name ?? "출발지"}에서 ${end?.name ?? "목적지"}까지 약 ${Math.round(distance)}미터입니다. ${stepText}`, `About ${Math.round(distance)} metres from ${start?.name ?? "your start"} to ${end?.name ?? "your destination"}. ${stepText}`)
    : `${start ? t(`선택한 곳은 ${start.name}입니다. `, `Selected ${start.name}. `) : ""}${stepText}`);
  useEffect(() => {
    if (voice && supported) speak(spokenText);
  }, [voice, supported, spokenText, speak]);
  // 소리 안내 단추는 제목 줄 오른쪽에 둥근 그림 단추로 둔다(위쪽 바의 소리 단추와 같은 모양). 이름은 화면 읽기 프로그램이 읽는다.
  const voiceControls = <div className={styles.voiceControls} data-icon-only="true">
    <button type="button" className={styles.voiceButton} disabled={!supported} aria-pressed={voice} aria-label={voice ? t("소리 안내 끄기", "Turn voice off") : t("소리로 듣기", "Listen")} title={voice ? t("소리 안내 끄기", "Turn voice off") : t("소리로 듣기", "Listen")}
      onClick={()=>{if (voice) stop(); setVoice(v=>!v);}}>
      {voice ? <VolumeX aria-hidden="true"/> : <Volume2 aria-hidden="true"/>}
      <span className="sr-only">{voice ? t("소리 안내 끄기", "Turn voice off") : t("소리로 듣기", "Listen")}</span>
    </button>
    {voice && <button type="button" className={styles.voiceButton} aria-label={speaking ? t("잠깐 멈추기", "Pause") : t("다시 듣기", "Repeat")} title={speaking ? t("잠깐 멈추기", "Pause") : t("다시 듣기", "Repeat")} onClick={()=>speaking ? stop() : speak(spokenText)}>
      <RotateCcw aria-hidden="true"/><span className="sr-only">{speaking ? t("잠깐 멈추기", "Pause") : t("다시 듣기", "Repeat")}</span>
    </button>}
    {!supported && <small className="sr-only">{t("이 기기는 소리 안내를 지원하지 않아요.", "Voice is unavailable on this device.")}</small>}
  </div>;
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
    setSearchResetKey(key => key + 1);
  }
  function reset() {
    if (disabled) return;
    if (onEndpointsChange ? onEndpointsChange(currentLocation,null) === false : (onStartChange(currentLocation) === false || onDestinationChange(null) === false)) return;
    invalidate(); setMode(currentLocation && destinationEnabled ? "destination" : "start");
    setBuilding(currentLocation?.building as 1 | 2 | 3 ?? initialBuilding);
  }
  function resetEndpoints() {
    if (disabled) return;
    if (onEndpointsChange ? onEndpointsChange(null, null) === false : (onStartChange(null) === false || onDestinationChange(null) === false)) return;
    invalidate(); setMode("start");
    setSearchResetKey(key => key + 1);
  }
  const controls = <>
    <div className={styles.endpoints} role="group" aria-label={t("출발지·목적지", "Start and destination")}>
      <div className={styles.startControl}>
        <button type="button" className={styles.endpoint} disabled={disabled} aria-pressed={activeMode === "start"} onClick={()=>setMode("start")}>
          <MapPin size={22} aria-hidden="true"/><span><small>{startTitle ?? t("출발지", "Start")}{start?.id === currentLocation?.id && currentLocation ? t(" · 현재 위치", " · Current") : ""}</small>
            <strong>{startName ?? start?.name ?? t("출발지 선택", "Choose start")}</strong>{start && <em>{start.description}</em>}</span>
        </button>
        {/* 이 기기에 등록된 위치가 없으면(휴대전화·웹) 누를 수 없는 단추를 흐리게 두지 않고 아예 감춘다 */}
        {(currentLocation || onUseCurrentLocation) && <button type="button" className={styles.current} disabled={disabled}
          title={t("등록된 기기 위치를 출발지로 설정", "Use the registered device location")}
          onClick={()=>{if (onUseCurrentLocation) {onUseCurrentLocation();invalidate();setMode(destinationEnabled?"destination":"start");return;}if (currentLocation && onStartChange(currentLocation) !== false) {invalidate();setBuilding(currentLocation.building as 1 | 2 | 3);setMode(destinationEnabled ? "destination" : "start");}}}>
          <LocateFixed aria-hidden="true"/>{/* 웹·키오스크는 바꾸기 단추와 같은 둥근 그림 단추(좁은 칸에서 출발지 이름이 꺾이던 것). 이름은 화면 읽기용 */}<span className={deviceLayout === "robot" ? undefined : "sr-only"}>{t("현재 위치", "Current location")}</span>
        </button>}
      </div>
      {destinationEnabled && <>
        <div className={styles.destinationControl}>
          <button type="button" className={styles.endpoint} disabled={disabled} aria-pressed={activeMode === "destination"} onClick={()=>setMode("destination")}>
            <Flag size={22} aria-hidden="true"/><span><small>{t("목적지", "Destination")}</small><strong>{end?.name ?? t("목적지 선택", "Choose destination")}</strong>{end && <em>{end.description}</em>}</span>
          </button>
          <div className={styles.endpointActions}>
          <button type="button" className={styles.destinationChange} disabled={disabled}
            aria-label={t("출발지와 목적지 다시 설정", "Reset start and destination")} onClick={resetEndpoints}>
            <RotateCcw aria-hidden="true"/>{t("다시 설정", "Reset")}
          </button>
          <button type="button" className={styles.swap} disabled={disabled || !start || !end || !!allowedStartIds && !allowedStartIds.some(id=>String(id)===String(end.id))}
            aria-label={t("출발지와 목적지 바꾸기", "Swap start and destination")}
            title={t("출발지와 목적지 바꾸기", "Swap start and destination")}
            onClick={()=>{const accepted=onEndpointsChange ? onEndpointsChange(end,start) : onStartChange(end) !== false && onDestinationChange(start);if(accepted!==false)invalidate();}}><ArrowLeftRight aria-hidden="true"/></button>
          </div>
        </div>
      </>}
    </div>
  </>;
  const selectionInstructions = instructions ?? (!showSelectionTools ? null : <div className={styles.instruction} role="status">
    <span>{activeMode === "start" ? "1" : "2"}</span>{stepText}
  </div>);
  const restriction = activeMode === "start" ? startRestriction : start ? destinationRestriction ?? mapFacilityPlace(facilityId(start)) : null;
  return <div ref={shell} className={styles.planner} data-kiosk={deviceControls} data-device-layout={deviceLayout}>
    <FacilityMapPicker value={(activeMode === "start" ? start : end) ? facilityId((activeMode === "start" ? start : end)!) : ""}
      onChange={choose} en={en} kiosk={deviceControls} compactMobile={compactMobile} deviceLayout={deviceLayout} disabled={disabled} fullscreen hideSelection
      start={start} destination={end} selectionRole={activeMode} route={route}
      initialBuilding={building} selectedBuilding={building} onBuildingChange={setBuilding} focusKey={revision}
      pickup={restriction} restrictToPickup={!!restriction}
      allowedFacilityIds={activeMode === "start" ? allowedStartIds : undefined} pickupSelection={activeMode === "start" && !!allowedStartIds}
      pageHeading={pageHeading} showSelectionTools={showSelectionTools} searchResetKey={searchResetKey}
      selectionInstructions={selectionInstructions}
      additionalHelp={<>{additionalHelp}{beforeControls && <details className={styles.moreInfo}>
        <summary>{t("시연 기기 설정", "Demo device settings")}</summary>{beforeControls}
      </details>}</>}
      kioskTitle={title} kioskHeadingAction={voiceControls} kioskBackHref={backHref} kioskPanel={<div className={styles.kioskInputs}>{selectionControls}{showSelectionTools && controls}</div>}
      kioskFooter={<div aria-label={t("경로와 지원 진행", "Route and assistance actions")}>{error && <p className={styles.error} role="alert">{error}</p>}{footer({distance,pending,error,hasResult:distance !== null && !pending && !error,findRoute,clearDestination,reset})}
      </div>}
      onRoute={response=>{if(route)setResult({key:routeKey,distance:response?.distance ?? null,error:response ? "" : t("연결된 통로를 찾지 못했어요. 현장 안내를 요청해 주세요.", "No connected route was found. Please ask staff.")});}}
      onError={message=>setResult({key:routeKey,distance:null,error:message})}/>
  </div>;
}
