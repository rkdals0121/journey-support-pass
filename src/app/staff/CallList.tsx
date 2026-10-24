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
// 불러오기(받기·마침도) 한 번을 기다리는 가장 긴 시간. 약한 연결에서 답이 오지 않는 요청 하나를 붙잡고 있으면
// 그 뒤의 자동 불러오기가 모두 건너뛰어져, 새 호출이 떠도 목록이 그대로이고 진동·소리도 나지 않는다.
const LOAD_TIMEOUT_MS = 10_000;

/**
 * 직원 호출 목록. 여객이 부를 때만 뜬다. 직원이 먼저 여객을 찾아 다가가는 화면이 아니다.
 * 받지 않은 호출이 맨 위에, 오래 기다린 순으로 놓인다. 새 호출이 오면 진동과 소리로 알린다.
 */
export function CallList({ refreshSec }: { refreshSec: number }) {
  const [data, setData] = useState<Data | null>(null);
  // 누른 단추가 사라지면(받기 → 단추가 바뀜, 마침 → 카드가 내려감) 초점이 화면 밖으로 빠진다.
  // 그때만 제목으로 옮겨 키보드·화면 읽기 프로그램으로 쓰는 직원이 자리를 잃지 않게 한다.
  const headRef = useRef<HTMLHeadingElement>(null);
  const keepFocus = () =>
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) headRef.current?.focus();
    }, 0);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  // 불러오기 오류(다음 불러오기에서 저절로 사라진다)와 누른 것의 오류(다른 것을 누를 때까지 남는다)를 따로 둔다.
  // 한데 두면 "다른 직원이 먼저 받았습니다"가 바로 뒤의 불러오기에 지워져 한순간만 보인다.
  const [error, setError] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 새로 고침 단추를 직접 눌렀을 때만 돈다. 5초마다 저절로 불러올 때 단추를 막으면 그 단추에 있던 초점이 사라진다.
  const [manual, setManual] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // 불러오기가 겹치면 늦게 온 옛 답이 새 답을 덮는다. 보낸 차례를 세어 가장 나중에 보낸 것의 답만 쓴다.
  const sent = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    // 저절로 불러올 때는 앞의 것이 아직 오는 중이면 건너뛴다(느린 연결에서 쌓이지 않게).
    if (inFlight.current && !force) return;
    const mine = ++sent.current;
    inFlight.current = true;
    // 답이 오지 않는 요청은 끊는다. 끊긴 것은 catch 로 가서 연결 오류로 알리고, 다음 차례에 다시 불러온다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
    try {
      const res = await fetch("/api/staff/calls", { cache: "no-store", signal: ctrl.signal });
      if (mine !== sent.current) return;
      if (res.status === 401) return window.location.replace("/staff/login");
      if (res.status === 409) return window.location.replace("/staff/zone");
      const body = await res.json();
      if (mine !== sent.current) return;
      if (!res.ok) return setError(body.error ?? "호출을 불러오지 못했습니다");
      setError(null);
      setData(body);
      // 처음 불러올 때 이미 있던 호출은 알리지 않는다. 그 뒤에 새로 온 것만 알린다.
      // 「내 구역」을 보고 있으면 내 구역 호출만 알린다. 다른 구역 호출로 울리면 화면에는 아무것도 없어 헷갈린다.
      const waiting = (body.calls as CallDto[]).filter((c) => c.state === "waiting");
      // 호출 번호와 누른 시각을 함께 본다. 아무도 받지 않은 키오스크 호출을 다음 여객이 다시 누르면 같은 호출이
      // 새 여객의 것으로 바뀌고 누른 시각만 새로 적힌다(같은 번호). 번호만 보면 새로 기다리는 사람이 생겨도 울리지 않는다.
      // (분 단위인 time 이 아니라 초까지 있는 createdAt 을 본다. 같은 분 안에 다시 눌러도 알린다.)
      const keyOf = (c: CallDto) => `${c.id}|${c.createdAt}`;
      const fresh = known.current ? waiting.filter((c) => !known.current!.has(keyOf(c))) : [];
      if (fresh.some((c) => c.mine || scopeRef.current === "all")) notify();
      known.current = new Set(waiting.map(keyOf));
    } catch {
      if (mine === sent.current) setError("연결할 수 없습니다. 잠시 후 다시 불러옵니다.");
    } finally {
      clearTimeout(limit);
      if (mine === sent.current) inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), refreshSec * 1000);
    return () => clearInterval(timer);
  }, [load, refreshSec]);

  // 소리를 낼 준비. 아이폰은 사람이 화면을 누를 때 소리 장치를 깨워 두어야 나중에 소리가 난다.
  useEffect(() => {
    const unlock = () => void wakeAudio();
    // 아이폰은 손가락을 뗄 때(touchend)나 누름(click)이어야 소리 장치를 깨울 수 있다. 누르기 시작(pointerdown)만으로는 안 깨어난다.
    const events = ["pointerdown", "touchend", "click", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, unlock));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  async function refresh() {
    setManual(true);
    await load(true);
    setManual(false);
  }

  async function act(id: string, action: "accept" | "done") {
    setBusy(id);
    setActError(null);
    // 받기·마침도 답이 오지 않으면 끊는다. 끊지 않으면 그 호출의 단추가 몇 분씩 눌리지 않고, 실패했다는 말도 없다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/staff/calls/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        signal: ctrl.signal,
      });
      if (!res.ok) setActError((await res.json().catch(() => ({}))).error ?? "처리하지 못했습니다");
    } catch {
      setActError("연결할 수 없습니다. 잠시 후 다시 해 주세요.");
    } finally {
      clearTimeout(limit);
    }
    // 새 목록이 들어온 뒤에 단추를 다시 살린다. 먼저 살리면 옛 상태(「기다리는 중」)의 단추를 한 번 더 눌러
    // 방금 한 일이 "이미 받은 호출"이라는 오류로 보인다.
    await load(true);
    setBusy(null);
    keepFocus();
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
        <h1 ref={headRef} tabIndex={-1}>
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
        <button className="seg-refresh" onClick={() => void refresh()} aria-label="새로 고침" aria-busy={manual}>
          <RefreshCw size={18} aria-hidden="true" className={manual ? "spin" : ""} />
        </button>
      </div>

      {/* 화면 읽기 프로그램에는 기다리는 호출 수가 바뀔 때만 알린다. 목록 전체를 알리면 "N분 전"이 바뀔 때마다 다시 읽는다. */}
      <p className="sr-only" aria-live="polite">
        {data ? `기다리는 호출 ${shownOpen.filter((c) => c.state === "waiting").length}건` : ""}
      </p>
      {actError && <ErrorNote>{actError}</ErrorNote>}
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
            <button
              className="btn"
              onClick={() => {
                setScope("all");
                keepFocus();
              }}
            >
              다른 구역의 호출 {elsewhere}건 보기
            </button>
          )}
        </div>
      )}

      <ul className="calls">
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
                {c.pass.party !== null && c.pass.party > 1 && <p className="small">함께 가는 분 포함 모두 {c.pass.party}명</p>}
                {c.pass.note && <p className="call-note">여객의 말: {c.pass.note}</p>}
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
                  {/* 아무도 받지 않아 시간이 지나 닫힌 호출은 놓친 호출이다. "여객이 거둠"과 나눠 보여 준다. */}
                  {c.state === "done"
                    ? `도움 마침${c.acceptedBy ? ` · ${c.acceptedBy}` : ""}`
                    : c.endReason === "expired"
                      ? "응답 없이 닫힘"
                      : "여객이 거둠"}{" "}
                  · {c.waitedMin}분
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// 화면 하나에 소리 장치 하나를 두고 계속 쓴다.
let audio: AudioContext | null = null;

/**
 * 소리 장치를 만들고 깨운다. 브라우저는 사람이 화면을 누를 때 깨운 소리 장치로만 소리를 낸다.
 * 특히 아이폰은 누름 밖에서 만든 소리 장치를 멈춘 채로 두므로, 누를 때 미리 만들어 깨워 둔다.
 */
async function wakeAudio(): Promise<AudioContext | null> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audio ??= new Ctx();
    if (audio.state === "suspended") await audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/**
 * 새 호출을 진동과 짧은 소리로 알린다. 소리는 화면을 한 번이라도 누른 뒤에만 난다(브라우저의 규칙).
 * 아이폰은 진동을 지원하지 않아 소리로만 알린다.
 */
function notify() {
  navigator.vibrate?.([200, 100, 200]);
  void wakeAudio().then((ctx) => {
    if (!ctx || ctx.state !== "running") return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // 소리를 낼 수 없는 기기에서는 화면과 진동으로만 알린다.
    }
  });
}
