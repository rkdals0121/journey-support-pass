"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseDto } from "@/lib/api/dto";
import { PollBar, type PollInfo } from "../../../components/PollBar";

interface CaseData {
  case: CaseDto;
  encounter: { id: string; started: boolean };
  poll: PollInfo;
}

type Phase = "ready" | "started" | "done";

// 응대 순서대로 위에서부터 놓는다(프로포절 2단계 3). 소통 방식이 맨 위다.
export function CaseCard({ id, timeoutSec }: { id: string; timeoutSec: number }) {
  const router = useRouter();
  const [data, setData] = useState<CaseData | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 조작 없이 두면 목록으로 돌아가 여객 정보가 화면에 남지 않게 한다.
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => router.replace("/staff"), timeoutSec * 1000);
  }, [router, timeoutSec]);

  useEffect(() => {
    resetIdle();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, resetIdle));
    };
  }, [resetIdle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/staff/case/${id}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/staff/login");
          return;
        }
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "사용할 수 없는 패스입니다");
          return;
        }
        setData(body);
        setPhase(body.encounter.started ? "started" : "ready");
      } catch {
        if (!cancelled) setError("연결할 수 없습니다. 구두로 확인해 주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function act(action: "start" | "end") {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/encounters/${data.encounter.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError("기록하지 못했습니다. 다시 눌러 주세요.");
        return;
      }
      setPhase(action === "start" ? "started" : "done");
    } catch {
      setError("연결할 수 없습니다. 구두로 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div>
        <p className="error" role="alert">
          {error}
        </p>
        <Link className="btn" href="/staff">
          목록으로
        </Link>
      </div>
    );
  }
  if (!data) return <p className="muted">불러오는 중…</p>;

  const c = data.case;
  const f = c.facilities;
  const hasFacilities = f && (f.elevators.length > 0 || f.restrooms.length > 0 || f.waitingPoints.length > 0);

  return (
    <article className="card">
      <section className="card-block card-comm">
        <h2>소통 방식</h2>
        {c.comm.length > 0 ? <Lines items={c.comm} /> : <p>별도 요청 없음</p>}
      </section>

      <section className="card-block">
        <h2>교통약자 구분</h2>
        <Lines items={c.categories} />
      </section>

      <section className="card-block">
        <h2>이름</h2>
        <p className="card-name">{c.name}</p>
      </section>

      <section className="card-block">
        <h2>필요한 도움</h2>
        {c.needs.length > 0 ? <Lines items={c.needs} /> : <p>별도 요청 없음</p>}
      </section>

      <section className="card-block">
        <h2>동반</h2>
        {c.accompany.length > 0 ? <Lines items={c.accompany} /> : <p>동반자 없음</p>}
      </section>

      <section className={`card-block card-flight ${c.urgent ? "card-urgent" : ""}`}>
        <h2>항공편</h2>
        <p>
          <strong>{c.flightNo}</strong> · {c.destName}
          {c.operatingNo && <span className="muted"> (운항 편명 {c.operatingNo})</span>}
        </p>
        <p>
          출발{" "}
          {c.estTime ? (
            <>
              <s className="muted">{c.schedTime}</s> <strong>{c.estTime}</strong> (지연)
            </>
          ) : (
            <strong>{c.schedTime ?? "정보 없음"}</strong>
          )}
        </p>
        <p className="card-gate">
          <span className="card-gate-label">탑승구</span>
          {c.gate ?? "미정"}
        </p>
        {c.prevGate !== null && <p className="card-gate-changed">변경됨 · 이전 {c.prevGate}</p>}
        <p className={c.urgent ? "case-close-urgent" : ""}>{c.closeLabel}</p>
        {c.status && !c.cancelled && c.status !== "탑승마감" && (
          <p>
            현재 상태 <strong>{c.status}</strong>
          </p>
        )}
        <PollBar poll={data.poll} />
      </section>

      <section className="card-block">
        <h2>가까운 교통약자 시설</h2>
        {hasFacilities ? (
          <>
            <Facility title="엘리베이터" items={f.elevators} />
            <Facility title="장애인 화장실" items={f.restrooms} />
            <Facility title="대기 지점" items={f.waitingPoints} />
          </>
        ) : (
          <p className="muted">{c.zoneLabel ? "이 구역의 시설 정보가 아직 없습니다." : "탑승구가 정해지면 표시됩니다."}</p>
        )}
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="bottom-bar">
        {phase === "ready" && (
          <button className="btn btn-primary" onClick={() => act("start")} disabled={busy}>
            응대 시작
          </button>
        )}
        {phase === "started" && (
          <button className="btn btn-danger" onClick={() => act("end")} disabled={busy}>
            응대 완료
          </button>
        )}
        {phase === "done" && (
          <p className="notice" role="status">
            응대를 기록했습니다.
          </p>
        )}
        <Link className="btn" href="/staff">
          목록으로
        </Link>
      </div>
    </article>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="lines">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Facility({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p>
      <strong>{title}</strong>
      <br />
      {items.join(" / ")}
    </p>
  );
}
