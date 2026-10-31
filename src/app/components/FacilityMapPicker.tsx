"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Armchair, Baby, Banknote, Bus, Check, ChevronDown, ClipboardCheck, Coffee, DoorOpen, HeartPulse, Info, LayoutGrid, Pill, Plane, Search, ShieldCheck, ShoppingBasket, Smile, Toilet, UtensilsCrossed } from "lucide-react";
import AirportMap, { type MapState, type NearbyResult } from "../../../components/AirportMap";
import {
  MAP_FACILITIES, facilityId, mapFacilityOf, areaBuilding,
  facilityAllowed, facilityForPlace, type MapFacility,
} from "@/lib/map-facilities";
import { FACILITY_FILTERS, PRIMARY_FACILITY_FILTERS, facilityInCategory, facilitiesForMapDisplay, type FacilityFilter } from "@/lib/facility-map-filter";
import type { Place } from "@/lib/airport";
import styles from "./facility-map.module.css";

const filterIcons = {all: LayoutGrid, restroom: Toilet, pharmacy: Pill, nursing: Baby, information: Info, children: Smile, lounge: Armchair, support: ShieldCheck, aed: HeartPulse, priority: ShieldCheck, gate: Plane, departure: DoorOpen, entrance: DoorOpen, checkin: ClipboardCheck, food: UtensilsCrossed, cafe: Coffee, convenience: ShoppingBasket, atm: Banknote, exchange: Banknote, bus: Bus};

type Props = {
  value: string;
  onChange: (id: string) => void;
  en?: boolean;
  disabled?: boolean;
  pickup?: Place | null;
  restrictToPickup?: boolean;
  initialBuilding?: 1 | 2 | 3;
  selectedBuilding?: 1 | 2 | 3;
  onBuildingChange?: (building: 1 | 2 | 3) => void;
  focusKey?: number;
  route?: MapState["route"];
  start?: MapFacility | null;
  destination?: MapFacility | null;
  selectionRole?: "start" | "destination";
  kiosk?: boolean;
  hideSelection?: boolean;
  fullscreen?: boolean;
  kioskPanel?: ReactNode;
  kioskFooter?: ReactNode;
  kioskTitle?: string;
  kioskBackHref?: string;
  showSelectionTools?: boolean;
  additionalHelp?: ReactNode;
  onKioskClose?: () => void;
  allowedFacilityIds?: readonly (string | number)[];
  pickupSelection?: boolean;
  onRoute?: (route: { distance: number; coordinates: [number, number][] } | null) => void;
  onError?: (message: string) => void;
};

export function FacilityMapPicker({
  value, onChange, en = false, disabled = false, pickup, restrictToPickup = false,
  initialBuilding = 1, selectedBuilding, onBuildingChange, focusKey = 0, route, start, destination, selectionRole = "destination",
  kiosk = false, hideSelection = false, fullscreen = kiosk, kioskPanel, kioskFooter, kioskTitle, kioskBackHref, showSelectionTools = true, additionalHelp, onKioskClose, allowedFacilityIds, pickupSelection = false, onRoute, onError,
}: Props) {
  const id = useId();
  const shell = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [headerTop, setHeaderTop] = useState(0);
  const [padding, setPadding] = useState<[number,number,number,number]>([0,0,0,0]);
  const full = fullscreen;
  useEffect(() => {
    if (!full) { setPadding([0,0,0,0]); return; }
    const header = document.querySelector<HTMLElement>(".field-task-header, .flow-bar, .public-header");
    const measure = () => {
      setHeaderTop(Math.max(0, header?.getBoundingClientRect().bottom ?? 0));
      const box = shell.current?.getBoundingClientRect();
      if (!box) return;
      const side = panelOpen ? panel.current?.getBoundingClientRect() : null;
      const tools = toolbar.current?.getBoundingClientRect();
      const bottom = side && side.width > box.width * .8 ? Math.max(0, box.bottom - side.top) : 0;
      const left = side && !bottom ? Math.max(0,side.right-box.left) : 0;
      const next: [number,number,number,number] = [Math.ceil(tools?.height ?? 0),0,Math.ceil(bottom),Math.ceil(left)];
      setPadding(previous => previous.every((v,i)=>v===next[i]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [shell.current,panel.current,toolbar.current,header]) if(element) observer.observe(element);
    window.addEventListener("resize",measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize",measure); };
  }, [full,panelOpen]);
  const [building, setBuilding] = useState<1 | 2 | 3>(initialBuilding);
  const [queries, setQueries] = useState({start:"",destination:""});
  const query = queries[selectionRole];
  const setQuery = (value: string) => setQueries(previous => ({...previous,[selectionRole]:value}));
  const [filter, setFilter] = useState<FacilityFilter>("all");
  const [showResults, setShowResults] = useState(false);
  const [landmarks, setLandmarks] = useState(true);
  const [notice, setNotice] = useState("");
  const [mapError, setMapError] = useState("");
  const [viewRevision, setViewRevision] = useState(0);
  const [nearbyResult, setNearbyResult] = useState<NearbyResult | null>(null);
  const selected = mapFacilityOf(value);
  // Explicit terminal navigation is independent of the previously selected facility.
  const activeBuilding = restrictToPickup && pickup ? areaBuilding(pickup.area) : selectedBuilding ?? building;
  const effectiveFilter = pickupSelection ? "all" : filter;
  const allowedIds = allowedFacilityIds === undefined ? null : new Set(allowedFacilityIds.map(String));
  const eligible = (p: MapFacility) => (!allowedIds || allowedIds.has(String(p.id))) && (!restrictToPickup || facilityAllowed(pickup ?? null, p));
  // Pickup eligibility limits selection, never the facilities drawn on the airport map.
  const displayed = facilitiesForMapDisplay(activeBuilding, effectiveFilter, query);
  const filtered = displayed.filter(eligible);
  const filtering = effectiveFilter !== "all" || query.trim().length > 0;
  const t = (ko: string, english: string) => en ? english : ko;
  const end = destination === undefined ? (selectionRole === "destination" ? selected : null) : destination;

  const origin = start ?? facilityForPlace(pickup ?? null);
  const nearby = origin?.building === activeBuilding && selectionRole === "destination" && filtering
    ? { start: { poiId: origin.id }, candidatePoiIds: filtered.map(p => p.id) } : null;
  const nearbyKey = JSON.stringify(nearby);
  const ranked = nearbyResult?.requestKey === nearbyKey ? nearbyResult.results : null;
  const nearest = ranked?.slice(0, 3).flatMap(result => {
    const p = filtered.find(p => String(p.id) === String(result.id));
    return p ? [{ p, distance: result.distance }] : [];
  });

  function choose(p: MapFacility) {
    if (disabled) return;
    if (!eligible(p)) {
      setNotice(t("현재 위치와 같은 터미널·보안구역의 3층 시설을 선택해 주세요.", "Choose a 3F facility in the same terminal and security area."));
      return;
    }
    setNotice("");
    setMapError("");
    setShowResults(false);
    // Category and query deliberately survive a selection and role changes.
    onChange(facilityId(p));
    setViewRevision(n => n + 1);
  }

  const state: MapState = {
    building: activeBuilding,
    checkpointSelection: false,
    showCheckpoints: false,
    selectedPoiId: selected?.building === activeBuilding ? selected.id : null,
    visiblePoiIds: filtering ? displayed.map(p => p.id) : null,
    showLandmarkLabels: landmarks,
    facilityFilterActive: filtering,
    touchTargetSize: kiosk ? 18 : 12,
    viewRevision: viewRevision + focusKey,
    viewportPadding: full ? padding : undefined,
    overview: full && !route && !selected,
    nearby,
    markers: {
      user: origin?.building === activeBuilding ? { poiId: origin.id, label: t("출발지", "Start") } : null,
      destination: end?.building === activeBuilding ? { poiId: end.id, label: end.name } : null,
    },
    route: route && start?.building === activeBuilding && end?.building === activeBuilding ? route : null,
    fit: true,
  };

  const terminalControls = (
    <div className={styles.tabs} role="group" aria-label={t("지도 구역", "Map area")}>
        {([[1, "제1터미널", "Terminal 1"], [3, "탑승동", "Concourse"], [2, "제2터미널", "Terminal 2"]] as const).map(([n, ko, english]) => (
          <button key={n} type="button" aria-pressed={activeBuilding === n}
            disabled={disabled || (restrictToPickup && !!pickup && areaBuilding(pickup.area) !== n)}
            onClick={() => { setBuilding(n); onBuildingChange?.(n); setNotice(""); setMapError(""); setShowResults(false); setViewRevision(v => v + 1); }}>
            {t(ko, english)}
          </button>
        ))}
        <span className={styles.floor}>{t("3층", "3F")}</span>
      </div>
  );
  const searchControls = (
    <div className={styles.searchWrap}>
        <label htmlFor={id} className={styles.searchLabel}><Search className={styles.searchIcon} aria-hidden="true" />{pickupSelection ? t("만날 탑승구 검색", "Find a meeting gate") : t("시설·탑승구 검색", "Find a facility or gate")}</label>
        <div className={styles.searchRow}>
          <input id={id} type="search" value={query} disabled={disabled} maxLength={100}
            placeholder={pickupSelection ? t("출발할 탑승구 번호", "Starting gate number") : t("예: 화장실, 약국, 25번", "e.g. restroom, pharmacy, gate 25")}
            onChange={e => { setQuery(e.target.value); setShowResults(true); }} />
          {(query || filter !== "all") && <button type="button" className={styles.reset} disabled={disabled}
            onClick={() => { setQuery(""); setFilter("all"); setShowResults(false); }}>
            {t("초기화", "Reset")}
          </button>}
        </div>
        {showResults && query.trim() && <div className={styles.results} aria-label={t("검색 결과", "Search results")}>
          {filtered.slice(0, 30).map(p => <button key={p.id} type="button" disabled={disabled} onClick={() => choose(p)}>
            <strong>{p.name}</strong><small>{p.description}</small>
          </button>)}
          {!filtered.length && <p role="status">{t("현재 시설 필터와 검색어에 맞는 장소가 없어요.", "No places match the current category and query.")}</p>}
        </div>}
      </div>
  );
  const extraSelected = !PRIMARY_FACILITY_FILTERS.includes(effectiveFilter);
  const selectedFilterLabel = FACILITY_FILTERS.find(item=>item.id===effectiveFilter);
  const categoryCounts = new Map(FACILITY_FILTERS.map(item=>[item.id, MAP_FACILITIES.filter(p=>p.building===activeBuilding && eligible(p) && facilityInCategory(p,item.id)).length]));
  const filterButton = (item: (typeof FACILITY_FILTERS)[number], card = false) => {
    const Icon = filterIcons[item.id];
    const count = categoryCounts.get(item.id) ?? 0;
    return <button key={item.id} type="button" disabled={disabled || (card && count === 0)} aria-pressed={effectiveFilter === item.id}
      onClick={()=>{setFilter(item.id);setQuery("");setShowResults(false);}}>
      <Icon aria-hidden="true"/><span>{t(item.ko,item.en)}</span>
      {card && <small>{count ? t(`${count}곳`,`${count} places`) : t("이 구역에 없음","None in this area")}</small>}
      {effectiveFilter===item.id && <Check className={styles.selectedCheck} aria-hidden="true"/>}
    </button>;
  };
  const filterControls = !pickupSelection && (
    <div className={styles.filters} role="group" aria-label={t("시설 필터", "Facility filter")}>
      {FACILITY_FILTERS.filter(item=>!full || PRIMARY_FACILITY_FILTERS.includes(item.id)).map(item=>filterButton(item))}
      {full && <details className={styles.moreFacilities}>
        <summary><LayoutGrid aria-hidden="true"/><span>{extraSelected && selectedFilterLabel ? t(selectedFilterLabel.ko,selectedFilterLabel.en) : t("다른 시설","More facilities")}</span><ChevronDown aria-hidden="true"/></summary>
        <div className={styles.facilityCards}>
          {FACILITY_FILTERS.filter(item=>!PRIMARY_FACILITY_FILTERS.includes(item.id)).map(item=>filterButton(item,true))}
        </div>
      </details>}
    </div>
  );
  const nearbyControls = (nearby && <section className={styles.nearby} aria-label={t("출발지에서 가까운 시설", "Facilities near your start")}>
        <div className={styles.nearbyTitle}><strong>{t("출발지에서 가까운 순", "Nearest to your start")}</strong><span>{t("연결된 통로 거리 기준", "By connected corridor distance")}</span></div>
        {ranked === null ? <p role="status">{t("이동 거리를 확인하고 있어요…", "Checking route distances…")}</p> : nearest?.length ? <div className={styles.nearbyCards}>
          {nearest.map(({p,distance},index) => <button key={p.id} type="button" disabled={disabled} aria-pressed={selected?.id === p.id} onClick={() => choose(p)}>
            <strong>{index === 0 ? t("가장 가까움", "Nearest") : `${index + 1}`}. {p.name}</strong>
            <b>{t(`약 ${Math.round(distance)}m`, `About ${Math.round(distance)}m`)}</b><small>{p.description}</small>
          </button>)}
        </div> : <p role="status">{t("출발지와 같은 구역에서 연결된 통로를 찾지 못했어요.", "No connected facilities were found in the same area.")}</p>}
      </section>);
  const metaControls = (
    <div className={styles.mapMeta}>
        <p role="status">{filtering ? t(`조건에 맞는 시설 ${filtered.length}곳`, `${filtered.length} matching facilities`) : (pickupSelection ? t("지도에서 만날 탑승구를 선택하세요", "Choose a meeting gate on the map") : t("시설을 터치해서 선택하세요", "Tap a facility to choose it"))}</p>
        <label className={styles.landmarkToggle}><input type="checkbox" checked={landmarks} disabled={disabled} onChange={e => setLandmarks(e.target.checked)} />{t("주요 위치 이름", "Landmark labels")}</label>
      </div>
  );
  const mapView = (
    <div className={styles.map} aria-disabled={disabled} inert={disabled}>
        <AirportMap state={state} height="100%" onFacilityClick={p => {
          const canonical = MAP_FACILITIES.find(x => String(x.id) === String(p.id));
          if (canonical) choose(canonical);
        }} onNearby={setNearbyResult} onRoute={onRoute} onError={message => { setMapError(message); onError?.(message); }} />
      </div>
  );
  const notices = <>
    <p className={styles.hint}>{t("축소하면 주요 위치만 보여요. 확대하면 시설 아이콘과 이름이 나타나요.", "Zoom out for key locations. Zoom in for facility icons and names.")}</p>
    {filtering && <p className={styles.hint}>{t("선택한 종류의 시설 아이콘만 표시합니다. 회색 글자는 위치 확인용이며 선택되지 않아요.", "Only matching facility icons are shown. Gray landmark labels are for orientation only.")}</p>}
      {!hideSelection && selected && <div className={styles.selection} role="status"><div>
        <small>{t("선택한 목적지", "Selected destination")}</small><strong>{selected.name}</strong><span>{selected.description}</span>
      </div><button type="button" disabled={disabled} onClick={() => onChange("")}>{t("선택 해제", "Clear")}</button></div>}
  </>;
  const errors = <>
    {(notice || mapError) && <p role="alert" className={styles.error}>{notice || mapError}</p>}
    {restrictToPickup && !pickup && <p role="status">{t("현재 위치를 먼저 선택해 주세요.", "Choose your current location first.")}</p>}
  </>;

  if (full) return (
    <div ref={shell} className={styles.fullscreen} data-kiosk="true" data-panel-open={panelOpen} style={{top:headerTop}} aria-label={t("전체 화면 공항 지도", "Full-screen airport map")}>
      <div className={styles.mapBackground}>{mapView}</div>
      <nav ref={toolbar} className={styles.mapToolbar} aria-label={t("지도 메뉴와 터미널", "Map menu and terminal")}>
        <button type="button" className={styles.panelToggle} aria-expanded={panelOpen} aria-label={panelOpen?t("메뉴 접기", "Hide menu"):t("메뉴 펼치기", "Show menu")} onClick={()=>setPanelOpen(v=>!v)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={panelOpen ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
        </button>
        <select className={styles.terminalSelect} aria-label={t("터미널 선택", "Choose terminal")} value={activeBuilding} disabled={disabled || (restrictToPickup && !!pickup)} onChange={e=>{const n=Number(e.target.value) as 1|2|3;setBuilding(n);onBuildingChange?.(n);setNotice("");setMapError("");setShowResults(false);setViewRevision(v=>v+1);}}>
          <option value={1}>{t("제1터미널", "Terminal 1")}</option>
          <option value={3}>{t("탑승동", "Concourse")}</option>
          <option value={2}>{t("제2터미널", "Terminal 2")}</option>
        </select>
      </nav>
      {panelOpen && <aside ref={panel} className={styles.sidePanel} aria-label={t("지도 검색과 경로 설정", "Map search and route settings")}>
        <header className={styles.panelHeading}>
          {kioskBackHref && !onKioskClose && <a className={styles.backButton} href={kioskBackHref} aria-label={t("뒤로 가기", "Go back")} title={t("뒤로 가기", "Go back")}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14" /></svg></a>}
          <div className={styles.panelTitle}><span>{t("3층 안내", "3F guide")}</span><h1>{kioskTitle ?? t("공항 지도", "Airport map")}</h1></div>
          {onKioskClose && <button type="button" onClick={onKioskClose}>{t("선택 완료", "Done")}</button>}
        </header>
        {kioskPanel}{showSelectionTools && <>{searchControls}{filterControls}{nearbyControls}</>}{errors}{kioskFooter}
        <details className={styles.mapHelp}><summary>{t("지도 이용 안내", "Map help")}</summary>{metaControls}{notices}{additionalHelp}</details>
      </aside>}
    </div>
  );
  return <div className={styles.picker} data-kiosk={kiosk}>
    {terminalControls}{searchControls}{filterControls}{nearbyControls}{metaControls}{mapView}{errors}{notices}
  </div>;
}
