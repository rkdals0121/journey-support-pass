"use client";

import { Check, ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorNote } from "../../components/Alert";

interface ZoneGroup {
  terminal: string;
  zones: { id: string; label: string }[];
}

// "탑승동 끝단 (101~106, 127~132)" 을 이름과 탑승구 범위로 나눈다.
function split(label: string): { name: string; gates: string } {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(label);
  return m ? { name: m[1], gates: m[2] } : { name: label, gates: "" };
}

function Picker({ first }: { first: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [groups, setGroups] = useState<ZoneGroup[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/staff/zone", { cache: "no-store" });
        if (res.status === 401) return router.replace("/staff/login");
        const data = await res.json();
        if (!res.ok) return setError(data.error ?? "구역을 불러오지 못했습니다");
        setGroups(data.groups);
        setCurrent(data.current);
      } catch {
        setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
    })();
  }, [router]);

  async function pick(zoneId: string) {
    setBusy(zoneId);
    setError(null);
    try {
      const res = await fetch("/api/staff/zone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "구역을 바꾸지 못했습니다");
        return;
      }
      // 패스 QR 을 먼저 찍고 들어온 경우 그 패스로 돌아간다. 내부 경로만 받는다.
      const next = params.get("next");
      // 쿠키가 바뀌었으므로 화면을 통째로 다시 받는다. 앞서 받아 둔 화면이 남지 않게 한다.
      window.location.replace(next && /^\/(p|staff)\//.test(next) ? next : "/staff");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {!first && (
        <div className="topbar">
          <Link className="icon-btn" href="/staff" aria-label="여객 목록으로">
            <ChevronLeft size={26} aria-hidden="true" />
          </Link>
          <span className="topbar-title">근무 구역 바꾸기</span>
        </div>
      )}
      <h1>{first ? "오늘 근무하는 구역을 골라 주세요" : "어느 구역으로 옮기나요?"}</h1>
      <p className="muted">탑승구가 이 구역에 속한 여객이 목록에 먼저 보입니다. 근무 중에 언제든 바꿀 수 있습니다.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
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
