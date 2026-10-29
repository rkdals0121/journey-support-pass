"use client";
import { useId, useState } from "react";
import AirportMap, { type MapState } from "../../../components/AirportMap";
import { MAP_FACILITIES, facilityId, mapFacilityOf, areaBuilding, facilityAllowed, type MapFacility } from "@/lib/map-facilities";
import type { Place } from "@/lib/airport";
import styles from "./facility-map.module.css";

type Props = {
  value: string;
  onChange: (id: string) => void;
  en?: boolean;
  disabled?: boolean;
  pickup?: Place | null;
  restrictToPickup?: boolean;
  initialBuilding?: 1 | 2 | 3;
  route?: MapState["route"];
  start?: MapFacility | null;
  onRoute?: (route: {distance: number; coordinates: [number, number][]} | null) => void;
  onError?: (message: string) => void;
};
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export function FacilityMapPicker({value, onChange, en=false, disabled=false, pickup, restrictToPickup=false, initialBuilding=1, route, start, onRoute, onError}: Props) {
  const id = useId();
  const [building, setBuilding] = useState<1|2|3>(initialBuilding);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [mapError, setMapError] = useState("");
  const selected = mapFacilityOf(value);
  const activeBuilding = restrictToPickup && pickup ? areaBuilding(pickup.area) : selected?.building ?? building;
  const eligible = (p: MapFacility) => !restrictToPickup || facilityAllowed(pickup ?? null, p);
  const q = normalize(query);
  const matches = q ? MAP_FACILITIES.filter(p => p.building === activeBuilding && eligible(p) && normalize(p.name + " " + p.description).includes(q)).slice(0, 30) : [];
  const t = (ko: string, english: string) => en ? english : ko;
  function choose(p: MapFacility) {
    if (disabled) return;
    if (!eligible(p)) {
      setNotice(t("현재 위치와 같은 터미널·보안구역의 3층 시설을 선택해 주세요.", "Select a facility on 3F in the same terminal and security area."));
      return;
    }
    setNotice(""); setMapError(""); setQuery(""); onChange(facilityId(p));
  }
  const state: MapState = {
    building: activeBuilding as 1|2|3,
    checkpointSelection: false, showCheckpoints: false,
    selectedPoiId: selected?.id,
    markers: { user: start?.building === activeBuilding ? {poiId: start.id, label: t("출발지", "Start")} : null,
      destination: selected ? {poiId: selected.id, label:selected.name} : null },
    route: route ?? null, fit: !!selected || !!route,
  };
  return <div className={styles.picker}>
    <p className={styles.hint}>{t("지도를 확대해서 시설을 터치하세요. 검색 결과를 눌러도 선택할 수 있어요.", "Zoom in and tap a facility, or choose a search result.")}</p>
    <div className={styles.tabs} role="group" aria-label={t("지도 구역", "Map area")}>
      {([[1,"제1터미널","Terminal 1"],[3,"탑승동","Concourse"],[2,"제2터미널","Terminal 2"]] as const).map(([n,ko,english]) => <button key={n} type="button" aria-pressed={activeBuilding===n} disabled={disabled || (restrictToPickup && !!pickup && areaBuilding(pickup.area)!==n)} onClick={()=>{setBuilding(n);setQuery("");setNotice("");onChange("");}}>{t(ko,english)}</button>)}
      <span>3F</span>
    </div>
    <label htmlFor={id}>{t("시설·탑승구 검색", "Search facilities or gates")}</label>
    <input id={id} type="search" value={query} disabled={disabled} maxLength={100} placeholder={t("예: 130, 화장실, 약국", "e.g. 130, restroom, pharmacy")} onChange={e=>setQuery(e.target.value)} />
    {q && <div className={styles.results} aria-label={t("검색 결과", "Search results")}>
      {matches.map(p=><button key={p.id} type="button" disabled={disabled} onClick={()=>choose(p)}><strong>{p.name}</strong><small>{p.description}</small></button>)}
      {!matches.length && <p role="status">{t("이 구역에서 선택할 수 있는 시설을 찾지 못했어요.", "No selectable facilities found in this area.")}</p>}
    </div>}
    <div className={styles.map} aria-disabled={disabled} inert={disabled}>
      <AirportMap state={state} height={420} onFacilityClick={p=>{const canonical=MAP_FACILITIES.find(x=>String(x.id)===String(p.id));if(canonical)choose(canonical);}} onRoute={onRoute} onError={message=>{setMapError(message);onError?.(message);}} />
    </div>
    {selected && <div className={styles.selection} role="status"><div><small>{t("선택한 시설", "Selected facility")}</small><strong>{selected.name}</strong><span>{selected.description}</span></div><button type="button" disabled={disabled} onClick={()=>onChange("")}>{t("선택 해제", "Clear")}</button></div>}
    {(notice || mapError) && <p role="alert">{notice || mapError}</p>}
    {restrictToPickup && !pickup && <p role="status">{t("현재 위치를 먼저 선택하면 같은 구역의 목적지를 고를 수 있어요.", "Choose your current location first.")}</p>}
    <small className={styles.hint}>{t("3층 시연 지도 · 실제 이동 및 지원 가능 여부는 직원 확인이 필요해요.", "3F prototype map. Confirm actual routes and assistance with staff.")}</small>
  </div>;
}
