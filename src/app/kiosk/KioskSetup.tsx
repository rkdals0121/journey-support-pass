"use client";

import {
  Bot,
  ChevronLeft,
  ClipboardPen,
  Navigation,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorNote } from "../components/Alert";
import { Brand } from "../components/Sunflower";

interface PlaceOption {
  id: string;
  label: string;
  landside: boolean;
}



export function KioskSetup({
  places,
  currentPlace,
}: {
  places: PlaceOption[];
  currentPlace: PlaceOption | null;
}) {
  const [code, setCode] = useState("");
  const [use, setUse] = useState<"register" | "guide" | "entry">("entry");
  const [placeId, setPlaceId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 예비로 둔 등록 키오스크를 고를 수 있게 할지(주소에 ?reserve=1).
  const [reserve, setReserve] = useState(false);

  useEffect(() => {
    setReserve(
      new URLSearchParams(window.location.search).get("reserve") === "1",
    );
    const purpose = new URLSearchParams(window.location.search).get("use");
    if (purpose === "entry" || purpose === "guide") setUse(purpose);
  }, []);

  // 쓰임새에 맞는 자리만 보여준다. 입구 키오스크와 등록 키오스크는 보안검색 전에, 안내 키오스크는 그 뒤에 놓인다.
  const shown = places.filter((p) =>
    use === "guide" ? !p.landside : p.landside,
  );
  useEffect(() => {
    if (!shown.some((p) => p.id === placeId)) setPlaceId("");
  }, [use]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, placeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "설치하지 못했습니다");
        setCode("");
        return;
      }
      // 쿠키가 바뀌었으므로 화면을 통째로 다시 받는다.
      window.location.replace(`/kiosk/${use}`);
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Brand />
      <h1>현장 기기 설치</h1>
      <p className="muted">직원용 설치 코드로 기기를 연결하세요.</p>

      {currentPlace && (
        <div className="setup-now">
          <span>
            지금 설치된 자리: <b>{currentPlace.label}</b>
          </span>
          <Link
            className="btn btn-inline"
            href={currentPlace.landside ? "/kiosk/entry" : "/kiosk/guide"}
          >
            {currentPlace.landside ? "입구 안내로봇 열기" : "안내 화면 열기"}
          </Link>
        </div>
      )}

      <fieldset className="setup-use">
        <legend>쓰임새</legend>
        <label className={use === "entry" ? "on" : ""}>
          <input
            type="radio"
            name="use"
            checked={use === "entry"}
            onChange={() => setUse("entry")}
          />
          <Bot size={22} aria-hidden="true" />
          <span>
            <b>공항 입구 안내로봇</b>
            <small>탑승권 확인 · 필요한 도움 · 서비스 연결</small>
          </span>
        </label>
        <label className={use === "guide" ? "on" : ""}>
          <input
            type="radio"
            name="use"
            checked={use === "guide"}
            onChange={() => setUse("guide")}
          />
          <Navigation size={22} aria-hidden="true" />
          <span>
            <b>안내 키오스크 (출국심사 뒤)</b>
            <small>탑승구·편의시설 맞춤 안내</small>
          </span>
        </label>
        {/* 등록 키오스크(스티커 인쇄)는 주 흐름에서 뺐다. 등록은 예매 완료 화면의 링크로 하고, 현장은 안내데스크가 대신 등록한다.
            예비로 두려면 ?reserve=1 로 연다(시연·비교용). */}
        {reserve && (
          <label className={use === "register" ? "on" : ""}>
            <input
              type="radio"
              name="use"
              checked={use === "register"}
              onChange={() => setUse("register")}
            />
            <ClipboardPen size={22} aria-hidden="true" />
            <span>
              <b>탑승권 기반 현장 등록 (예비)</b>
              <small>기존 탑승권으로 현장에서 지원정보를 연결합니다</small>
            </span>
          </label>
        )}
      </fieldset>

      <label htmlFor="place">놓을 자리</label>
      <select
        id="place"
        value={placeId}
        onChange={(e) => setPlaceId(e.target.value)}
        required
      >
        <option value="">자리를 골라 주세요</option>
        {shown.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <p className="hint">
        자리 목록과 그 자리에서의 길 안내는 시연용 모의 자료입니다.
      </p>

      <label htmlFor="code">설치 코드</label>
      <input
        id="code"
        className="input-code"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <button
        className="btn btn-primary"
        disabled={busy || !code.trim() || !placeId}
      >
        {busy ? "확인하는 중…" : "이 기기를 키오스크로 쓰기"}
      </button>
      {currentPlace && (
        <Link className="btn btn-ghost" href="/help">
          이 위치에서 통합 도움 접수 열기
        </Link>
      )}
      <Link className="home-staff" href="/check">
        <Stethoscope size={16} aria-hidden="true" />이 기기 점검하기
        (카메라·소리·인터넷)
      </Link>
      <Link className="home-staff" href="/">
        <ChevronLeft size={16} aria-hidden="true" />
        여객 첫 화면으로
      </Link>
    </form>
  );
}
