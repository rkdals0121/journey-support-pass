"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import type { BookingHandoff } from "@/lib/booking-model";
import type { Lang } from "@/lib/i18n";
import { PublicShell } from "../../components/PublicShell";
import { WebRegister } from "../../register/WebRegister";

export function BookingLookup({ lang, enabled }: { lang: Lang; enabled: boolean }) {
  const en = lang === "en", suffix = en ? "?lang=en" : "";
  const [reference, setReference] = useState("");
  const [surname, setSurname] = useState("");
  const [result, setResult] = useState<BookingHandoff | null>(null);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (result) resultTitle.current?.focus(); }, [result]);
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const seq = ++request.current;
    setBusy(true); setError(""); setResult(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("/api/booking/lookup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airline: "demo", reference, surname }), signal: controller.signal });
      const data = await res.json();
      if (seq !== request.current) return;
      if (!res.ok) {
        const english = data.code === "cancelled" ? "This demo booking is cancelled. Select a flight manually." : "Demo booking unavailable. Check DEMO01 / KIM or select a flight manually.";
        setError(en ? english : data.error); return;
      }
      setReference(""); setSurname(""); setResult(data.handoff);
    } catch { if (seq === request.current) setError(en ? "Connection failed. Please try again." : "연결하지 못했습니다. 다시 조회해 주세요."); }
    finally { clearTimeout(timeout); if (seq === request.current) setBusy(false); }
  }
  if (register && result) return <WebRegister lang={lang} via="booking" booking={result} />;
  return <PublicShell lang={lang}>
    <main id="public-main" className="booking-lookup">
      <Link className="booking-back" href={"/prepare" + suffix}>{en ? "Before you travel" : "여행 전 사전등록"}</Link>
      <h1>{en ? "Find your booking" : "예약정보 불러오기"}</h1>
      <p className="booking-demo-note">{en ? "Demo only. Use the fictional booking DEMO01 / KIM. Real airline bookings cannot be retrieved." : "시연용입니다. 가상 예약 DEMO01 / KIM만 사용해 주세요. 실제 항공사 예약은 조회되지 않습니다."}</p>
      {!enabled ? <p role="status">{en ? "Demo lookup is disabled in live mode." : "실제 운영 모드에서는 시연 조회를 사용할 수 없습니다."}</p> : <>
        {!result ? <form onSubmit={lookup} aria-busy={busy}>
          <fieldset disabled={busy}>
            <label htmlFor="booking-airline">{en ? "Airline" : "항공사"}</label>
            <select id="booking-airline" defaultValue="demo"><option value="demo">{en ? "Demo Air (fictional)" : "시연 항공 (가상)"}</option></select>
            <div className="booking-fields">
              <div><label htmlFor="booking-reference">{en ? "Booking reference" : "예약번호"}</label><input id="booking-reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} required /></div>
              <div><label htmlFor="booking-surname">{en ? "Passenger surname" : "탑승객 영문 성"}</label><input id="booking-surname" value={surname} onChange={e => setSurname(e.target.value)} maxLength={30} autoComplete="off" autoCapitalize="characters" spellCheck={false} required /></div>
            </div>
            <div className="booking-actions"><button type="button" className="booking-sample" onClick={() => { setReference("DEMO01"); setSurname("KIM"); setError(""); }}>{en ? "Fill demo booking" : "시연값 넣기"}</button><button className="public-button" type="submit"><Search size={18} aria-hidden="true" />{busy ? (en ? "Searching…" : "조회 중…") : (en ? "Find booking" : "예약 조회")}</button></div>
          </fieldset>
        </form> : <section className="booking-result" aria-labelledby="booking-result-title">
          <h2 id="booking-result-title" ref={resultTitle} tabIndex={-1}>{en ? "Demo flight found" : "시연 항공편을 찾았어요"}</h2>
          <p className="booking-itinerary">ICN <ArrowRight aria-hidden="true" size={22} /> NRT <span>{en ? "Tokyo" : "도쿄"}</span></p>
          <dl><dt>{en ? "Flight" : "항공편"}</dt><dd>DX9001 · {en ? "Demo Air" : "시연 항공"}</dd><dt>{en ? "Departure (Korea time)" : "출발 (한국 시간)"}</dt><dd>{result.flight.flightDate} 18:00</dd></dl>
          <p className="booking-footnote">{en ? "Lookup is valid for 30 minutes. Registering support needs does not book a service." : "조회 결과는 30분 동안 유효합니다. 지원등록은 서비스 예약 확정이 아닙니다."}</p>
          <div className="booking-actions"><button className="booking-sample" onClick={() => { setResult(null); setError(""); }}>{en ? "Search again" : "다시 조회"}</button><button className="public-button" onClick={() => {
            if (Date.now() >= Date.parse(result.expiresAt)) { setResult(null); setError(en ? "Lookup expired. Please search again." : "조회 결과가 만료되었습니다. 다시 조회해 주세요."); return; }
            setRegister(true);
          }}>{en ? "Register with this flight" : "이 항공편으로 지원등록"}<ArrowRight size={18} aria-hidden="true" /></button></div>
        </section>}
        {error && <p role="alert" className="booking-error">{error}</p>}
      </>}
      <Link className="booking-manual" href={"/register?via=booking" + (en ? "&lang=en" : "")}>{en ? "Select a flight manually" : "항공편 직접 선택해서 등록"}<ArrowRight size={17} aria-hidden="true" /></Link>
    </main>
  </PublicShell>;
}
