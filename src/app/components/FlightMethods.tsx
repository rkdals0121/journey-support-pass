"use client";
import { useRef, useState } from "react";
import { Search, Ticket } from "lucide-react";
import type { BookingHandoff } from "@/lib/booking-model";
import type { Lang } from "@/lib/i18n";
import type { FlightOption } from "./RegisterFlow";
import { ErrorNote } from "./Alert";
import { AlnumPad } from "./Inputs";
import { Scanner } from "./Scanner";

/**
 * 항공편을 찾는 방법.
 * 사전등록(휴대전화)은 예약번호로 찾고, 예약번호가 없으면 편명으로 찾는다.
 * 현장등록(키오스크·안내데스크)은 편명, 예약번호, 탑승권 바코드·QR 셋 다 쓴다.
 */
export type FlightMethod = "booking" | "flight" | "pass";

export function methodsOf(mode: "web" | "kiosk" | "assisted" | "edit"): FlightMethod[] {
  return mode === "web" ? ["booking", "flight"] : ["flight", "booking", "pass"];
}

const LABEL: Record<FlightMethod, { ko: string; en: string }> = {
  booking: { ko: "예약번호로 찾기", en: "Booking reference" },
  flight: { ko: "편명·도시로 찾기", en: "Flight number or city" },
  pass: { ko: "탑승권 바코드·QR", en: "Boarding pass code" },
};

export function FlightMethodTabs({ methods, value, lang, onChange }: { methods: FlightMethod[]; value: FlightMethod; lang: Lang; onChange: (m: FlightMethod) => void }) {
  return (
    <div className="flight-methods" role="group" aria-label={lang === "en" ? "How to find your flight" : "항공편 찾는 방법"}>
      {methods.map((m) => (
        <button key={m} type="button" className={`pick ${value === m ? "on" : ""}`} aria-pressed={value === m} onClick={() => onChange(m)}>
          {LABEL[m][lang === "en" ? "en" : "ko"]}
        </button>
      ))}
    </div>
  );
}

/**
 * 예약번호 + 영문 성으로 찾기. 지금은 항공사와 연결되어 있지 않아 시연 예약(DEMO01 / KIM)만 찾는다.
 * 입력 칸(form)과 화면 글자판(pad)을 따로 돌려준다. 키오스크에서는 글자판이 입력 칸 옆 칸에 놓인다(편명 찾기와 같은 자리).
 */
export function useBookingFind({ lang, onScreenPad, onFound }: { lang: Lang; onScreenPad: boolean; onFound: (b: BookingHandoff) => void }) {
  const en = lang === "en";
  const [reference, setReference] = useState("");
  const [surname, setSurname] = useState("");
  const [field, setField] = useState<"reference" | "surname">("reference");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  // 화면 글자판을 빠르게 연달아 눌러도 글자가 빠지지 않게 직전 값에서 바꾼다.
  const update = (f: typeof field, next: (prev: string) => string) => {
    const clean = (v: string) => v.toUpperCase().replace(f === "reference" ? /[^A-Z0-9]/g : /[^A-Z]/g, "").slice(0, f === "reference" ? 12 : 30);
    (f === "reference" ? setReference : setSurname)((prev) => clean(next(prev)));
    setError("");
  };
  const set = (f: typeof field, v: string) => update(f, () => v);
  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!reference || !surname) return setError(en ? "Enter the booking reference and surname." : "예약번호와 영문 성을 넣어 주세요.");
    const n = ++seq.current;
    setBusy(true);
    setError("");
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch("/api/booking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airline: "demo", reference, surname }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (n !== seq.current) return;
      if (!res.ok) {
        const english =
          data.code === "cancelled"
            ? "This booking is cancelled. Find your flight by flight number."
            : data.code === "demo_disabled"
              ? "Booking lookup opens once airlines are connected. Find your flight by flight number."
              : "Booking not found. Check the reference and surname.";
        return setError(en ? english : data.code === "demo_disabled" ? "예약번호 조회는 항공사와 연결된 뒤에 열립니다. 편명으로 찾아 주세요." : data.error);
      }
      onFound(data.handoff);
    } catch {
      if (n === seq.current) setError(en ? "Connection failed. Please try again." : "연결하지 못했습니다. 다시 조회해 주세요.");
    } finally {
      clearTimeout(limit);
      if (n === seq.current) setBusy(false);
    }
  }
  const form = (
    <form className="booking-find" onSubmit={lookup} aria-busy={busy}>
      <div className="booking-find-fields">
        <div>
          <label htmlFor="reg-booking-ref">{en ? "Booking reference" : "예약번호"}</label>
          <input
            id="reg-booking-ref"
            type="text"
            className={onScreenPad && field === "reference" ? "on" : ""}
            value={reference}
            placeholder={en ? "e.g. DEMO01" : "예: DEMO01"}
            inputMode={onScreenPad ? "none" : "text"}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setField("reference")}
            onClick={() => setField("reference")}
            onChange={(e) => set("reference", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="reg-booking-surname">{en ? "Surname (in English)" : "탑승객 영문 성"}</label>
          <input
            id="reg-booking-surname"
            type="text"
            className={onScreenPad && field === "surname" ? "on" : ""}
            value={surname}
            placeholder={en ? "e.g. KIM" : "예: KIM"}
            inputMode={onScreenPad ? "none" : "text"}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setField("surname")}
            onClick={() => setField("surname")}
            onChange={(e) => set("surname", e.target.value)}
          />
        </div>
      </div>
      <p className="fine booking-find-note">
        {en ? "Demo booking: DEMO01 / KIM" : "시연 예약: DEMO01 / KIM"}
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="booking-find-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setReference("DEMO01"); setSurname("KIM"); setError(""); }}>
          {en ? "Fill demo booking" : "시연값 넣기"}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Search size={20} aria-hidden="true" />
          {busy ? (en ? "Searching…" : "조회 중…") : en ? "Find booking" : "예약 조회"}
        </button>
      </div>
    </form>
  );
  const pad = onScreenPad ? (
    <AlnumPad
      onKey={(k) => update(field, (prev) => prev + k)}
      onErase={() => update(field, (prev) => prev.slice(0, -1))}
      eraseLabel={en ? "Erase" : "지우기"}
    />
  ) : null;
  return { form, pad };
}

/** 탑승권 바코드·QR 로 찾기. 카메라에 비추거나 탑승권 사진을 고른다. 탑승권에서는 날짜와 편명만 쓴다. */
export function PassFind({ lang, kiosk, onFound }: { lang: Lang; kiosk: boolean; onFound: (f: FlightOption) => void }) {
  const en = lang === "en";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function read(scanned: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch("/api/flights/boarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanned }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        const english = data.code === "flight" ? "We could not find this flight in today's or tomorrow's departures." : "We could not read this boarding pass.";
        return setError(en ? english : data.error);
      }
      onFound(data.flight);
    } catch {
      setError(en ? "Connection failed. Please try again." : "연결하지 못했습니다. 다시 비춰 주세요.");
    } finally {
      clearTimeout(limit);
      setBusy(false);
    }
  }
  return (
    <div className="pass-find">
      <p className="pass-find-lead">
        <Ticket size={22} aria-hidden="true" />
        {en ? "Show the barcode or QR code on your boarding pass." : "탑승권의 바코드나 QR 코드를 비춰 주세요."}
      </p>
      <Scanner
        paused={busy}
        prefer={kiosk ? "user" : "environment"}
        onScan={(v) => void read(v)}
        text={{
          starting: en ? "Starting camera…" : "카메라를 켜는 중…",
          ready: en ? "Show the boarding pass code" : "탑승권 코드를 보여 주세요",
          read: en ? "Finding your flight…" : "항공편을 찾는 중…",
          none: en ? "If the camera is not available, choose a boarding pass image." : "카메라를 쓸 수 없으면 탑승권 이미지를 골라 주세요.",
          switchCamera: en ? "Switch camera" : "카메라 전환",
        }}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
