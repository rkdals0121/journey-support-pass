"use client";
import { useState } from "react";
import type { DemoFlight } from "@/lib/demo-flight";
export function PrepareDemo({ initial }: { initial: DemoFlight | null }) {
  const [flight, setFlight] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/demo-flight", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        window.location.assign("/staff/login");
        return;
      }
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error ?? "시연 항공편을 준비하지 못했습니다");
      setFlight(body.flight);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인해 주세요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="dx-card demo-preparation">
      <h2>1. 시연 항공편 준비</h2>
      <p>
        사용 가능한 시연 항공편이 있으면 이어서 사용하고, 없으면 약 3시간 뒤
        출발하는 도쿄행 시연편 한 편을 추가합니다.
      </p>
      <button
        className="btn btn-primary"
        onClick={() => void prepare()}
        disabled={busy}
      >
        {busy ? "준비하는 중…" : "시연 항공편 준비"}
      </button>
      {error && <p role="alert">{error}</p>}
      {flight && (
        <div className="demo-flight-summary" role="status">
          <h3>등록 화면에서 직접 선택할 항공편</h3>
          <dl>
            <div>
              <dt>편명</dt>
              <dd data-demo-flight>{flight.flightNo}</dd>
            </div>
            <div>
              <dt>출발일</dt>
              <dd>{flight.flightDate}</dd>
            </div>
            <div>
              <dt>출발 시각</dt>
              <dd>
                {new Date(flight.departure).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </dd>
            </div>
            <div>
              <dt>탑승구·시연 목적지</dt>
              <dd>탑승동 {flight.gate}번 탑승구 앞</dd>
            </div>
          </dl>
          <p className="fine">
            실제 운항·항공사 예약이 아닙니다. 이 편명과 날짜를 여객용 등록
            화면에 직접 입력합니다. 항공사 예약 정보가 자동 전송되는 시연이
            아닙니다.
          </p>
        </div>
      )}
    </section>
  );
}
