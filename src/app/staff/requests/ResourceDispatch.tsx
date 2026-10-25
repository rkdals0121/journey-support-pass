"use client";
import { useState } from "react";
import type { DispatchResource } from "@/lib/resource-model";
import type { ServiceRequestView } from "@/lib/service-request-model";
export function ResourceDispatch({
  request: r,
  resources,
  canEdit,
  onChanged,
}: {
  request: ServiceRequestView;
  resources: DispatchResource[];
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = resources.find((gear) => gear.requestId === r.id);
  const available = resources.filter(
    (gear) =>
      gear.kind === r.service && gear.status === "ready" && !gear.requestId,
  );
  async function allocate(resourceId: string | null) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/staff/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "allocate",
          requestId: r.id,
          version: r.version,
          resourceId,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "배차하지 못했습니다");
      setSelected("");
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dx-ending">
      <p>
        <strong>배차 장비: {current ? current.label : "미배차"}</strong>
      </p>
      {!current && (
        <p className="fine">
          장비를 배차하지 않은 이동 단계는 장비 가용 수량을 반영하지 않는 모의
          시연입니다.
        </p>
      )}
      {r.state === "assigned" && canEdit && (
        <>
          <label htmlFor={`resource-${r.id}`}>
            가용 장비 선택 · {available.length}대
          </label>
          <select
            id={`resource-${r.id}`}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">장비를 선택하세요</option>
            {available.map((gear) => (
              <option key={gear.id} value={gear.id}>
                {gear.label} · {gear.zone}
              </option>
            ))}
          </select>
          <button
            className="btn"
            disabled={busy || !selected}
            onClick={() => void allocate(selected)}
          >
            선택 장비 배차
          </button>
          {current && (
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void allocate(null)}
            >
              출발 전 배차 해제
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
