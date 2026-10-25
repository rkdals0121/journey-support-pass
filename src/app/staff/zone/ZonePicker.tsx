"use client";

import { Check, ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote } from "../../components/Alert";

interface ZoneGroup {
  terminal: string;
  zones: { id: string; label: string }[];
}

// 요청 한 번을 기다리는 가장 긴 시간. 약한 와이파이에서 답이 오지 않는 요청을 끝없이 붙잡으면
// 불러오는 중이나 고르는 중에 멈춰, 다시 불러오기도 다른 구역 고르기도 못 한다.
const REQUEST_TIMEOUT_MS = 10_000;

// "탑승동 끝단 (101~106, 127~132)" 을 이름과 탑승구 범위로 나눈다.
function split(label: string): { name: string; gates: string } {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(label);
  return m ? { name: m[1], gates: m[2] } : { name: label, gates: "" };
}

function Picker({ first }: { first: boolean }) {
  const params = useSearchParams();
  const [groups, setGroups] = useState<ZoneGroup[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retried = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // 구역 목록을 받는다. 못 받으면 「다시 불러오기」로 다시 부른다.
  // 처음 고르는 화면에는 돌아갈 곳이 없어, 다시 부를 길이 없으면 직원이 화면을 직접 새로 고쳐야 한다.
  const load = useCallback(async () => {
    setError(null);
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/staff/zone", { cache: "no-store", signal: ctrl.signal });
      if (res.status === 401) return window.location.replace("/staff/login");
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "구역을 불러오지 못했습니다");
      setGroups(data.groups);
      setCurrent(data.current);
    } catch {
      // 끊은 요청도 여기로 온다.
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      clearTimeout(limit);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 「다시 불러오기」는 다시 부르는 동안에도 그대로 두고 누르지 못하게만 한다. 누른 단추가 사라지면
  // 키보드와 화면 읽기 프로그램의 초점이 화면 밖으로 빠진다. disabled 를 걸어도 초점이 빠지므로 aria-disabled 로 막는다.
  // 또 못 받으면 초점이 단추에 남아 있어 바로 다시 누를 수 있다.
  async function retry() {
    if (retrying) return;
    retried.current = true;
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  // 다시 불러 목록이 오면 단추가 사라지므로 제목에 초점을 둔다. 화면 읽기 프로그램이 화면이 준비됐음을 바로 읽는다.
  useEffect(() => {
    if (!groups || !retried.current) return;
    retried.current = false;
    heading.current?.focus();
  }, [groups]);

  async function pick(zoneId: string) {
    setBusy(zoneId);
    setError(null);
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/staff/zone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId }),
        signal: ctrl.signal,
      });
      // 로그인이 풀렸으면 "로그인이 필요합니다"만 띄우지 않고 로그인 화면으로 보낸다. 이 화면에서는 갈 길이 없다.
      if (res.status === 401) return window.location.replace("/staff/login");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "구역을 바꾸지 못했습니다");
        return;
      }
      const next = params.get("next");
      // 쿠키가 바뀌었으므로 화면을 통째로 다시 받는다. 앞서 받아 둔 화면이 남지 않게 한다. 내부 경로만 받는다.
      window.location.replace(next && /^\/staff\//.test(next) ? next : "/staff/requests");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      clearTimeout(limit);
      setBusy(null);
    }
  }

  // 공통 코드로 들어왔지만 데스크 코드가 필요했던 경우처럼, 처음 고르는 화면에서 다른 코드로 다시 들어간다.
  // /staff 는 구역을 고를 때까지 이 화면으로 돌려보내므로, 여기서 나가는 길을 둔다.
  async function logout() {
    // 나가는 동안에는 구역을 고르지 못하게 막는다(구역 단추는 busy 가 있으면 잠긴다). 구역을 바꾸는 답이
    // 로그아웃보다 늦게 오면 그 답의 쿠키가 다시 로그인시켜, 어느 화면으로 갈지 먼저 온 답에 따라 달라진다.
    setBusy("logout");
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      await fetch("/api/staff/logout", { method: "POST", signal: ctrl.signal });
    } catch {
      // 못 지워도 로그인 화면에서 다른 코드를 넣으면 그 코드로 바뀐다.
    } finally {
      clearTimeout(limit);
    }
    window.location.replace("/staff/login");
  }

  return (
    <div>
      {!first && (
        <div className="topbar">
          <Link className="icon-btn" href="/staff/requests" aria-label="통합 요청으로">
            <ChevronLeft size={26} aria-hidden="true" />
          </Link>
          <span className="topbar-title">근무 구역 바꾸기</span>
        </div>
      )}
      <h1 ref={heading} tabIndex={-1}>
        {first ? "오늘 근무하는 구역을 골라 주세요" : "어느 구역으로 옮기나요?"}
      </h1>
      <p className="muted">이 구역의 키오스크에서 온 호출이 먼저 보입니다. 근무 중에 언제든 바꿀 수 있습니다.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!groups && (error || retrying) && (
        <button className="btn" onClick={retry} aria-disabled={retrying}>
          {retrying ? "불러오는 중…" : "다시 불러오기"}
        </button>
      )}
      {!groups && !error && (
        <div aria-busy="true">
          <p className="sr-only">불러오는 중…</p>
          <div className="skel skel-row" style={{ height: 64, marginTop: 28 }} />
          <div className="skel skel-row" style={{ height: 64 }} />
          <div className="skel skel-row" style={{ height: 64 }} />
        </div>
      )}
      {groups?.map((g) => (
        <section key={g.terminal}>
          <h2 className="group-title">
            <MapPin size={18} aria-hidden="true" />
            {g.terminal}
          </h2>
          {g.zones.map((z) => {
            const { name, gates } = split(z.label);
            const on = z.id === current;
            return (
              <button
                key={z.id}
                className={`zone-opt ${on ? "on" : ""}`}
                onClick={() => pick(z.id)}
                disabled={busy !== null}
                aria-pressed={on}
              >
                <span>
                  {name.replace(g.terminal, "").trim() || name}
                  {gates && <small>탑승구 {gates}</small>}
                </span>
                {on && <Check size={20} aria-hidden="true" />}
              </button>
            );
          })}
        </section>
      ))}
      {first && (
        <button className="btn btn-ghost" onClick={logout} disabled={busy !== null}>
          {busy === "logout" ? "나가는 중…" : "다른 코드로 로그인"}
        </button>
      )}
    </div>
  );
}

export function ZonePicker({ first }: { first: boolean }) {
  return (
    <Suspense>
      <Picker first={first} />
    </Suspense>
  );
}
