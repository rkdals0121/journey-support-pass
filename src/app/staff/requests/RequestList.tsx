"use client";
import Link from "next/link";
import { PushSettings } from "./PushSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import { labelOf } from "@/lib/catalog";
import {
  NEXT_REQUEST_ACTION,
  OPEN_REQUEST_STATES,
  SERVICE_LABEL,
  STATE_LABEL,
  type ServiceRequestView,
  type RequestAction,
  type RequestSummary,
} from "@/lib/service-request-model";
export function RequestList({
  zoneId,
  isDesk,
}: {
  zoneId: string;
  isDesk: boolean;
}) {
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  const [zoneLabels, setZoneLabels] = useState<Record<string, string>>({});
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
  const load = useCallback(async (signal?: AbortSignal) => {
    if (loading.current) return;
    loading.current = true;
    const controller = new AbortController();
    const forward = () => controller.abort();
    signal?.addEventListener("abort", forward, { once: true });
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("/api/staff/requests", {
        cache: "no-store",
        signal: controller.signal,
      });
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
      setSummary(data.summary ?? null);
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
  }, []);
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
      void audio.current?.close();
    };
  }, [load]);
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
  async function act(r: ServiceRequestView, action: RequestAction) {
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리하지 못했습니다");
      await load();
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
      {summary && (
        <dl className="dx-summary">
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
          const next = NEXT_REQUEST_ACTION[r.state];
          const mine = r.assignedZone === zoneId;
          const open = OPEN_REQUEST_STATES.includes(r.state);
          return (
            <li key={r.id} data-request-id={r.id} className="dx-card">
              <h2>{SERVICE_LABEL[r.service]}</h2>
              <p>
                <strong>{STATE_LABEL[r.state]}</strong> ·{" "}
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
              {r.service === "robot" && (
                <p className="fine">
                  로봇 출발·도착은 이 화면에서 바꾸는 모의 상태입니다.
                </p>
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
              {open && (mine || isDesk) && (
                <div className="dx-ending">
                  <label htmlFor={`reason-${r.id}`}>
                    지원할 수 없는 이유 · 여객에게 전달됩니다
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
              {isDesk &&
                ["assigned", "en_route", "arrived"].includes(r.state) && (
                  <button
                    className="btn btn-ghost"
                    disabled={!!busy}
                    onClick={() => void act(r, "reopen")}
                  >
                    배정 해제 · 다시 접수
                  </button>
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
