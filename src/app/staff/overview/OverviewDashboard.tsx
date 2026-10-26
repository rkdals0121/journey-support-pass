"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BUSINESS_GROUPS } from "@/lib/operating-profile";
import { RESOLUTION_KINDS, RESOLUTION_LABEL } from "@/lib/request-resolution";
import {
  overviewQueueLink,
  type BusinessOverview,
} from "@/lib/business-overview-model";
export function overviewDuration(sec: number | null) {
  if (sec === null) return "자료 없음";
  if (sec < 60) return `${sec}초`;
  return sec < 3600
    ? `${Math.floor(sec / 60)}분 ${sec % 60}초`
    : `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`;
}
export function OverviewDashboard({ initial }: { initial: BusinessOverview }) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [group, setGroup] = useState("all");
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true,
      running = false;
    let controller: AbortController | null = null;
    async function load() {
      if (running || document.hidden) return;
      running = true;
      setBusy(true);
      controller = new AbortController();
      try {
        const response = await fetch("/api/staff/overview", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (response.status === 401) {
          window.location.assign("/staff/login");
          return;
        }
        if (response.status === 409) {
          window.location.assign("/staff/zone");
          return;
        }
        if (response.status === 403) {
          window.location.assign("/staff/requests");
          return;
        }
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error ?? "현황을 불러오지 못했습니다");
        if (live) {
          setValue(data);
          setError("");
        }
      } catch (e) {
        if (live && !controller?.signal.aborted)
          setError(
            e instanceof Error ? e.message : "현황을 불러오지 못했습니다",
          );
      } finally {
        running = false;
        if (live) setBusy(false);
      }
    }
    refresh.current = () => void load();
    const timer = setInterval(() => void load(), 30000),
      focus = () => void load();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      live = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      refresh.current = () => {};
    };
  }, []);
  const s = value.totals,
    rows = value.businesses
      .filter((b) => group === "all" || b.group === group)
      .sort(
        (a, b) =>
          b.attention - a.attention ||
          b.active - a.active ||
          b.todayIntake - a.todayIntake,
      );
  const maxActive = Math.max(1, ...value.businesses.map((b) => b.active));
  const countLink = (
    id: string | undefined,
    scope: string,
    n: number,
    label: string,
  ) =>
    n > 0 ? (
      <Link
        href={overviewQueueLink(id, scope)}
        aria-label={`${label} ${n}건 요청 보기`}
      >
        {n}건<span aria-hidden="true"> ↗</span>
      </Link>
    ) : (
      <span>0건</span>
    );
  return (
    <div className="overview-dashboard">
      <div className="overview-refresh">
        <p>
          <time dateTime={value.asOf}>
            {new Date(value.asOf).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </time>{" "}
          기준 · 30초마다 갱신
        </p>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => refresh.current()}
        >
          {busy ? "새로 확인 중…" : "지금 새로고침"}
        </button>
      </div>
      {error && (
        <p role="alert" className="dx-notice">
          갱신하지 못했습니다. 마지막으로 받은 현황과 위 기준 시각을 표시합니다.{" "}
          {error}
        </p>
      )}
      <section aria-labelledby="overview-live-title">
        <h2 id="overview-live-title">지금 처리할 요청</h2>
        <p className="fine">
          오늘 이전 접수도 포함합니다. 지연 표시는 미배정 10분·진행 상태 30분
          기준의 시연 점검 대상이며 확정 지원 시간을 뜻하지 않습니다.
        </p>
        <div className="overview-kpis">
          <Metric
            label="진행 중"
            value={s.active}
            href={overviewQueueLink()}
            hint="접수·배정·이동·지원 중"
          />
          <Metric
            label="미배정"
            value={s.waiting}
            href={overviewQueueLink(undefined, "waiting")}
            hint="담당 배정 전"
          />
          <Metric
            label="확인 지연"
            value={s.attention}
            href={overviewQueueLink(undefined, "attention")}
            hint="운영자 점검 대상"
            attention
          />
          <div className="overview-kpi">
            <span>가장 오래 기다린 미배정 요청</span>
            <strong>{overviewDuration(s.oldestWaitingSec)}</strong>
            <small>미배정 요청이 없으면 자료 없음</small>
          </div>
        </div>
      </section>
      <section
        className="overview-workload"
        aria-labelledby="overview-workload-title"
      >
        <div className="overview-section-head">
          <div>
            <h2 id="overview-workload-title">담당 업무별 요청</h2>
            <p className="fine">
              현재 앱의 업무 분류 기준입니다. 부서의 실제 근무 인원·처리 용량을
              나타내지 않습니다.
            </p>
          </div>
          <div>
            <label htmlFor="overview-group">표·카드 표시 분야</label>
            <select
              id="overview-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="all">모든 분야</option>
              {BUSINESS_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
              <option value="unclassified">미분류·이전 요청</option>
            </select>
          </div>
        </div>
        <p className="overview-count" role="status">
          표시 업무 {rows.length}개 · 상단 전체 수치는 분야 선택과 관계없이 전체
          요청 기준입니다.
        </p>
        <table className="overview-table">
          <caption className="sr-only">
            담당 업무별 오늘 접수와 현재 진행·미배정·지연 요청. 지연이 큰
            업무부터 표시합니다.
          </caption>
          <thead>
            <tr>
              <th scope="col">담당 업무</th>
              <th scope="col">오늘 접수</th>
              <th scope="col">지금 진행</th>
              <th scope="col">미배정</th>
              <th scope="col">확인 지연</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.businessId} data-overview-business={b.businessId}>
                <th scope="row">
                  {b.label}
                  <div className="overview-load-bar" aria-hidden="true">
                    <span
                      style={{ width: `${(b.active / maxActive) * 100}%` }}
                    />
                  </div>
                </th>
                <td>{b.todayIntake}건</td>
                <td>
                  {countLink(
                    b.businessId,
                    "active",
                    b.active,
                    b.label + " 진행 중",
                  )}
                </td>
                <td>
                  {countLink(
                    b.businessId,
                    "waiting",
                    b.waiting,
                    b.label + " 미배정",
                  )}
                </td>
                <td className={b.attention ? "overview-attention" : ""}>
                  {countLink(
                    b.businessId,
                    "attention",
                    b.attention,
                    b.label + " 확인 지연",
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="overview-mobile-loads">
          {rows.map((b) => (
            <article key={b.businessId} data-overview-mobile={b.businessId}>
              <h3>{b.label}</h3>
              <dl>
                <div>
                  <dt>오늘 접수</dt>
                  <dd>{b.todayIntake}건</dd>
                </div>
                <div>
                  <dt>지금 진행</dt>
                  <dd>
                    {countLink(
                      b.businessId,
                      "active",
                      b.active,
                      b.label + " 진행 중",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>미배정</dt>
                  <dd>
                    {countLink(
                      b.businessId,
                      "waiting",
                      b.waiting,
                      b.label + " 미배정",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>확인 지연</dt>
                  <dd>
                    {countLink(
                      b.businessId,
                      "attention",
                      b.attention,
                      b.label + " 확인 지연",
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <p className="fine">
          오늘 접수는 한국시간 00시부터 현재까지입니다. 업무 미기록·이전
          요청·상세 보관 종료로 분류가 지워진 기록은 미분류에 포함합니다. 진행
          수치의 막대는 업무 간 상대 건수이며 가용률이 아닙니다.
        </p>
      </section>
      <div className="overview-bottom-grid">
        <section
          className="overview-panel"
          aria-labelledby="overview-today-title"
        >
          <h2 id="overview-today-title">오늘 접수·처리</h2>
          <dl className="overview-today">
            <div>
              <dt>접수</dt>
              <dd>{s.todayIntake}건</dd>
            </div>
            <div>
              <dt>사전등록 정보 연결 접수</dt>
              <dd>{s.todayLinked}건</dd>
            </div>
            <div>
              <dt>완료 처리</dt>
              <dd>{s.todayCompleted}건</dd>
            </div>
            <div>
              <dt>취소·지원 불가·시간 초과 종료</dt>
              <dd>{s.todayOtherClosed}건</dd>
            </div>
            <div>
              <dt>배정까지 중간시간</dt>
              <dd>{overviewDuration(s.medianAcceptSec)}</dd>
            </div>
            <div>
              <dt>완료 처리까지 중간시간</dt>
              <dd>{overviewDuration(s.medianCompletionSec)}</dd>
            </div>
          </dl>
          <p className="fine">
            사전등록 연결은 접수의 일부입니다. 완료·기타 종료는 오늘 종료된 요청
            기준으로 전날 접수도 포함합니다. 시간은 각각 오늘 배정·완료 처리된
            요청 기준이며 문제 해결 시간과는 구분됩니다.
          </p>
        </section>
        <section
          className="overview-panel"
          aria-labelledby="overview-results-title"
        >
          <h2 id="overview-results-title">오늘 완료 결과</h2>
          <dl className="overview-results">
            {RESOLUTION_KINDS.map((k) => (
              <div key={k}>
                <dt>{RESOLUTION_LABEL[k]}</dt>
                <dd data-result-kind={k}>{value.results[k]}건</dd>
              </div>
            ))}
            <div>
              <dt>결과 미기록·상세 보관 종료</dt>
              <dd data-result-kind="unrecorded">
                {value.results.unrecorded}건
              </dd>
            </div>
          </dl>
          <p className="fine">
            오늘 완료 처리된 요청 {s.todayCompleted}건의 결과 구분입니다. 창구
            안내는 부서의 접수 완료가 아니며, 인계 확인은 문의한 문제의 해결
            완료가 아닙니다. 과거 기록의 결과를 추정하지 않습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  href,
  hint,
  attention = false,
}: {
  label: string;
  value: number;
  href: string;
  hint: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "overview-kpi" + (attention && value > 0 ? " needs-attention" : "")
      }
    >
      <span>{label}</span>
      <strong>
        {value}
        <small>건</small>
      </strong>
      <small>{hint} · 요청 보기 ↗</small>
    </Link>
  );
}
