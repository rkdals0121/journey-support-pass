"use client";
import Link from "next/link";
import { PushSettings } from "./PushSettings";
import { ResourceDispatch } from "./ResourceDispatch";
import { ResourceAvailability } from "@/app/components/ResourceAvailability";
import { RequestAlertStatus } from "./RequestAlertStatus";
import type { RequestAlert } from "@/lib/request-alert-model";
import type { DispatchResource } from "@/lib/resource-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { labelOf } from "@/lib/catalog";
import {
  nextRequestAction,
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
}: {
  zoneId: string;
  isDesk: boolean;
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [sound, setSound] = useState(false);
  const [filter, setFilter] = useState("all");
  const known = useRef<Set<string> | null>(null);
  const loading = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (loading.current) return;
      loading.current = true;
      const controller = new AbortController();
      const forward = () => controller.abort();
      signal?.addEventListener("abort", forward, { once: true });
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(
          `/api/staff/requests?offset=${offset}&history=${showHistory ? 1 : 0}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (res.status === 401) {
          window.location.assign("/staff/login");
          return;
        }
        if (res.status === 409) {
          window.location.assign("/staff/zone");
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "불러오지 못했습니다");
        const list = data.requests as ServiceRequestView[];
        const fresh = list.some(
          (r) =>
            r.state === "received" && known.current && !known.current.has(r.id),
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
        setRows(list);
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
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "연결을 확인해 주세요");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", forward);
        loading.current = false;
      }
    },
    [offset, showHistory],
  );
  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    const timer = setInterval(() => void load(ctrl.signal), 5000);
    const focus = () => void load(ctrl.signal);
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      ctrl.abort();
      window.removeEventListener("focus", focus);
    };
  }, [load]);
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
          ...(targetZone ? { zoneId: targetZone } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리하지 못했습니다");
      await load();
      if (history[r.id]) await loadHistory(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const open = rows.filter((r) => OPEN_REQUEST_STATES.includes(r.state));
  const visible = rows.filter(
    (r) =>
      filter === "all" ||
      (filter === "mine" && r.assignedZone === zoneId) ||
      (filter === "waiting" && r.state === "received"),
  );
  return (
    <section>
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
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
      <p role="status">
        {ready
          ? `진행 중 ${open.length}건 · 미배정 ${rows.filter((r) => r.state === "received").length}건`
          : "불러오는 중…"}
      </p>
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
      <p>
        기존 호출·이동지원과 새 통합 요청을 같은 목록에서 확인합니다. 화면
        필터는 현재 페이지에 적용됩니다.
      </p>
      <div className="dx-actions">
        <button
          className="btn"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 200))}
        >
          이전 목록
        </button>
        <span>
          {total}건 중 {total === 0 ? 0 : offset + 1}–
          {Math.min(offset + rows.length, total)}
        </span>
        <button
          className="btn"
          disabled={offset + rows.length >= total}
          onClick={() => setOffset(offset + 200)}
        >
          다음 목록
        </button>
      </div>
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
              {summary.byQueue?.integrated ?? 0} / {summary.byQueue?.call ?? 0}{" "}
              / {summary.byQueue?.assist ?? 0}건
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
      <label htmlFor="request-filter">보여 줄 요청</label>
      <select
        id="request-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">전체</option>
        <option value="waiting">미배정</option>
        <option value="mine">내 구역 담당</option>
      </select>
      {ready && visible.length === 0 && <p>표시할 요청이 없습니다.</p>}
      {rows.length >= 200 && (
        <p role="status">
          목록은 최대 200건을 표시합니다. 미처리 요청을 먼저 확인해 주세요.
        </p>
      )}
      <ul className="dx-request-list">
        {visible.map((r) => {
          const next = nextRequestAction(r);
          const current = r.queue !== "call" && r.queue !== "assist";
          const mine = r.assignedZone === zoneId;
          const open = OPEN_REQUEST_STATES.includes(r.state);
          return (
            <li key={r.id} data-request-id={r.id} className="dx-card">
              <h2>{SERVICE_LABEL[r.service]}</h2>
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
              <p>
                <strong>{requestStateLabel(r)}</strong> ·{" "}
                {new Date(r.createdAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p>
                <strong>만날 곳: {r.place}</strong>
              </p>
              {r.assignedZone && (
                <p>담당 구역: {zoneLabels[r.assignedZone] ?? r.assignedZone}</p>
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
              {current && open && (
                <RequestAlertStatus
                  id={r.id}
                  alert={alerts[r.id]}
                  pushEnabled={pushEnabled}
                  zoneLabels={zoneLabels}
                  onChanged={async () => {
                    await load();
                  }}
                />
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
                  canEdit={isDesk || mine}
                  onChanged={async () => {
                    await load();
                    if (history[r.id]) await loadHistory(r.id);
                  }}
                />
              )}
              {next && (r.state === "received" || mine) && (
                <button
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => void act(r, next.action)}
                >
                  {next.label}
                </button>
              )}
              {open && r.assignedZone && !mine && (
                <p>다른 구역에서 맡은 요청입니다.</p>
              )}
              {current && open && (mine || isDesk) && (
                <div className="dx-ending">
                  <label htmlFor={`reason-${r.id}`}>
                    처리 사유 · 지원 불가 시 여객에게 전달됩니다
                  </label>
                  <textarea
                    id={`reason-${r.id}`}
                    maxLength={120}
                    value={reasons[r.id] ?? ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [r.id]: e.target.value })
                    }
                  />
                  <button
                    className="btn btn-ghost"
                    disabled={!!busy || !(reasons[r.id] ?? "").trim()}
                    onClick={() => void act(r, "unavailable")}
                  >
                    지원 불가로 안내
                  </button>
                </div>
              )}
              {current &&
                isDesk &&
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
                      setTargets((old) => ({ ...old, [r.id]: e.target.value }))
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
                      (r.state !== "received" && !(reasons[r.id] ?? "").trim())
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
              {current && (
                <div className="dx-ending">
                  <button
                    className="btn btn-ghost"
                    onClick={() => void loadHistory(r.id)}
                  >
                    처리·인계 이력 확인
                  </button>
                  {history[r.id] && (
                    <ol>
                      {history[r.id].map((h) => (
                        <li key={h.version}>
                          {new Date(h.at).toLocaleTimeString("ko-KR")} ·{" "}
                          {h.action === "baseline"
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
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
