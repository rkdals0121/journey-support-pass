"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, ResourceStatus>>({});
  const saving = useRef(false);
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
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
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
      setNotice(
        body.action === "create"
          ? "장비를 등록했습니다."
          : "장비 상태를 변경했습니다.",
      );
      if (typeof body.id === "string")
        setDrafts((current) => {
          const next = { ...current };
          delete next[body.id as string];
          return next;
        });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const group = (r: DispatchResource) =>
    r.requestId ? "assigned" : r.status === "ready" ? "ready" : "unavailable";
  const filters = [
    { id: "all", label: "전체" },
    { id: "ready", label: "가용" },
    { id: "assigned", label: "배차 중" },
    { id: "unavailable", label: "점검·중지" },
  ];
  const visible = rows.filter(
    (r) =>
      (statusFilter === "all" || group(r) === statusFilter) &&
      (kindFilter === "all" || r.kind === kindFilter) &&
      `${r.label} ${r.zone}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section className="resource-inventory" aria-label="장비 대장">
      {(error || actionError) && (
        <p role="alert" className="error">
          {actionError || error}
        </p>
      )}
      <p role="status" className="sr-only">
        {notice}
      </p>
      <div className="inventory-toolbar">
        <div className="inventory-filters" role="group" aria-label="장비 상태">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={statusFilter === f.id}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
              <span>
                {ready
                  ? rows.filter((r) => f.id === "all" || group(r) === f.id)
                      .length
                  : "—"}
              </span>
            </button>
          ))}
        </div>
        <div className="inventory-search">
          <label htmlFor="inventory-search">장비·구역 검색</label>
          <input
            id="inventory-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="장비 이름 또는 구역"
            maxLength={80}
          />
          <label htmlFor="inventory-kind">장비 종류</label>
          <select
            id="inventory-kind"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            <option value="all">모든 종류</option>
            {Object.entries(RESOURCE_KIND).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        </div>
      </div>
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
      {ready && rows.length > 0 && (
        <p className="inventory-result-count">
          {visible.length}대 표시 / 전체 {rows.length}대
        </p>
      )}
      {ready && rows.length > 0 && visible.length === 0 && (
        <div className="inventory-empty">
          <p>조건에 맞는 장비가 없습니다.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSearch("");
              setKindFilter("all");
              setStatusFilter("all");
            }}
          >
            검색 초기화
          </button>
        </div>
      )}
      <ul className="inventory-list">
        {visible.map((r) => (
          <li key={r.id} data-resource-id={r.id}>
            <div className="inventory-name">
              <h2>{r.label}</h2>
              <p>{RESOURCE_KIND[r.kind]}</p>
            </div>
            <p className="inventory-zone">
              {r.zone}
              {r.hubId && <small> · 거점 연동</small>}
              {r.availableAfter && (
                <small>
                  {" "}
                  ·{" "}
                  {new Date(r.availableAfter).toLocaleTimeString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  이후 가용
                </small>
              )}
            </p>
            <p className="inventory-state" data-state={group(r)}>
              <strong className="resource-current-state">
                {r.availableAfter
                  ? "복귀 중"
                  : r.requestId
                    ? "배차 중"
                    : RESOURCE_STATUS[r.status]}
              </strong>
            </p>
            <div className="inventory-actions">
              {r.requestId ? (
                <Link
                  href={`/staff/requests?search=${encodeURIComponent(r.requestId)}`}
                >
                  배차 요청 보기 →
                </Link>
              ) : (
                isDesk && (
                  <>
                    <label className="sr-only" htmlFor={`status-${r.id}`}>
                      {r.label} 상태 변경
                    </label>
                    <select
                      id={`status-${r.id}`}
                      value={drafts[r.id] ?? r.status}
                      disabled={busy}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [r.id]: e.target.value as ResourceStatus,
                        }))
                      }
                    >
                      {Object.entries(RESOURCE_STATUS).map(([status, text]) => (
                        <option key={status} value={status}>
                          {text}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`${r.label} 상태 적용`}
                      disabled={
                        busy || !drafts[r.id] || drafts[r.id] === r.status
                      }
                      onClick={() =>
                        void mutate({
                          action: "status",
                          id: r.id,
                          version: r.version,
                          status: drafts[r.id],
                        })
                      }
                    >
                      적용
                    </button>
                  </>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
