"use client";
import { useCallback, useEffect, useState } from "react";
interface Overview {
  enabled: boolean;
  total: number;
  acknowledged: number;
  unconfirmed: number;
  queued: number;
  accepted: number;
  received: number;
  failed: number;
  stopped: number;
  devices: number;
  date: string;
}
export function AlertOverview() {
  const [value, setValue] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/staff/alerts", {
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "알림 현황을 불러오지 못했습니다");
      setValue(b);
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        await load(controller.signal);
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [load]);
  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/staff/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
        signal: AbortSignal.timeout(25000),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "재시도를 실행하지 못했습니다");
      setMessage(
        b.enabled
          ? `이번 실행에서 ${b.attempted}건 발송을 시도했습니다.`
          : "푸시 운영 설정이 없어 외부 발송을 하지 않았습니다.",
      );
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="staff-alerts">
      {error && <p role="alert">{error}</p>}
      {value ? (
        <>
          <p>
            <strong>
              {value.enabled ? "푸시 발송 설정 있음" : "푸시 발송 설정 필요"}
            </strong>{" "}
            · 현재 등록 기기 {value.devices}대
          </p>
          <dl className="dx-summary">
            {(
              [
                ["새 접수 알림", value.total],
                ["직원 최초 확인", value.acknowledged],
                ["미확인·미배정 접수", value.unconfirmed],
                ["발송 대기·재시도", value.queued],
                ["푸시 서버 접수", value.accepted],
                ["브라우저 수신 확인", value.received],
                ["발송 실패", value.failed],
                ["중단·기간 종료", value.stopped],
              ] as [string, number][]
            ).map(([label, n]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{n}건</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p role="status">알림 현황 확인 중</p>
      )}
      <div className="staff-alerts-notes">
        <div className="staff-alerts-notes-head">
          <h2>발송·재시도 기준</h2>
          {value && (
            <button className="btn alert-retry" disabled={busy} onClick={() => void retry()}>
              재시도 대기 처리
            </button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      <p>
        기기별 발송 기록은 24시간 보관합니다. 처리 대기열의 이중 실행을 막지만
        외부 푸시의 네트워크 응답이 유실되면 같은 알림이 재전송될 수 있습니다.
      </p>
      </div>
    </section>
  );
}
