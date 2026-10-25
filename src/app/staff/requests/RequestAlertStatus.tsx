"use client";
import { useState } from "react";
import type { RequestAlert } from "@/lib/request-alert-model";
export function RequestAlertStatus({
  id,
  alert,
  pushEnabled,
  zoneLabels,
  onChanged,
}: {
  id: string;
  alert?: RequestAlert;
  pushEnabled: boolean;
  zoneLabels: Record<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function acknowledge() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "확인을 기록하지 못했습니다");
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!alert) return <p className="fine">이전 접수: 알림 전달 이력 없음</p>;
  return (
    <div className="dx-notice">
      {alert.acknowledgedAt ? (
        <p>
          직원 최초 접수 확인:{" "}
          {zoneLabels[alert.acknowledgedZone ?? ""] ?? alert.acknowledgedZone} ·{" "}
          {new Date(alert.acknowledgedAt).toLocaleTimeString("ko-KR")}
        </p>
      ) : (
        <button
          className="btn"
          disabled={busy}
          onClick={() => void acknowledge()}
        >
          접수 확인 · 배정 아님
        </button>
      )}
      <p className="fine">
        접수 확인은 직원이 내용을 확인했다는 기록입니다. 담당 배정·출동과는
        별도입니다.
      </p>
      {!pushEnabled && (
        <p>백그라운드 푸시 설정이 없습니다. 화면에서 접수를 확인해 주세요.</p>
      )}
      {alert.targets === 0 ? (
        <p className="fine">접수 당시 등록된 알림 기기 없음</p>
      ) : (
        <p className="fine">
          푸시 서버 접수 {alert.accepted}건 · 브라우저 수신 확인{" "}
          {alert.received}건 · 대기/재시도 {alert.queued}건 · 발송 실패{" "}
          {alert.failed}건 · 종료 {alert.stopped}건
        </p>
      )}
      <p className="fine">
        푸시 서버 접수만으로 기기 수신을 보장하지 않습니다. 재시도는 직원 화면
        조회 또는 재시도 API 실행 시 처리됩니다.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
