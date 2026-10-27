"use client";
import Link from "next/link";
import { taskOf, serviceDetailsLines } from "@/lib/service-tasks";
import { PushSettings } from "./PushSettings";
import { ResourceDispatch } from "./ResourceDispatch";
import { ResourceAvailability } from "@/app/components/ResourceAvailability";
import { RequestAlertStatus } from "./RequestAlertStatus";
import { OperatorClose } from "./OperatorClose";
import { BusinessHandling } from "./BusinessHandling";
import { RequestCards } from "./RequestCards";
import { RequestResolutionView } from "@/app/components/RequestResolutionView";
import type { RequestAlert } from "@/lib/request-alert-model";
import type { DispatchResource } from "@/lib/resource-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { labelOf } from "@/lib/catalog";
import { supportTopic, SERVICE_CATALOG } from "@/lib/service-catalog";
import { businessOf, BUSINESS_AREAS } from "@/lib/operating-profile";
import {
  UNCLASSIFIED_BUSINESS,
  businessFilterLabel,
} from "@/lib/business-overview-model";
import { placeOf } from "@/lib/airport";
import {
  nextRequestAction,
  requestServiceLabel,
  requestStateLabel,
  OPEN_REQUEST_STATES,
  SERVICE_LABEL,
  type ServiceRequestView,
  type RequestAction,
  type OperationalSummary,
  type RequestHistoryItem,
} from "@/lib/service-request-model";
export function RequestList({
  zoneId,
  isDesk,
  initialBusiness = "all",
  initialScope = "active",
}: {
  zoneId: string;
  isDesk: boolean;
  initialBusiness?: string;
  initialScope?: string;
}) {
  const [summary, setSummary] = useState<OperationalSummary | null>(null);
  const [resources, setResources] = useState<DispatchResource[]>([]);
  const [alerts, setAlerts] = useState<Record<string, RequestAlert>>({});
  const [pushEnabled, setPushEnabled] = useState(false);
  const [historicalConflicts, setHistoricalConflicts] = useState<
    Record<string, number>
  >({});
  const [zoneLabels, setZoneLabels] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [dispatchZones, setDispatchZones] = useState<
    { id: string; label: string }[]
  >([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, RequestHistoryItem[]>>(
    {},
  );
  async function loadHistory(id: string) {
    try {
      const res = await fetch(
        `/api/staff/requests/${encodeURIComponent(id)}/history`,
        { cache: "no-store", signal: AbortSignal.timeout(10000) },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "이력을 불러오지 못했습니다");
      setHistory((current) => ({ ...current, [id]: data.history }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const [rows, setRows] = useState<ServiceRequestView[]>([]);
  const [selection, setSelection] = useState<{
    id: string;
    query: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [sound, setSound] = useState(false);
  const [filter, setFilter] = useState(initialScope);
  const [draft, setDraft] = useState(""),
    [search, setSearch] = useState("");
  const [service, setService] = useState("all"),
    [source, setSource] = useState("all"),
    [queue, setQueue] = useState("all"),
    [zone, setZone] = useState("all");
  const [topic, setTopic] = useState("all");
  const [business, setBusiness] = useState(initialBusiness);
  const [order, setOrder] = useState("priority"),
    [pageSize, setPageSize] = useState(50);
  const knownQuery = useRef("");
  const inFlightLoad = useRef<{
    controller: AbortController;
    url: string;
  } | null>(null);
  const known = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const requestUrl =
    "/api/staff/requests?" +
    new URLSearchParams({
      offset: String(offset),
      history: showHistory ? "1" : "0",
      scope: filter,
      search,
      service,
      topic,
      business,
      source,
      queue,
      zone,
      order,
      limit: String(pageSize),
    });
  const activeQuery = useRef(requestUrl);
  const [loadedUrl, setLoadedUrl] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal, force = false) => {
      const params = new URLSearchParams({
        offset: String(offset),
        history: showHistory ? "1" : "0",
        scope: filter,
        search,
        service,
        topic,
        business,
        source,
        queue,
        zone,
        order,
        limit: String(pageSize),
      });
      const url = "/api/staff/requests?" + params;
      if (activeQuery.current !== url) return;
      if (inFlightLoad.current?.url === url && !force) return;
      inFlightLoad.current?.controller.abort();
      const controller = new AbortController();
      inFlightLoad.current = { controller, url };
      const forward = () => controller.abort();
      signal?.addEventListener("abort", forward, { once: true });
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (inFlightLoad.current?.controller !== controller || signal?.aborted)
          return;
        if (res.status === 401) {
          window.location.assign("/staff/login");
          return;
        }
        if (res.status === 409) {
          window.location.assign("/staff/zone");
          return;
        }
        const data = await res.json();
        if (inFlightLoad.current?.controller !== controller || signal?.aborted)
          return;
        if (!res.ok) throw new Error(data.error ?? "불러오지 못했습니다");
        if (offset > 0 && offset >= (data.total ?? 0)) {
          setOffset(0);
          return;
        }
        const list = data.requests as ServiceRequestView[];
        const fresh = list.some(
          (r) =>
            r.state === "received" &&
            knownQuery.current === url &&
            known.current &&
            !known.current.has(r.id),
        );
        if (fresh && enabled.current) {
          navigator.vibrate?.([200, 100, 200]);
          const ctx = audio.current;
          if (ctx && ctx.state === "running") {
            const tone = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.06;
            tone.frequency.value = 660;
            tone.connect(gain);
            gain.connect(ctx.destination);
            tone.start();
            tone.stop(ctx.currentTime + 0.18);
          }
        }
        known.current = new Set(list.map((r) => r.id));
        knownQuery.current = url;
        setRows(list);
        setLoadedUrl(url);
        setTotal(data.total ?? list.length);
        setDispatchZones(data.dispatchZones ?? []);
        setSummary(data.summary ?? null);
        setResources(data.resources ?? []);
        setAlerts(data.alerts ?? {});
        setPushEnabled(data.pushEnabled === true);
        setHistoricalConflicts(data.historicalConflicts ?? {});
        setZoneLabels(data.zoneLabels ?? {});
        setReady(true);
        setError("");
      } catch (e) {
        if (!signal?.aborted && inFlightLoad.current?.controller === controller)
          setError(e instanceof Error ? e.message : "연결을 확인해 주세요");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", forward);
        if (inFlightLoad.current?.controller === controller)
          inFlightLoad.current = null;
      }
    },
    [
      offset,
      showHistory,
      filter,
      search,
      service,
      source,
      topic,
      business,
      queue,
      zone,
      order,
      pageSize,
    ],
  );
  useEffect(() => {
    const ctrl = new AbortController();
    activeQuery.current = requestUrl;
    setReady(false);
    void load(ctrl.signal);
    const timer = setInterval(() => void load(ctrl.signal), 5000);
    const focus = () => void load(ctrl.signal);
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      ctrl.abort();
      inFlightLoad.current?.controller.abort();
      inFlightLoad.current = null;
      window.removeEventListener("focus", focus);
    };
  }, [load, requestUrl]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  async function toggleSound() {
    enabled.current = !enabled.current;
    setSound(enabled.current);
    if (enabled.current) {
      try {
        audio.current ??= new AudioContext();
        await audio.current.resume();
      } catch {
        setError("이 기기는 소리 알림을 켤 수 없습니다. 화면을 확인해 주세요.");
      }
    }
  }
  async function act(
    r: ServiceRequestView,
    action: RequestAction,
    targetZone?: string,
    confirmed = false,
    extra: Record<string, unknown> = {},
  ) {
    if (busy) return;
    setBusy(r.id);
    try {
      const res = await fetch("/api/staff/requests", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id,
          version: r.version,
          action,
          reason: reasons[r.id] ?? "",
          confirmed,
          ...(targetZone ? { zoneId: targetZone } : {}),
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) await load(undefined, true);
        throw new Error(data.error ?? "처리하지 못했습니다");
      }
      await load(undefined, true);
      if (history[r.id]) await loadHistory(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function resetFilters() {
    setShowHistory(false);
    setDraft("");
    setSearch("");
    setService("all");
    setTopic("all");
    setBusiness("all");
    setSource("all");
    setQueue("all");
    setZone("all");
    setFilter("active");
    setOrder("priority");
    setOffset(0);
  }
  const pageReady = ready && loadedUrl === requestUrl;
  const open = pageReady
    ? rows.filter((r) => OPEN_REQUEST_STATES.includes(r.state))
    : [];
  const visible = pageReady ? rows : [];
  const selected =
    selection?.query === requestUrl
      ? visible.find((r) => r.id === selection.id)
      : undefined;
  const detailId = selected?.id ?? visible[0]?.id;
  useEffect(() => {
    if (selected) {
      const h = document
        .getElementById("request-detail-" + selected.id)
        ?.querySelector("h2");
      h?.focus({ preventScroll: true });
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={"work-requests" + (selected ? " has-selection" : "")}>
      <div className="work-contextbar"><p>근무 구역 <strong>{zoneLabels[zoneId] ?? "확인 중"}</strong></p><button type="button" onClick={() => void load()}>새로고침</button></div>
      {summary && <p className="work-today">오늘 접수 <strong>{summary.total}</strong>건 <span>·</span> 완료 <strong>{summary.done}</strong>건 <span>·</span> 확인 지연 <strong>{summary.awaitingAttention}</strong>건</p>}
      <details className="work-preferences">
        <summary>알림·설정</summary>
        <Link className="btn" href="/staff/resources">
          장비 현황 · 배차
        </Link>
        {ready && <ResourceAvailability resources={resources} />}
        {isDesk && (
          <Link className="btn" href="/staff/alerts">
            알림 운영 현황
          </Link>
        )}
        {isDesk && (
          <Link className="btn btn-primary" href="/staff/requests/new">
            여객 대신 새 요청 접수
          </Link>
        )}
        <PushSettings />
        <details className="work-metrics">
          <summary>오늘 운영 지표</summary>
          {summary && (
            <dl className="dx-summary">
              <div>
                <dt>오늘 전체 접수</dt>
                <dd>{summary.total}건</dd>
              </div>
              <div>
                <dt>사전등록 연결</dt>
                <dd>{summary.linked}건</dd>
              </div>
              <div>
                <dt>확인 지연 · 운영자 점검</dt>
                <dd>{summary.awaitingAttention}건</dd>
              </div>
              <div>
                <dt>직원 안내 / 로봇 / 이동지원</dt>
                <dd>
                  {summary.byService?.guidance ?? 0} /{" "}
                  {summary.byService?.robot ?? 0} /{" "}
                  {summary.byService?.mobility ?? 0}건
                </dd>
              </div>
              <div>
                <dt>통합 / 이전 호출 / 이전 이동지원</dt>
                <dd>
                  {summary.byQueue?.integrated ?? 0} /{" "}
                  {summary.byQueue?.call ?? 0} / {summary.byQueue?.assist ?? 0}
                  건
                </dd>
              </div>
              <div>
                <dt>오늘 완료</dt>
                <dd>{summary.done}건</dd>
              </div>
              <div>
                <dt>오늘 취소</dt>
                <dd>{summary.cancelled}건</dd>
              </div>
              <div>
                <dt>지원 불가</dt>
                <dd>{summary.unavailable}건</dd>
              </div>
              <div>
                <dt>시간 초과</dt>
                <dd>{summary.expired}건</dd>
              </div>
              <div>
                <dt>접수→배정 중앙값</dt>
                <dd>
                  {summary.medianAcceptSec === null
                    ? "자료 없음"
                    : `${summary.medianAcceptSec}초`}
                </dd>
              </div>
              <div>
                <dt>배정→도착 중앙값</dt>
                <dd>
                  {summary.medianArrivalSec === null
                    ? "자료 없음"
                    : `${summary.medianArrivalSec}초`}
                </dd>
              </div>
            </dl>
          )}
        </details>
        <p>
          현재 근무 구역: <strong>{zoneLabels[zoneId] ?? zoneId}</strong>
        </p>
        <div className="dx-actions">
          <button
            className="btn"
            onClick={() => void toggleSound()}
            aria-pressed={sound}
          >
            {sound ? "화면 내 소리 알림 켜짐" : "화면 내 소리 알림 켜기"}
          </button>
          <button className="btn btn-ghost" onClick={() => void load()}>
            새로 확인
          </button>
        </div>
      </details>
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
      <p role="status" className="work-queue-status sr-only">
        {pageReady
          ? `현재 페이지 · 진행 중 ${open.length}건 · 미배정 ${rows.filter((r) => r.state === "received").length}건`
          : "불러오는 중…"}
      </p>

      <form
        className="dx-card work-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
          setOffset(0);
        }}
      >
        <label htmlFor="queue-search">요청 번호 또는 위치 검색</label>
        <input
          id="queue-search"
          type="search"
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예: 127, 탑승동, 요청 번호"
        />
        <button className="btn" type="submit">
          검색
        </button>
        {(search ||
          service !== "all" ||
          topic !== "all" ||
          business !== "all" ||
          source !== "all" ||
          queue !== "all" ||
          zone !== "all" ||
          filter !== "active" ||
          showHistory ||
          order !== "priority") && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={resetFilters}
          >
            초기화
          </button>
        )}
        <details data-queue-filters>
          <summary>
            상세 필터
            {business !== "all" ? ` · ${businessFilterLabel(business)}` : ""}
            {[service, source, queue, zone, topic, business].some(
              (v) => v !== "all",
            )
              ? " · 세부 필터 적용 중"
              : ""}
          </summary>
          <label className="dx-option">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => {
                setShowHistory(e.target.checked);
                setOffset(0);
              }}
            />
            처리 이력 포함 · 최근 90일
          </label>
          <label htmlFor="queue-business">담당 업무</label>
          <select
            id="queue-business"
            value={business}
            onChange={(e) => {
              setBusiness(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">전체 담당 업무</option>
            <option value={UNCLASSIFIED_BUSINESS}>미분류·이전 요청</option>
            {BUSINESS_AREAS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <label htmlFor="queue-topic">상담·요청 유형</label>
          <select
            id="queue-topic"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">전체 상담·요청 유형</option>
            {SERVICE_CATALOG.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            id="queue-service"
            aria-label="서비스"
            value={service}
            onChange={(e) => {
              setService(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">전체 서비스</option>
            {Object.entries(SERVICE_LABEL).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="queue-source">접수 경로</label>
          <select
            id="queue-source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">전체 접수 경로</option>
            <option value="web">현장 웹</option>
            <option value="preregistered">사전등록 연결 웹</option>
            <option value="kiosk">키오스크</option>
            <option value="assisted">직원 대리 접수</option>
          </select>
          <label htmlFor="queue-original">기록 종류</label>
          <select
            id="queue-original"
            value={queue}
            onChange={(e) => {
              setQueue(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">전체 기록</option>
            <option value="integrated">새 통합 요청</option>
            <option value="call">이전 호출</option>
            <option value="assist">이전 이동지원</option>
          </select>
          <label htmlFor="queue-zone">담당 구역</label>
          <select
            id="queue-zone"
            value={zone}
            onChange={(e) => {
              setZone(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">전체 담당 구역</option>
            {Object.entries(zoneLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="queue-order">정렬</label>
          <select
            id="queue-order"
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setOffset(0);
            }}
          >
            <option value="priority">확인 필요 우선</option>
            <option value="oldest">오래된 접수순</option>
            <option value="newest">최신 접수순</option>
          </select>
          <p className="fine">
            확인 필요 우선: 위치 변경 → 확인 지연 → 미배정 → 진행 중. 같은
            분류에서는 오래된 접수부터 표시합니다.
          </p>
          <label htmlFor="queue-limit">페이지당 표시</label>
          <select
            id="queue-limit"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setOffset(0);
            }}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}건
              </option>
            ))}
          </select>
        </details>
      </form>
      <div className="work-scope-control">
        <div className="work-scope-tabs" role="group" aria-label="요청 범위">
          {[
            ["active", "미처리 전체"],
            ["waiting", "미배정"],
            ["mine", "내 구역"],
            ["location", "위치 변경"],
            ["attention", "확인 지연"],
            ["all", "전체·완료"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setOffset(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label htmlFor="request-filter">보여 줄 요청</label>
        <select
          id="request-filter"
          aria-label="요청 범위"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="all">전체 요청</option>
          <option value="active">미처리 전체</option>
          <option value="waiting">미배정</option>
          <option value="location">위치 변경 확인 대기</option>
          <option value="attention">확인 지연</option>
          <option value="mine">내 구역 담당</option>
        </select>
      </div>

      {rows.length >= 200 && (
        <p role="status">
          목록은 최대 200건을 표시합니다. 미처리 요청을 먼저 확인해 주세요.
        </p>
      )}
      <div
        className={"work-master-detail" + (visible.length ? "" : " is-empty")}
      >
        <div className="work-master">
          <h2 id="work-list-title" tabIndex={-1}>
            요청 목록{" "}
            <span className="work-result-count">{pageReady ? total : "—"}</span>
          </h2>
          <RequestCards rows={visible} selectedId={selected?.id} zoneLabels={zoneLabels} onSelect={id => setSelection({ id, query: requestUrl })} ready={pageReady} onReset={resetFilters} />
          <div className="work-table-wrap">
            <table className="work-request-table">
              <thead>
                <tr>
                  <th scope="col">접수·업무</th>
                  <th scope="col">위치·처리 방식</th>
                  <th scope="col">상태·담당</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <div className="work-empty">
                        <strong>
                          {pageReady
                            ? "표시할 요청이 없습니다"
                            : "요청을 불러오는 중입니다"}
                        </strong>
                        {pageReady && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={resetFilters}
                          >
                            검색·필터 초기화
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    className={detailId === r.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        type="button"
                        data-select-request={r.id}
                        aria-controls={"request-detail-" + r.id}
                        aria-pressed={detailId === r.id}
                        onClick={() =>
                          setSelection({ id: r.id, query: requestUrl })
                        }
                      >
                        <strong>{requestServiceLabel(r)}</strong>
                        <span>
                          {new Date(r.createdAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {r.id.slice(0, 8)}
                        </span>
                      </button>
                    </td>
                    <td>{r.place}</td>
                    <td>
                      <strong>{requestStateLabel(r)}</strong>
                      <span>
                        {r.assignedZone
                          ? (zoneLabels[r.assignedZone] ?? r.assignedZone)
                          : "미배정"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dx-actions">
            <button
              className="btn"
              disabled={!pageReady || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              이전 목록
            </button>
            <span>
              검색·필터 결과 {total}건 중{" "}
              {visible.length === 0 ? 0 : offset + 1}–
              {visible.length === 0
                ? 0
                : Math.min(offset + visible.length, total)}
            </span>
            <button
              className="btn"
              disabled={!pageReady || offset + rows.length >= total}
              onClick={() => setOffset(offset + pageSize)}
            >
              다음 목록
            </button>
          </div>
        </div>
        <ul className="dx-request-list work-details">
          {visible.map((r) => {
            const next = nextRequestAction(r);
            const current = r.queue !== "call" && r.queue !== "assist";
            const mine = r.assignedZone === zoneId;
            const open = OPEN_REQUEST_STATES.includes(r.state);
            return (
              <li
                key={r.id}
                id={"request-detail-" + r.id}
                data-request-id={r.id}
                className={
                  "dx-card work-detail" +
                  (r.id === detailId ? " is-current" : "")
                }
              >
                <button
                  type="button"
                  className="btn btn-ghost work-back"
                  onClick={() => {
                    setSelection(null);
                    requestAnimationFrame(() =>
                      document.getElementById("work-list-title")?.focus(),
                    );
                  }}
                >
                  요청 목록으로
                </button>
                <div className="work-detail-heading">
                  <span className="work-state-badge">
                    {requestStateLabel(r)}
                  </span>
                  <span className="work-request-ref">{r.id.slice(0, 8)}</span>
                </div>
                <h2 tabIndex={-1}>
                  {taskOf(r.serviceDetails?.task)?.label ??
                    SERVICE_LABEL[r.service]}
                </h2>
                <p className="work-meeting-place">
                  <strong>{r.placeId === "no-meeting" ? "처리 방식" : r.topicId === "facility" ? "신고 위치" : "만날 곳"}: {r.place}</strong>
                </p>
                {r.serviceDetails &&
                  serviceDetailsLines(r.serviceDetails).length > 0 && (
                    <dl className="service-detail-list">
                      {serviceDetailsLines(r.serviceDetails).map((f) => (
                        <div key={f.label}>
                          <dt>{f.label}</dt>
                          <dd>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                {r.topicId && !r.serviceDetails?.task && (
                  <p className="public-topic-note">
                    {supportTopic(r.topicId)?.label}
                  </p>
                )}
                {r.businessId && (
                  <p>처리 담당 업무: {businessOf(r.businessId)?.label}</p>
                )}
                {r.destinationId && (
                  <p>
                    <strong>목적지: {placeOf(r.destinationId)?.label}</strong>
                  </p>
                )}
                {historicalConflicts[r.id] > 0 && (
                  <p role="note" className="dx-notice">
                    과거 중복 접수 확인 대상 · 같은 등록·서비스로 진행 중인 기록{" "}
                    {historicalConflicts[r.id]}건. 기존 기록은 보존했습니다.
                    안내데스크에서 실제 지원 여부를 확인해 주세요.
                  </p>
                )}
                {!current && (
                  <p>
                    <strong>
                      {r.queue === "call" ? "이전 직원 호출" : "이전 이동지원"}
                    </strong>
                  </p>
                )}
                {r.assignedZone && (
                  <p>
                    담당 구역: {zoneLabels[r.assignedZone] ?? r.assignedZone}
                  </p>
                )}
                {r.pendingPlaceId && (
                  <div className="dx-notice">
                    <p>
                      <strong>
                        위치 변경 확인 대기: {r.place} → {r.pendingPlace}
                      </strong>
                    </p>
                    <p>
                      확인 전에는 이동·도착·지원 시작 단계를 진행할 수 없습니다.
                      위치 수락 시 담당과 배차를 유지하고 배정 단계로
                      돌아갑니다.
                    </p>
                    {(mine || isDesk) && (
                      <>
                        <button
                          className="btn"
                          disabled={!!busy}
                          onClick={() => void act(r, "accept_place")}
                        >
                          새 만날 곳 수락
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={!!busy || !(reasons[r.id] ?? "").trim()}
                          onClick={() => void act(r, "reject_place")}
                        >
                          사유 기록 후 위치 변경 거절
                        </button>
                      </>
                    )}
                  </div>
                )}
                <p>
                  {r.party}명 ·{" "}
                  {r.source === "preregistered"
                    ? "사전등록 연결"
                    : r.source === "kiosk"
                      ? "키오스크 접수"
                      : r.source === "assisted"
                        ? "직원 대리 접수"
                        : "현장 웹 접수"}{" "}
                  · {r.lang === "en" ? "영어 안내" : "한국어 안내"}
                </p>
                {r.choices.length > 0 && (
                  <ul>
                    {r.choices.map((c) => (
                      <li key={c}>{labelOf(c)}</li>
                    ))}
                  </ul>
                )}
                {r.note && <p>여객의 말: {r.note}</p>}
                {r.reason && <p>안내한 이유: {r.reason}</p>}
                {r.resolution && (
                  <RequestResolutionView resolution={r.resolution} />
                )}
                {next &&
                  !(
                    current &&
                    next.action === "complete" &&
                    supportTopic(r.topicId)?.mode === "referral"
                  ) &&
                  !r.pendingPlaceId &&
                  (r.state === "received" || mine) && (
                    <button
                      className="btn btn-primary"
                      disabled={!!busy}
                      onClick={() => void act(r, next.action)}
                    >
                      {next.label}
                    </button>
                  )}
                {current && open && (mine || isDesk) && (
                  <BusinessHandling
                    key={`${r.id}-${r.businessId ?? ""}`}
                    request={r}
                    busy={!!busy}
                    onAction={(action, extra) =>
                      act(r, action, undefined, false, extra)
                    }
                  />
                )}
                {current && open && (
                  <details className="work-delivery">
                    <summary>알림 전달 상태</summary>
                    <RequestAlertStatus
                      id={r.id}
                      alert={alerts[r.id]}
                      pushEnabled={pushEnabled}
                      zoneLabels={zoneLabels}
                      onChanged={async () => {
                        await load();
                      }}
                    />
                  </details>
                )}
                {r.service === "robot" && (
                  <p className="fine">
                    로봇 출발·도착은 이 화면에서 바꾸는 모의 상태입니다.
                  </p>
                )}
                {current && open && r.service !== "guidance" && (
                  <ResourceDispatch
                    request={r}
                    resources={resources}
                    canEdit={(isDesk || mine) && !r.pendingPlaceId}
                    onChanged={async () => {
                      await load();
                      if (history[r.id]) await loadHistory(r.id);
                    }}
                  />
                )}
                {open && r.assignedZone && !mine && (
                  <p>다른 구역에서 맡은 요청입니다.</p>
                )}
                <details className="work-secondary-actions">
                  <summary>사유 입력·지원 불가·인계·이력</summary>
                  {open && (mine || isDesk) && (current || isDesk) && (
                    <div className="dx-ending">
                      <label htmlFor={`reason-${r.id}`}>
                        {current
                          ? "처리 사유 · 여객에게도 전달됩니다"
                          : "운영자 종료 사유 · 직원 이력에 기록합니다"}
                      </label>
                      <textarea
                        id={`reason-${r.id}`}
                        maxLength={120}
                        value={reasons[r.id] ?? ""}
                        onChange={(e) =>
                          setReasons({ ...reasons, [r.id]: e.target.value })
                        }
                      />
                      {current && (
                        <button
                          className="btn btn-ghost"
                          disabled={!!busy || !(reasons[r.id] ?? "").trim()}
                          onClick={() => void act(r, "unavailable")}
                        >
                          지원 불가로 안내
                        </button>
                      )}
                      {isDesk && (
                        <OperatorClose
                          version={r.version}
                          disabled={!!busy || !(reasons[r.id] ?? "").trim()}
                          onClose={() =>
                            void act(r, "operator_cancel", undefined, true)
                          }
                        />
                      )}
                    </div>
                  )}
                  {current &&
                    isDesk &&
                    !r.pendingPlaceId &&
                    ["assigned", "en_route", "arrived"].includes(r.state) && (
                      <button
                        className="btn btn-ghost"
                        disabled={!!busy}
                        onClick={() => void act(r, "reopen")}
                      >
                        배정 해제 · 다시 접수
                      </button>
                    )}
                  {current && isDesk && open && (
                    <div className="dx-ending">
                      <label htmlFor={`target-${r.id}`}>
                        담당 구역 지정 · 교대 인계
                      </label>
                      <select
                        id={`target-${r.id}`}
                        value={targets[r.id] ?? ""}
                        onChange={(e) =>
                          setTargets((old) => ({
                            ...old,
                            [r.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">구역을 선택하세요</option>
                        {dispatchZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn"
                        disabled={
                          !!busy ||
                          !targets[r.id] ||
                          (r.state !== "received" &&
                            !(reasons[r.id] ?? "").trim())
                        }
                        onClick={() =>
                          void act(
                            r,
                            r.state === "received" ? "assign" : "transfer",
                            targets[r.id],
                          )
                        }
                      >
                        {r.state === "received"
                          ? "선택 구역에 배정"
                          : "사유 기록 후 담당 인계"}
                      </button>
                    </div>
                  )}
                  {
                    <div className="dx-ending">
                      <button
                        className="btn btn-ghost"
                        onClick={() => void loadHistory(r.id)}
                      >
                        처리·인계 이력 확인
                      </button>
                      {history[r.id] &&
                        (history[r.id].length === 0 ? (
                          <p className="fine">
                            이전 처리의 시간별 이력은 수집되지 않았습니다.
                            운영자 종료는 이번 버전부터 기록합니다.
                          </p>
                        ) : (
                          <ol>
                            {history[r.id].map((h) => (
                              <li key={h.version}>
                                {new Date(h.at).toLocaleTimeString("ko-KR")} ·{" "}
                                {h.action === "classify_business"
                                  ? "담당 업무 분류 변경"
                                  : h.action === "operator_cancel"
                                    ? "운영자 확인 후 종료"
                                    : h.action.startsWith("pickup_")
                                      ? ({
                                          pickup_changed: "만날 곳 수정",
                                          pickup_requested: "위치 변경 요청",
                                          pickup_withdrawn:
                                            "위치 변경 요청 철회",
                                          pickup_accepted: "위치 변경 수락",
                                          pickup_rejected: "위치 변경 거절",
                                        }[h.action] ?? "위치 변경 처리")
                                      : h.action === "baseline"
                                        ? "이전 버전 기준 상태"
                                        : h.action === "transfer"
                                          ? "담당 인계"
                                          : h.action === "resource_assign"
                                            ? "장비 배차"
                                            : h.action === "resource_release"
                                              ? "장비 배차 해제"
                                              : h.action === "privacy_erased"
                                                ? "상세 보관 종료"
                                                : requestStateLabel({
                                                    ...r,
                                                    state: h.state,
                                                  })}
                                {h.assignedZone &&
                                  ` · 담당 ${zoneLabels[h.assignedZone] ?? h.assignedZone}`}
                                {h.actorZone &&
                                  ` · 처리 ${zoneLabels[h.actorZone] ?? h.actorZone}`}
                                {h.reason && ` · ${h.reason}`}
                              </li>
                            ))}
                          </ol>
                        ))}
                    </div>
                  }
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
