"use client";

import { BadgeCheck, CircleAlert, PlaneTakeoff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExitCheckDto } from "@/lib/api/staff";
import { textOf } from "@/lib/i18n";
import { isBoardingScan } from "@/lib/pass-format";
import { ErrorNote } from "../../components/Alert";
import { departureText } from "../../components/GuideParts";
import { Scanner } from "../../components/Scanner";

const ko = textOf("ko");
// 확인 한 번을 기다리는 가장 긴 시간(안내데스크의 패스 찾기와 같다).
const EXIT_TIMEOUT_MS = 15_000;

/**
 * 우대출구에서 여객의 탑승권을 찍는다. 결과는 두 가지다.
 *  - 우대 대상 확인됨: 증빙이 확인되었고 탑승권에 전자토큰이 있다. 패스트트랙으로 안내한다.
 *  - 확인 안 됨: 지금처럼 체크인 카운터에서 확인받도록 안내한다.
 * 증빙서류, 대상 유형, 이름은 이 화면에 오지 않는다.
 */
export function ExitCheck() {
  const [result, setResult] = useState<ExitCheckDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const check = useCallback(async (scanned: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), EXIT_TIMEOUT_MS);
    try {
      const res = await fetch("/api/staff/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanned }),
        signal: ctrl.signal,
      });
      if (res.status === 401) return window.location.replace("/staff/login");
      if (res.status === 409) return window.location.replace("/staff/zone");
      const body = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(body.error ?? "확인하지 못했습니다");
        return;
      }
      setResult(body.result);
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 찍어 주세요.");
    } finally {
      clearTimeout(limit);
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const onScan = useCallback(
    (text: string) => {
      if (!isBoardingScan(text)) return setError("탑승권의 QR·바코드를 다시 보여 주세요.");
      void check(text);
    },
    [check],
  );

  return (
    <>
      <Scanner
        onScan={onScan}
        paused={busy || result !== null}
        prefer="environment"
        text={{ starting: ko.camStarting, ready: ko.camReady, read: ko.camRead, none: "이 기기에서는 카메라를 쓸 수 없습니다.", switchCamera: ko.camSwitch }}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {result && (
        <div ref={resultRef} tabIndex={-1} role="status" className={result.eligible ? "exit-result ok" : "exit-result"}>
          <h2>
            {result.eligible ? <BadgeCheck size={28} aria-hidden="true" /> : <CircleAlert size={28} aria-hidden="true" />}
            {result.eligible ? "우대 대상 확인됨" : "우대 확인 안 됨"}
          </h2>
          <p>
            {result.eligible
              ? "패스트트랙으로 안내해 주세요. 증빙서류는 요구하지 않습니다."
              : !result.proofVerified
                ? "증빙이 확인되지 않은 여객입니다. 지금처럼 체크인 카운터 확인 방식으로 안내해 주세요."
                : "아직 체크인하지 않아 탑승권에 전자토큰이 없습니다. 체크인 카운터로 안내해 주세요."}
          </p>
          <p>
            <PlaneTakeoff size={16} aria-hidden="true" /> <b className="num">{result.flight.flightNo}</b> · {departureText(result.flight, ko)}
            {result.flight.gate !== null && ` · 탑승구 ${result.flight.gate}`}
          </p>
          {result.needs.length > 0 && (
            <ul aria-label="필요한 지원">
              {result.needs.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <button className="btn" onClick={() => setResult(null)}>
            <X size={20} aria-hidden="true" />
            다음 여객 찍기
          </button>
        </div>
      )}
    </>
  );
}
