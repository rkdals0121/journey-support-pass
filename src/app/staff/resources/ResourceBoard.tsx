"use client";
import { useCallback, useEffect, useState } from "react";
import {
  RESOURCE_KIND,
  RESOURCE_STATUS,
  type DispatchResource,
  type ResourceKind,
  type ResourceStatus,
} from "@/lib/resource-model";
export function ResourceBoard({ isDesk }: { isDesk: boolean }) {
  const [rows, setRows] = useState<DispatchResource[]>([]);
  const [zones, setZones] = useState<{ id: string; label: string }[]>([]);
  const [label, setLabel] = useState(""),
    [kind, setKind] = useState<ResourceKind>("robot"),
    [zoneId, setZone] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/staff/resources", {
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
      const b = await res.json();
      if (!res.ok)
        throw new Error(b.error ?? "장비 현황을 불러오지 못했습니다");
      setRows(b.resources);
      setZones(b.zones);
      setReady(true);
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
  async function mutate(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/staff/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "변경하지 못했습니다");
      if (body.action === "create") setLabel("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {error && <p role="alert">{error}</p>}
      <p>
        가용 {rows.filter((r) => r.status === "ready" && !r.requestId).length}대
        · 배차 중 {rows.filter((r) => r.requestId).length}대 · 점검/중지{" "}
        {rows.filter((r) => r.status !== "ready").length}대
      </p>
      {isDesk && (
        <details className="resource-register">
          <summary>장비 등록</summary>
          <form
            className="dx-card"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({ action: "create", label, kind, zoneId });
            }}
          >
            <h2>시범 장비 등록</h2>
            <label htmlFor="resource-label">장비 이름</label>
            <input
              id="resource-label"
              type="text"
              required
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 모의 로봇 01"
            />
            <label htmlFor="resource-kind">장비 종류</label>
            <select
              id="resource-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ResourceKind)}
            >
              {Object.entries(RESOURCE_KIND).map(([value, text]) => (
                <option value={value} key={value}>
                  {text}
                </option>
              ))}
            </select>
            <label htmlFor="resource-zone">기준 구역</label>
            <select
              id="resource-zone"
              required
              value={zoneId}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">구역을 선택하세요</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              장비 등록
            </button>
          </form>
        </details>
      )}
      {!ready ? (
        <p role="status">장비 현황 확인 중</p>
      ) : (
        rows.length === 0 && (
          <p>
            등록된 장비가 없습니다. 안내데스크에서 시범 장비를 등록한 뒤 요청에
            배차할 수 있습니다.
          </p>
        )
      )}
      <ul className="dx-request-list">
        {rows.map((r) => (
          <li key={r.id} className="dx-card" data-resource-id={r.id}>
            <h2>{r.label}</h2>
            <p>
              {RESOURCE_KIND[r.kind]} · {r.zone}
            </p>
            <p>
              <strong>
                {r.requestId ? "배차 중" : RESOURCE_STATUS[r.status]}
              </strong>
            </p>
            {r.requestId && (
              <p>
                요청이 완료·취소·종료되면 가용 수량으로 돌아옵니다. 출발 전에는
                통합 요청에서 배차를 해제할 수 있습니다.
              </p>
            )}
            {isDesk && (
              <div className="dx-actions">
                {Object.entries(RESOURCE_STATUS).map(([status, text]) => (
                  <button
                    className="btn"
                    key={status}
                    disabled={busy || !!r.requestId || r.status === status}
                    onClick={() =>
                      void mutate({
                        action: "status",
                        id: r.id,
                        version: r.version,
                        status: status as ResourceStatus,
                      })
                    }
                  >
                    {text}으로 변경
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
