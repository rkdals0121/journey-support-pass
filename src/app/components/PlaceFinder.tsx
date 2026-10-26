"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, Search, X } from "lucide-react";
import { PICKUP_PLACES, PLACES, placeOf, type Area } from "@/lib/airport";
import {
  matchPlaces,
  type LocationArea,
  type PlaceMatches,
} from "@/lib/place-search";
import { readLocationPhoto, locationPhotoError } from "@/lib/location-photo";
const areas: { id: LocationArea; ko: string; en: string }[] = [
  { id: "all", ko: "전체", en: "All" },
  { id: "T1", ko: "제1터미널", en: "Terminal 1" },
  { id: "CONCOURSE", ko: "탑승동", en: "Concourse" },
  { id: "T2", ko: "제2터미널", en: "Terminal 2" },
];
export function PlaceFinder({
  id,
  value,
  onChange,
  en = false,
  disabled = false,
  photos = true,
  label,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  en?: boolean;
  disabled?: boolean;
  photos?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState(""),
    [area, setArea] = useState<LocationArea>("all"),
    [photo, setPhoto] = useState<string | null>(null),
    [photoText, setPhotoText] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(!value);
  const fileInput = useRef<HTMLInputElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    sequence = useRef(0),
    photoUrl = useRef<string | null>(null);
  const tr = (ko: string, english: string) => (en ? english : ko),
    selected = placeOf(value);
  const matches: PlaceMatches = matchPlaces(
    photoText ?? query,
    area,
    photoText !== null ? "photo" : "search",
  );
  const quick =
    area === "all" ? [] : PLACES.filter((p) => p.area === area).slice(0, 3);
  function cancel() {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }
  function clearPhoto() {
    cancel();
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = null;
    setPhoto(null);
    setPhotoText(null);
    setError("");
  }
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    },
    [],
  );
  function edit(text: string) {
    clearPhoto();
    setQuery(text);
    setShow(true);
    if (value) onChange("");
  }
  function choose(placeId: string) {
    cancel();
    onChange(placeId);
    setShow(false);
    setError("");
  }
  async function scan(file: File) {
    clearPhoto();
    const mine = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setQuery("");
    setPhotoText(null);
    setShow(true);
    setBusy(true);
    setError("");
    if (value) onChange("");
    const invalid = locationPhotoError(file);
    if (invalid) {
      setBusy(false);
      setError(
        invalid === "photo_too_large"
          ? tr(
              "20MB 이하의 사진을 선택해 주세요.",
              "Choose an image under 20 MB.",
            )
          : tr(
              "JPG·PNG 등의 사진을 선택하거나 직접 찾아 주세요.",
              "Choose a photo such as JPG or PNG, or search manually.",
            ),
      );
      return;
    }
    const url = URL.createObjectURL(file);
    photoUrl.current = url;
    setPhoto(url);
    try {
      const text = await readLocationPhoto(
        file,
        AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]),
      );
      if (sequence.current === mine) setPhotoText(text);
    } catch (e) {
      if (sequence.current !== mine || abort.signal.aborted) return;
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "photo_format"
          ? tr(
              "이 사진을 읽지 못했어요. JPG·PNG 사진을 선택하거나 직접 찾아 주세요.",
              "Could not read this image. Try JPG or PNG, or search manually.",
            )
          : tr(
              "사진을 읽지 못했어요. 다시 찍거나 아래에서 직접 위치를 찾아 주세요.",
              "Could not read the photo. Retake it or find your location below.",
            ),
      );
    } finally {
      if (sequence.current === mine) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  const hasText = photoText !== null || query.trim().length > 0;
  return (
    <div className="place-finder" data-place-finder={id}>
      <label htmlFor={id + "-search"}>
        {label ?? tr("주변에 무엇이 보이나요?", "What can you see nearby?")}
      </label>
      <p className="place-finder-hint" id={id + "-hint"}>
        {tr(
          "지금 계신 곳의 게이트 번호나 안내판을 찾아보세요.",
          "Use the gate number or sign where you are standing.",
        )}
      </p>
      <div className="place-find-actions">
        <div className="place-search-input">
          <Search size={19} aria-hidden="true" />
          <input
            ref={searchInput}
            id={id + "-search"}
            type="search"
            maxLength={100}
            value={query}
            disabled={disabled}
            placeholder={tr(
              "예: 130, 116번 게이트, 안내데스크",
              "e.g. 130, Gate 116, information desk",
            )}
            aria-describedby={id + "-hint"}
            onChange={(e) => edit(e.target.value)}
          />
        </div>
        {photos && (
          <>
            <button
              type="button"
              className="btn place-photo-button"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <Camera size={20} aria-hidden="true" />
              {tr("사진으로 위치 찾기", "Find with a photo")}
            </button>
            <input
              ref={fileInput}
              className="sr-only"
              id={id + "-photo"}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
              capture="environment"
              tabIndex={-1}
              disabled={disabled}
              aria-label={tr(
                "주변 게이트·안내판 사진 선택",
                "Choose a nearby gate or sign photo",
              )}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void scan(file);
              }}
            />
          </>
        )}
      </div>
      {photos && (
        <details className="place-photo-info">
          <summary>{tr("사진 이용 안내", "About photo recognition")}</summary>
          <p className="place-finder-hint">
            {tr(
              "사진은 이 기기에서 글자만 읽고 서버에 보내거나 저장하지 않아요. 매장 상호만으로는 위치를 확정하지 않아요.",
              "The photo is read on this device and is not uploaded or stored. A shop name alone does not confirm a location.",
            )}
          </p>
        </details>
      )}
      {photo && (
        <figure className="place-photo-preview">
          {/* Local blob previews must not be sent through a server image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={tr("확인 중인 주변 안내판 사진", "Selected nearby sign photo")}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={clearPhoto}
            disabled={disabled}
          >
            <X size={16} aria-hidden="true" />
            {tr("사진 지우기", "Remove photo")}
          </button>
        </figure>
      )}
      {busy && (
        <div role="status" className="place-reading">
          <progress
            aria-label={tr("사진에서 글자를 읽는 중", "Reading text in photo")}
          />
          <p>
            {tr(
              "사진에서 글자를 읽고 있어요. 첫 사용에는 인식 도구를 내려받아 시간이 더 걸릴 수 있어요.",
              "Reading the photo. The first use may take longer while the reader downloads.",
            )}
          </p>
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            {tr("사진 읽기 취소", "Cancel reading")}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="place-search-notice">
          {error}
        </p>
      )}
      {show && !busy && (
        <>
          <fieldset className="place-area-filter">
            <legend>
              {tr("구역으로 좁히기 · 선택", "Narrow by area · optional")}
            </legend>
            {areas.map((a) => (
              <label key={a.id}>
                <input
                  type="radio"
                  name={id + "-area"}
                  value={a.id}
                  checked={area === a.id}
                  disabled={disabled}
                  onChange={() => setArea(a.id)}
                />
                {en ? a.en : a.ko}
              </label>
            ))}
          </fieldset>
          {photoText !== null && (
            <p role="status" className="place-search-notice">
              {matches.gates.length
                ? tr(
                    `사진에서 읽은 게이트 단서: ${matches.gates.join(", ")}번. 지금 서 있는 곳에 표시된 번호인지 확인해 주세요.`,
                    `Gate clues read: ${matches.gates.join(", ")}. Check that these numbers mark where you are standing.`,
                  )
                : photoText.trim()
                  ? tr(
                      "사진에서 글자를 읽었어요. 아래 후보가 실제 현재 위치와 맞는지 확인해 주세요.",
                      "Text read. Check whether a candidate below is your current location.",
                    )
                  : tr(
                      "사진에서 글자를 찾지 못했어요. 게이트 번호를 가까이 찍거나 직접 검색해 주세요.",
                      "No text found. Photograph the gate number more closely or search manually.",
                    )}
            </p>
          )}
          {matches.conflict && (
            <p className="place-search-notice">
              {tr(
                "읽은 번호와 층·구역이 맞지 않아요. 현재 계신 층과 구역을 확인하거나 다시 찾아 주세요.",
                "The number, floor or area do not match. Check your floor and area or try again.",
              )}
            </p>
          )}
          {matches.ambiguous && (
            <p className="place-search-notice">
              {matches.gates.length
                ? tr(
                    "안내판의 번호는 이동 방향이나 여러 게이트를 가리킬 수 있어요. 현재 서 있는 곳만 선택해 주세요.",
                    "A sign may point to several gates or a direction. Choose only where you are standing.",
                  )
                : tr(
                    "비슷한 이름의 장소가 여러 곳이에요. 구역과 주변 표시를 확인해 주세요.",
                    "There are several similarly named places. Check the area and nearby signs.",
                  )}
            </p>
          )}
          <div
            className="place-candidates"
            role="group"
            aria-label={tr("현재 위치 후보", "Possible current locations")}
          >
            {(hasText
              ? matches.candidates
              : quick.map((place) => ({ place }))
            ).map(({ place }) => (
              <div className="place-candidate" key={place.id}>
                <div>
                  <MapPin size={18} aria-hidden="true" />
                  <span>{en ? place.labelEn : place.label}</span>
                </div>
                <button
                  type="button"
                  data-confirm-place={place.id}
                  aria-label={`${photoText !== null ? tr("여기가 맞아요", "This is where I am") : tr("이곳에서 만날게요", "Meet me here")} · ${en ? place.labelEn : place.label}`}
                  className="btn btn-ghost"
                  disabled={disabled}
                  onClick={() => choose(place.id)}
                >
                  {photoText !== null
                    ? tr("여기가 맞아요", "This is where I am")
                    : tr("이곳에서 만날게요", "Meet me here")}
                </button>
              </div>
            ))}
          </div>
          {hasText && matches.candidates.length === 0 && (
            <p role="status" className="place-search-notice">
              {tr(
                "이 단서로 현재 위치를 찾지 못했어요. 매장 사진이라면 옆 게이트 번호나 안내판도 함께 찍어 주세요. 직접 위치를 선택하거나 안내데스크에 사진을 보여주실 수 있어요.",
                "Could not find a current location from this clue. For a shop, include the nearby gate or sign. You can select manually or show your photo at an information desk.",
              )}
            </p>
          )}
        </>
      )}
      {selected && (
        <div className="place-confirmed" role="status">
          <span>{tr("선택한 만날 곳", "Selected pickup point")}</span>
          <strong>{en ? selected.labelEn : selected.label}</strong>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => {
              clearPhoto();
              onChange("");
              setQuery("");
              setShow(true);
              searchInput.current?.focus();
            }}
          >
            {tr("다른 위치 찾기", "Find another location")}
          </button>
        </div>
      )}
      <details className="place-manual">
        <summary>{tr("목록에서 직접 고르기", "Choose from a list")}</summary>
        <label className="sr-only" htmlFor={id}>
          {tr("만날 곳 직접 선택", "Select pickup point")}
        </label>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">
            {tr("현재 위치를 골라 주세요", "Choose your current location")}
          </option>
          {areas
            .filter(
              (a): a is { id: Area; ko: string; en: string } => a.id !== "all",
            )
            .map((a) => (
              <optgroup key={a.id} label={en ? a.en : a.ko}>
                {PICKUP_PLACES.filter((p) => p.area === a.id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {en ? p.labelEn : p.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </details>
    </div>
  );
}
