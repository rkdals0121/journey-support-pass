"use client";

import { ChevronLeft, CircleCheck, Clock, HandHelping, History, MapPin, MessageSquareText, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseDto, ServiceDto } from "@/lib/api/dto";
import { ErrorNote } from "../../../components/Alert";
import { PollBar, type PollInfo } from "../../../components/PollBar";

interface CaseData {
  case: CaseDto;
  encounter: { id: string; started: boolean };
  trail: ServiceDto[];
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
        if (res.status === 409) {
          router.replace("/staff/zone");
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
        if (!cancelled) setError("연결할 수 없습니다. 여객에게 구두로 확인해 주세요.");
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
      setError("연결할 수 없습니다. 여객에게 구두로 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const top = (
    <div className="topbar">
      <Link className="icon-btn" href="/staff" aria-label="여객 목록으로">
        <ChevronLeft size={26} aria-hidden="true" />
      </Link>
      <span className="topbar-title">여객 카드</span>
    </div>
  );

  if (error && !data) {
    return (
      <div>
        {top}
        <ErrorNote>{error}</ErrorNote>
        <Link className="btn" href="/staff">
          여객 목록으로
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        {top}
        <p className="muted">불러오는 중…</p>
      </div>
    );
  }

  const c = data.case;
  const f = c.facilities;
  const hasFacilities = f && (f.elevators.length > 0 || f.restrooms.length > 0 || f.waitingPoints.length > 0);
  const showStatus = c.status && !c.cancelled && c.status !== "탑승마감";

  return (
    <div>
      {top}
      <article className="bp">
        <section className="bp-comm">
          <h2>
            <MessageSquareText size={16} aria-hidden="true" />
            소통 방식
          </h2>
          {c.comm.length > 0 ? (
            <ul>
              {c.comm.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="none">별도 요청 없음</p>
          )}
        </section>

        <section className="bp-who">
          <h2 className="sr-only">이름과 교통약자 구분</h2>
          <p className="bp-name">{c.name}</p>
          <div className="chips">
            {c.categories.map((t) => (
              <span key={t} className="chip chip-mint">
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="bp-block">
          <h2>
            <HandHelping size={16} aria-hidden="true" />
            필요한 도움
          </h2>
          {c.needs.length > 0 ? <Lines items={c.needs} /> : <p className="muted">별도 요청 없음</p>}
        </section>

        <section className="bp-block">
          <h2>
            <Users size={16} aria-hidden="true" />
            동반
          </h2>
          {c.accompany.length > 0 ? <Lines items={c.accompany} /> : <p className="muted">동반자 없음</p>}
        </section>

        {data.trail.length > 0 && (
          <section className="bp-block">
            <h2>
              <History size={16} aria-hidden="true" />
              앞선 응대
            </h2>
            <ul className="trail">
              {data.trail.map((t, i) => (
                <li key={i}>
                  <strong>{t.zone}</strong>
                  <span>{t.endTime ? `${t.startTime} ~ ${t.endTime} 완료` : `${t.startTime}부터 응대 중`}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">앞에서 이미 안내한 내용은 여객에게 다시 묻지 않아도 됩니다.</p>
          </section>
        )}

        <div className="bp-tear" aria-hidden="true" />

        <section aria-label="항공편">
          <div className="bp-flight">
            <p className={`plate ${c.gate === null ? "unknown" : ""} ${c.urgent ? "urgent" : ""}`} style={{ margin: 0 }}>
              <small>탑승구</small>
              {c.gate ?? "미정"}
            </p>
            <div className="bp-flight-main">
              <span className="bp-flight-no">{c.flightNo}</span>
              <span className="bp-dest">{c.destName}</span>
              <span className="bp-dep">
                출발{" "}
                {c.estTime ? (
                  <>
                    <s>{c.schedTime}</s> <strong>{c.estTime}</strong> 지연
                  </>
                ) : (
                  <strong>{c.schedTime ?? "정보 없음"}</strong>
                )}
              </span>
              {c.operatingNo && <span className="small muted">운항 편명 {c.operatingNo}</span>}
            </div>
          </div>
          <div className="bp-status">
            <span className={`countdown ${c.urgent ? "urgent" : ""}`}>
              <Clock size={17} aria-hidden="true" />
              {c.closeLabel}
            </span>
            {showStatus && <span className="chip chip-sun">{c.status}</span>}
            {c.prevGate !== null && <span className="chip chip-red">탑승구 변경 · 이전 {c.prevGate}</span>}
          </div>
          <div className="bp-foot">
            <PollBar poll={data.poll} light />
          </div>
        </section>

        <section className="bp-block">
          <h2>
            <MapPin size={16} aria-hidden="true" />
            가까운 교통약자 시설
          </h2>
          {hasFacilities ? (
            <>
              <Facility title="엘리베이터" items={f.elevators} />
              <Facility title="장애인 화장실" items={f.restrooms} />
              <Facility title="대기 지점" items={f.waitingPoints} />
            </>
          ) : (
            <p className="muted small">
              {c.zoneLabel ? "이 구역의 시설 정보가 아직 없습니다." : "탑승구가 정해지면 표시됩니다."}
            </p>
          )}
        </section>
      </article>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="cta-bar above-nav">
        <div className="cta-inner">
          {phase === "ready" && (
            <button className="btn btn-primary" onClick={() => act("start")} disabled={busy}>
              응대 시작
            </button>
          )}
          {phase === "started" && (
            <button className="btn btn-sun" onClick={() => act("end")} disabled={busy}>
              <CircleCheck size={20} aria-hidden="true" />
              응대 완료
            </button>
          )}
          {phase === "done" && (
            <>
              <p className="done-flash" role="status">
                <CircleCheck size={20} aria-hidden="true" />
                응대를 기록했습니다
              </p>
              <Link className="btn btn-back" href="/staff">
                목록
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
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
