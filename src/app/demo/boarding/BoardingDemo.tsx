"use client";

import { Info, PlaneTakeoff, RefreshCw, Search, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { boardingPassText, TOKEN_ALPHABET } from "@/lib/pass-format";

interface Flight {
  flightDate: string;
  flightNo: string;
  destName: string;
  day: "today" | "tomorrow";
  time: string;
  cancelled: boolean;
}

// 탑승권 번호 열 자리. 헷갈리는 글자(I, L, O, U)는 쓰지 않는다(패스 값과 같은 글자들).
function newRef(): string {
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return [...a].map((n) => TOKEN_ALPHABET[n % TOKEN_ALPHABET.length]).join("");
}

/** 시연용 모의 탑승권. 편을 골라 QR 을 만든다. 이름은 넣지 않는다. */
export function BoardingDemo() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Flight[]>([]);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [ref, setRef] = useState("");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (q.trim().length < 2) return setList([]);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/flights/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((b) => setList((b.flights as Flight[]).filter((f) => !f.cancelled)))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!flight || !ref) return setSvg("");
    void import("qrcode").then((QR) =>
      QR.toString(boardingPassText({ flightDate: flight.flightDate, flightNo: flight.flightNo, ref }), { type: "svg", errorCorrectionLevel: "M", margin: 4 }).then(setSvg),
    );
  }, [flight, ref]);

  return (
    <div className="dm-home">
      <section className="ph-hero" aria-labelledby="bp-title">
        <div className="ph-hero-copy">
          <span className="ph-hero-label" role="note">
            <Info aria-hidden="true" />
            시연용 · 실제 항공사의 탑승권이 아니에요
          </span>
          <h1 id="bp-title">모의 탑승권 만들기</h1>
          <p>편을 고르면 안내로봇에 찍을 탑승권 QR이 생겨요.</p>
        </div>
      </section>
      <div className="dm-cards">
        <section className="dm-card dm-search" aria-label="편 고르기">
          <Search aria-hidden="true" className="dm-card-icon" strokeWidth={1.7} />
          <div>
            <label htmlFor="bp-flight">편명 또는 도착 도시</label>
            <input id="bp-flight" value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: KE, 도쿄" autoComplete="off" />
          </div>
          {!flight && list.length > 0 && (
            <div className="choices">
              {list.slice(0, 8).map((f) => (
                <button
                  key={`${f.flightDate}-${f.flightNo}`}
                  className="flight-opt"
                  onClick={() => {
                    setFlight(f);
                    setRef(newRef());
                  }}
                >
                  <b className="num">{f.flightNo}</b> {f.destName} · {f.day === "today" ? "오늘" : "내일"} {f.time}
                </button>
              ))}
            </div>
          )}
          {flight && (
            <div className="dm-card-actions">
              <button className="btn" onClick={() => setRef(newRef())}>
                <RefreshCw aria-hidden="true" />새 탑승권 번호로
              </button>
              <button className="btn btn-ghost" onClick={() => setFlight(null)}>
                다른 편 고르기
              </button>
            </div>
          )}
        </section>
        <section className="dm-card dm-pass" aria-label="모의 탑승권">
          {flight ? (
            <div className="boarding">
              <div className="boarding-top">
                <span className="boarding-flight">
                  <PlaneTakeoff size={18} aria-hidden="true" />
                  {flight.flightNo}
                </span>
                <b>ICN → {flight.destName}</b>
                <span className="num">
                  출발 {flight.day === "today" ? "오늘" : "내일"} {flight.time}
                </span>
              </div>
              <div className="boarding-badge">BOARDING PASS · 시연용</div>
              <div className="ticket">
                <div className="pass-qr">
                  <div className="pass-qr-code" role="img" aria-label="탑승권 QR" dangerouslySetInnerHTML={{ __html: svg }} />
                  <span className="pass-qr-label">탑승권 번호</span>
                  <span className="pass-qr-no num">{ref}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="dm-pass-empty">
              <Ticket aria-hidden="true" />
              편을 고르면 여기에 탑승권이 나와요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
