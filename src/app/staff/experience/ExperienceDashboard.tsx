"use client";
import { StudyComparison } from "./StudyComparison";
import { useEffect, useState } from "react";
import styles from "@/app/components/support-journey.module.css";
interface Summary {
  visits: { total: number; robotResolved: number; handovers: number; missed: number; cancelled: number };
  events: { kind: string; n: number; value: number }[];
  response: { medianAcceptSec: number | null; medianArrivalSec: number | null };
  survey: { good: number; fair: number; poor: number };
  usage: { calls: number; registrations: number };
}
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const time = (n: number | null | undefined) => (n == null ? "—" : n < 60 ? `${n}초` : `${Math.round(n / 60)}분`);

/** 최종보고서 「표 3. 시범 운영 평가 항목과 목표」를 그대로 쓴다. */
function goals(s: Summary) {
  const answers = s.survey.good + s.survey.fair + s.survey.poor;
  // 만족도 세 칸(도움이 됐어요·보통·도움이 안 됐어요)을 5점 만점 5·3·1점으로 바꿔 평균을 낸다.
  const score = answers ? (s.survey.good * 5 + s.survey.fair * 3 + s.survey.poor) / answers : null;
  const share = pct(s.visits.robotResolved, s.visits.robotResolved + s.visits.handovers);
  const per100 = s.usage.registrations ? (s.usage.calls / s.usage.registrations) * 100 : null;
  const escort = pct(s.visits.robotResolved, s.visits.total - s.visits.cancelled);
  return [
    { label: "이용자 만족도", value: score == null ? "—" : `${score.toFixed(1)}점`, sub: `응답 ${answers}명`, goal: "응답 100명 이상 · 평균 3.5점 이상", met: score == null ? null : answers >= 100 && score >= 3.5 },
    { label: "로봇 업무 분담률", value: share == null ? "—" : `${share}%`, sub: `로봇 ${s.visits.robotResolved}건 · 직원 ${s.visits.handovers}건`, goal: "30% 이상", met: share == null ? null : share >= 30 },
    { label: "단순 안내 직원 호출", value: per100 == null ? "—" : `${per100.toFixed(1)}건`, sub: "이용객 100명당", goal: "운영 전보다 15% 이상 감소", met: null },
    { label: "목적지 동행 완료율", value: escort == null ? "—" : `${escort}%`, sub: `완료 ${s.visits.robotResolved}건`, goal: "90% 이상", met: escort == null ? null : escort >= 90 },
  ];
}

export function ExperienceDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await fetch("/api/staff/visits?summary=1", { cache: "no-store", signal: ctrl.signal });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setSummary(b);
    })().catch((e) => { if (!ctrl.signal.aborted) setError(String(e)); });
    return () => ctrl.abort();
  }, []);
  const n = (kind: string) => summary?.events.find((e) => e.kind === kind)?.n ?? 0;
  return (
    <>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {summary ? (
        <>
          <section className="staff-exp-group" aria-labelledby="exp-goals">
            <h2 id="exp-goals">시범 운영 평가 항목</h2>
            <div className="staff-exp-goals">
              {goals(summary).map((g) => (
                <div key={g.label} className="staff-exp-goal" data-met={g.met == null ? undefined : String(g.met)}>
                  <span>{g.label}</span>
                  <strong>{g.value}</strong>
                  <span>{g.sub}</span>
                  <span className="staff-exp-target">목표 {g.goal}{g.met != null && <b>{g.met ? "달성" : "미달"}</b>}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="staff-exp-group" aria-labelledby="exp-stamp">
            <h2 id="exp-stamp">전자 스탬프</h2>
            <div className={`${styles.stats} staff-exp-stats is-four`}>
              {([
                ["참여", `${n("stamp_start")}건`],
                ["완주", `${n("stamp_finish")}건`],
                // 시작 기록은 기기마다 한 번, 완주는 코스마다 남아 완주가 더 많을 수 있다. 비율이 100%를 넘지 않게 큰 쪽을 기준으로 한다.
                ["완주율", n("stamp_start") || n("stamp_finish") ? `${pct(n("stamp_finish"), Math.max(n("stamp_start"), n("stamp_finish")))}%` : "—"],
                ["사진 공유·저장", `${n("stamp_share")}건`],
              ] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          </section>
          <section className="staff-exp-group" aria-labelledby="exp-visits">
            <h2 id="exp-visits">로봇 예약·직원 인계</h2>
            <div className={`${styles.stats} staff-exp-stats`}>
              {([
                ["예약 접수", `${summary.visits.total}건`],
                ["직원 인계", `${summary.visits.handovers}건`],
                ["미도착", `${summary.visits.missed}건`],
                ["지연 안내", `${n("delay")}건`],
                ["직원 수락 중앙값", time(summary.response.medianAcceptSec)],
                ["이동·도착 중앙값", time(summary.response.medianArrivalSec)],
              ] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          </section>
        </>
      ) : (
        <p role="status">집계를 확인하고 있습니다.</p>
      )}
      <StudyComparison />
    </>
  );
}
