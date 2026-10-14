"use client";

import { ChevronLeft, ClipboardPen, Navigation, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorNote } from "../components/Alert";
import { Brand } from "../components/Sunflower";

interface PlaceOption {
  id: string;
  label: string;
  landside: boolean;
}

const AUTOPRINT_KEY = "jsp:kiosk:autoprint";

export function KioskSetup({ places, currentPlace }: { places: PlaceOption[]; currentPlace: PlaceOption | null }) {
  const [code, setCode] = useState("");
  const [use, setUse] = useState<"register" | "guide">("guide");
  const [placeId, setPlaceId] = useState("");
  const [autoPrint, setAutoPrint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(AUTOPRINT_KEY) === "1");
    } catch {
      // 저장소를 못 쓰면 꺼진 채로 둔다.
    }
  }, []);

  // 쓰임새에 맞는 자리만 보여준다. 등록 키오스크는 보안검색 전에, 안내 키오스크는 그 뒤에 놓인다.
  const shown = places.filter((p) => (use === "register" ? p.landside : !p.landside));
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
      try {
        localStorage.setItem(AUTOPRINT_KEY, autoPrint ? "1" : "0");
      } catch {
        // 기억하지 못하면 등록을 마친 화면의 버튼으로 뽑는다.
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
      <h1>키오스크 설치</h1>
      <p className="muted">이 기기를 공항 키오스크로 씁니다. 설치는 직원이 한 번만 하면 됩니다.</p>

      {currentPlace && (
        <div className="setup-now">
          <span>
            지금 설치된 자리: <b>{currentPlace.label}</b>
          </span>
          <Link className="btn btn-inline" href={currentPlace.landside ? "/kiosk/register" : "/kiosk/guide"}>
            {currentPlace.landside ? "등록 화면 열기" : "안내 화면 열기"}
          </Link>
        </div>
      )}

      <fieldset className="setup-use">
        <legend>쓰임새</legend>
        <label className={use === "guide" ? "on" : ""}>
          <input type="radio" name="use" checked={use === "guide"} onChange={() => setUse("guide")} />
          <Navigation size={22} aria-hidden="true" />
          <span>
            <b>안내 키오스크</b>
            <small>여객이 QR을 대면 맞춤 안내를 보여줍니다</small>
          </span>
        </label>
        <label className={use === "register" ? "on" : ""}>
          <input type="radio" name="use" checked={use === "register"} onChange={() => setUse("register")} />
          <ClipboardPen size={22} aria-hidden="true" />
          <span>
            <b>등록 키오스크</b>
            <small>여객이 등록하고 QR 스티커를 받습니다</small>
          </span>
        </label>
      </fieldset>

      <label htmlFor="place">놓을 자리</label>
      <select id="place" value={placeId} onChange={(e) => setPlaceId(e.target.value)} required>
        <option value="">자리를 골라 주세요</option>
        {shown.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <p className="hint">자리 목록과 그 자리에서의 길 안내는 시연용 모의 자료입니다.</p>

      {use === "register" && (
        <label className="check">
          <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
          <span>스티커 프린터가 연결되어 있습니다 (등록을 마치면 바로 인쇄)</span>
        </label>
      )}

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
      <button className="btn btn-primary" disabled={busy || !code.trim() || !placeId}>
        {busy ? "확인하는 중…" : "이 기기를 키오스크로 쓰기"}
      </button>
      <Link className="home-staff" href="/check">
        <Stethoscope size={16} aria-hidden="true" />
        이 기기 점검하기 (카메라·소리·인터넷)
      </Link>
      <Link className="home-staff" href="/">
        <ChevronLeft size={16} aria-hidden="true" />
        여객 첫 화면으로
      </Link>
    </form>
  );
}
