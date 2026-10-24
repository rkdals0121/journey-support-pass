"use client";

import { CarFront, PlaneTakeoff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistItemDto } from "@/lib/api/staff";
import { ErrorNote } from "../../components/Alert";

const TIMEOUT_MS = 10_000;
const STATE_LABEL: Record<AssistItemDto["state"], string> = {
  received: "접수됨",
  assigned: "배정됨",
  moving: "이동 중",
  done: "완료",
  cancelled: "취소·닫힘",
};
const NEXT: Partial<Record<AssistItemDto["state"], { action: "assign" | "move" | "done"; label: string }>> = {
  received: { action: "assign", label: "제가 맡겠습니다" },
  assigned: { action: "move", label: "이동 시작" },
  moving: { action: "done", label: "이동지원 마침" },
};

/** 이동지원 요청 목록. 5초마다 다시 읽고, 새 요청이 오면 진동으로 알린다. */
export function AssistList({ refreshSec }: { refreshSec: number }) {
  const [items, setItems] = useState<AssistItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/staff/assist", { cache: "no-store", signal: ctrl.signal });
      if (res.status === 401) return window.location.replace("/staff/login");
      if (res.status === 409) return window.location.replace("/staff/zone");
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "불러오지 못했습니다");
      setError(null);
      const list = body.requests as AssistItemDto[];
      const fresh = list.filter((a) => a.state === "received" && known.current && !known.current.has(a.id));
      if (fresh.length > 0) navigator.vibrate?.([200, 100, 200]);
      known.current = new Set(list.filter((a) => a.state === "received").map((a) => a.id));
      setItems(list);
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 불러옵니다.");
    } finally {
      clearTimeout(limit);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), refreshSec * 1000);
    return () => clearInterval(timer);
  }, [load, refreshSec]);

  async function act(id: string, action: "assign" | "move" | "done") {
    setBusy(id);
    try {
      const res = await fetch(`/api/staff/assist/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "처리하지 못했습니다");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 해 주세요.");
    }
    await load();
    setBusy(null);
  }

  if (items === null) return <p className="muted">불러오는 중…</p>;
  const open = items.filter((a) => NEXT[a.state]);
  const ended = items.filter((a) => !NEXT[a.state]);
  return (
    <div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <h2>진행 중 {open.length}건</h2>
      {open.length === 0 && <p className="muted">진행 중인 이동지원 요청이 없습니다.</p>}
      <ul className="calls">
        {open.map((a) => {
          const next = NEXT[a.state]!;
          const canAct = a.state === "received" || a.assignedByMe;
          return (
            <li key={a.id} className={`call call-${a.state === "received" ? "waiting" : "accepted"}`}>
              <div className="call-head">
                <span className={`call-state ${a.state === "received" ? "waiting" : "accepted"}`}>
                  <CarFront size={18} aria-hidden="true" /> {STATE_LABEL[a.state]}
                </span>
                <span className="call-wait">
                  {a.time} · {a.waitedMin}분 전
                </span>
              </div>
              <strong className="call-place">{a.place}</strong>
              {a.pass ? (
                <>
                  <p className="call-flight">
                    <PlaneTakeoff size={18} aria-hidden="true" /> <b className="num">{a.pass.flight.flightNo}</b> {a.pass.flight.destName} · 탑승구{" "}
                    <b className="num">{a.pass.flight.gate ?? "미정"}</b> · 출발 {a.pass.flight.estTime ?? a.pass.flight.schedTime}
                  </p>
                  <ul className="chips" aria-label="여객이 고른 필요한 지원">
                    {a.pass.lang === "en" && <li className="chip chip-sun">영어 사용</li>}
                    {a.pass.proofVerified && <li className="chip chip-sun">우대 확인됨</li>}
                    {a.pass.needs.map((n) => (
                      <li key={n} className="chip">
                        {n}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted">여객 정보가 지워졌습니다(출발했거나 여객이 지움).</p>
              )}
              {a.assignedBy && <p className="muted">맡은 구역: {a.assignedBy}</p>}
              {canAct ? (
                <button className="btn btn-primary" onClick={() => void act(a.id, next.action)} disabled={busy === a.id}>
                  {next.label}
                </button>
              ) : (
                <p className="muted">다른 구역 직원이 맡았습니다.</p>
              )}
            </li>
          );
        })}
      </ul>
      {ended.length > 0 && (
        <>
          <h2>방금 끝난 요청</h2>
          <ul className="calls">
            {ended.map((a) => (
              <li key={a.id} className="call call-accepted">
                <div className="call-head">
                  <span className="call-state">{STATE_LABEL[a.state]}</span>
                  <span className="call-wait">{a.time}</span>
                </div>
                <strong className="call-place">{a.place}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
