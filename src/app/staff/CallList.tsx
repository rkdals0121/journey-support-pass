"use client";

import { BellRing, CircleCheck, Clock, LogOut, MapPin, PlaneTakeoff, RefreshCw, Repeat, UserCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CallDto } from "@/lib/api/staff";
import { textOf } from "@/lib/i18n";
import { ErrorNote } from "../components/Alert";
import { closeText } from "../components/GuideParts";

interface Data {
  calls: CallDto[];
  zoneLabel: string;
  isDesk: boolean;
  canSwitch: boolean;
}

const ko = textOf("ko");

/**
 * 직원 호출 목록. 여객이 부를 때만 뜬다. 직원이 먼저 여객을 찾아 다가가는 화면이 아니다.
 * 받지 않은 호출이 맨 위에, 오래 기다린 순으로 놓인다. 새 호출이 오면 진동과 소리로 알린다.
 */
export function CallList({ refreshSec }: { refreshSec: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff/calls", { cache: "no-store" });
      if (res.status === 401) return window.location.replace("/staff/login");
      if (res.status === 409) return window.location.replace("/staff/zone");
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "호출을 불러오지 못했습니다");
      setError(null);
      setData(body);
      // 처음 불러올 때 이미 있던 호출은 알리지 않는다. 그 뒤에 새로 온 것만 알린다.
      const waiting = (body.calls as CallDto[]).filter((c) => c.state === "waiting").map((c) => c.id);
      if (known.current && waiting.some((id) => !known.current!.has(id))) notify();
      known.current = new Set(waiting);
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 불러옵니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, refreshSec * 1000);
    return () => clearInterval(timer);
  }, [load, refreshSec]);

  async function act(id: string, action: "accept" | "done") {
    setBusy(id);
    try {
      const res = await fetch(`/api/staff/calls/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) setError((await res.json()).error ?? "처리하지 못했습니다");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 해 주세요.");
    }
    setBusy(null);
    await load();
  }

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/staff/login");
  }

  const all = data?.calls ?? [];
  const open = all.filter((c) => c.state === "waiting" || c.state === "accepted");
  const mineOpen = open.filter((c) => c.mine || c.acceptedByMe);
  const shownOpen = scope === "mine" ? mineOpen : open;
  const ended = all.filter((c) => (c.state === "done" || c.state === "cancelled") && (scope === "all" || c.mine || c.acceptedByMe));
  const elsewhere = open.length - mineOpen.length;

  return (
    <div>
      <header className="sign">
        <div className="sign-top">
          <span className="sign-zone">
            <MapPin size={18} aria-hidden="true" />
            {data?.zoneLabel ?? "…"}
          </span>
          <span className="sign-actions">
            {data?.canSwitch && (
              <Link className="sign-btn" href="/staff/zone">
                <Repeat size={16} aria-hidden="true" />
                구역 바꾸기
              </Link>
            )}
            <button className="sign-btn" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              나가기
            </button>
          </span>
        </div>
        <h1>
          직원 호출 <b className="num">{shownOpen.length}</b>
        </h1>
        <p>여객이 키오스크에서 「직원 부르기」를 누르면 여기에 뜹니다.</p>
      </header>

      <div className="seg" role="group" aria-label="보는 범위">
        <button aria-pressed={scope === "mine"} className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>
          내 구역 <span className="count">{mineOpen.length}</span>
        </button>
        <button aria-pressed={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
          전체 <span className="count">{open.length}</span>
        </button>
        <button className="seg-refresh" onClick={load} aria-label="새로 고침" disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" className={loading ? "spin" : ""} />
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {data && shownOpen.length === 0 && (
        <div className="empty">
          <span className="bubble">
            <BellRing size={28} aria-hidden="true" />
          </span>
          <strong>지금은 호출이 없습니다</strong>
          <p>
            이 화면을 켜 두세요. 호출이 오면 진동과 소리로 알립니다. 패스를 지닌 여객에게 먼저 다가가 돕지 않고, 여객이 부를 때
            갑니다.
          </p>
          {scope === "mine" && elsewhere > 0 && (
            <button className="btn" onClick={() => setScope("all")}>
              다른 구역의 호출 {elsewhere}건 보기
            </button>
          )}
        </div>
      )}

      <ul className="calls" aria-live="polite">
        {shownOpen.map((c) => (
          <li key={c.id} className={`call call-${c.state} ${c.mine ? "" : "call-other"}`}>
            <div className="call-head">
              <span className={`call-state ${c.state}`}>
                {c.state === "waiting" ? (
                  <>
                    <BellRing size={16} aria-hidden="true" /> 기다리는 중
                  </>
                ) : (
                  <>
                    <UserCheck size={16} aria-hidden="true" /> {c.acceptedByMe ? "내 구역이 가는 중" : `${c.acceptedBy} 직원이 가는 중`}
                  </>
                )}
              </span>
              <span className="call-wait">
                <Clock size={16} aria-hidden="true" />
                <span className="num">{c.time}</span> · {c.waitedMin === 0 ? "방금" : `${c.waitedMin}분 전`}
              </span>
            </div>
            <strong className="call-place">{c.place}</strong>
            <p className="call-screen">{c.screen === "register" ? "등록 키오스크에서 불렀습니다" : "안내 키오스크에서 불렀습니다"}</p>

            {c.pass ? (
              <div className="call-pass">
                {c.pass.choices.length > 0 ? (
                  <ul className="chips" aria-label="여객이 고른 항목">
                    {c.pass.lang === "en" && <li className="chip chip-sun">영어 사용</li>}
                    {c.pass.choices.map((s) => (
                      <li key={s} className="chip">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">여객이 고른 항목이 없습니다.{c.pass.lang === "en" ? " 영어를 씁니다." : ""}</p>
                )}
                <p className="call-flight">
                  <PlaneTakeoff size={18} aria-hidden="true" />
                  <b className="num">{c.pass.flight.flightNo}</b> {c.pass.flight.destName} · 탑승구{" "}
                  <b className="num">{c.pass.flight.gate ?? "미정"}</b>
                  <span className="call-close">{closeText(c.pass.flight, ko)}</span>
                </p>
              </div>
            ) : (
              <p className="muted small">패스를 찍지 않고 불렀습니다. 가서 무엇이 필요한지 여쭤봐 주세요.</p>
            )}

            <div className="call-actions">
              {c.state === "waiting" && (
                <button className="btn btn-primary" onClick={() => act(c.id, "accept")} disabled={busy === c.id}>
                  가겠습니다
                </button>
              )}
              <button className={c.state === "waiting" ? "btn" : "btn btn-primary"} onClick={() => act(c.id, "done")} disabled={busy === c.id}>
                <CircleCheck size={20} aria-hidden="true" />
                도움 마침
              </button>
            </div>
          </li>
        ))}
      </ul>

      {ended.length > 0 && (
        <>
          <h2>방금 끝난 호출</h2>
          <ul className="calls-ended">
            {ended.map((c) => (
              <li key={c.id}>
                <span>
                  <b className="num">{c.time}</b> {c.place}
                </span>
                <span className="muted">
                  {c.state === "done" ? `도움 마침${c.acceptedBy ? ` · ${c.acceptedBy}` : ""}` : "여객이 거둠"} · {c.waitedMin}분
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 새 호출을 진동과 짧은 소리로 알린다. 소리는 화면을 한 번이라도 누른 뒤에만 난다(브라우저의 규칙). */
function notify() {
  navigator.vibrate?.([200, 100, 200]);
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {
    // 소리를 낼 수 없는 기기에서는 화면과 진동으로만 알린다.
  }
}
