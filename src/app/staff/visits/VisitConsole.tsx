"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import {
  SERVICE_HUBS,
  VISIT_SERVICES,
  VISIT_STATES,
  hubOf,
  type HubRule,
  type VisitView,
} from "@/lib/service-hubs";
import { STATE_LABEL, type RequestState } from "@/lib/service-request-model";
import styles from "@/app/components/support-journey.module.css";
interface Crew {
  id: string;
  label: string;
  zoneId: string;
  state: string;
  mine: boolean;
}
interface Work {
  id: string;
  visitId: string;
  state: RequestState;
  version: number;
  assignedCrew: string | null;
}
const taskLabel = {
  directions: "로봇 안내",
  wheelchair: "휠체어",
  escort: "이동 동행",
};
export function VisitConsole({ isDesk }: { isDesk: boolean }) {
  const [visits, setVisits] = useState<VisitView[]>([]),
    [crew, setCrew] = useState<Crew[]>([]),
    [work, setWork] = useState<Work[]>([]),
    [rules, setRules] = useState<HubRule[]>([]);
  const [filters, setFilters] = useState({
      state: "open",
      hub: "all",
      day: "",
      search: "",
      offset: 0,
    }),
    [query, setQuery] = useState("");
  const [total, setTotal] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({}),
    [targets, setTargets] = useState<Record<string, string>>({});
  const saving = useRef(false),
    epoch = useRef(0),
    pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const search = new URLSearchParams(window.location.search).get("search");
    if (search) setQuery(search.slice(0, 80));
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => ({ ...f, search: query, offset: 0 })),
      250,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(async () => {
    const seq = ++epoch.current;
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    try {
      const q = new URLSearchParams({
        ...filters,
        offset: String(filters.offset),
        limit: "20",
      });
      const r = await fetch("/api/staff/visits?" + q, {
          cache: "no-store",
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(10000)]),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error || "예약을 확인하지 못했습니다");
      if (seq !== epoch.current) return;
      setVisits(b.visits);
      setCrew(b.crew);
      setWork(b.work ?? []);
      setRules(b.rules);
      setTotal(b.total);
      setHasMore(b.hasMore);
      setLoaded(true);
      setLoadError("");
    } catch (e) {
      if (!ctrl.signal.aborted && seq === epoch.current)
        setLoadError((e as Error).message);
    }
  }, [filters]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!saving.current) void load();
    }, 8000);
    return () => {
      clearInterval(timer);
      pending.current?.abort();
    };
  }, [load]);
  async function mutate(body: Record<string, unknown>, operational = false) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(
          operational ? "/api/staff/requests" : "/api/staff/visits",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          },
        ),
        b = await r.json();
      if (!r.ok) throw Error(b.error || "저장하지 못했습니다");
      await load();
      setNotice("처리 상태를 반영했습니다.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      await load();
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const mine = crew.find((c) => c.mine);
  const filter = (patch: Partial<typeof filters>) =>
    setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  return (
    <>
      <section className="staff-queue-panel" aria-label="예약 조회">
        <div className={styles.queueHeading}>
          <div>
            <h2>
              지금 확인할 지원 <span>{loaded ? total : "—"}</span>
            </h2>
            <p className={styles.demo}>도착·미배정 요청을 먼저 표시합니다.</p>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={16} aria-hidden="true" /> 새로고침
          </button>
        </div>
        <div className={styles.queueTabs} role="group" aria-label="지원 범위">
          {[
            ["open", "진행 중"],
            ["mine", "내 담당"],
            ["all", "전체·완료"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={filters.state === key}
              onClick={() => filter({ state: key })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`${styles.toolbar} staff-visit-toolbar`}>
          <label>
            확인번호·항공편·인상착의
            <span className="staff-search-field">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                id="visits-search"
                value={query}
                maxLength={80}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: AB12CD34, KE123"
              />
            </span>
          </label>
          <details className={styles.filterDetails}>
            <summary>거점·날짜</summary>
            <div className={styles.toolbar}>
              <label>
                거점
                <select
                  id="visits-hub-filter"
                  value={filters.hub}
                  onChange={(e) => filter({ hub: e.target.value })}
                >
                  <option value="all">모든 거점</option>
                  {SERVICE_HUBS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                날짜
                <input
                  type="date"
                  value={filters.day}
                  onChange={(e) => filter({ day: e.target.value })}
                />
              </label>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => filter({ hub: "all", day: "" })}
              >
                조건 초기화
              </button>
            </div>
          </details>
        </div>
      </section>
      {loadError && (
        <p role="alert" className={styles.error}>
          {loadError} 이전에 받은 자료가 남아 있을 수 있습니다.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.status} role="status">
          {notice}
        </p>
      )}
      {!loaded && <p role="status">지원 현황을 확인하고 있습니다.</p>}
      {loaded && !visits.length && (
        <div className="staff-queue-empty" role="status">
          <span>
            <ClipboardCheck size={30} aria-hidden="true" />
          </span>
          <strong>조건에 맞는 지원이 없습니다.</strong>
          <p>예약과 현장 요청이 접수되면 이곳에 표시됩니다.</p>
        </div>
      )}
      <ul className={styles.workList}>
        {visits.map((v) => {
          const owner = crew.find((c) => c.id === v.assignedCrew),
            job = work.find((w) => w.visitId === v.id),
            active = !["done", "cancelled", "missed"].includes(v.state);
          const next = job
            ? (
                {
                  assigned: "travel",
                  en_route: "arrive",
                  arrived: "serve",
                  serving: "complete",
                } as Record<string, string>
              )[job.state]
            : undefined;
          const nextLabel = next
            ? (
                {
                  travel: "현장으로 출발",
                  arrive: "현장 도착",
                  serve: "지원 시작",
                  complete: "지원 완료",
                } as Record<string, string>
              )[next]
            : "";
          return (
            <li key={v.id} data-visit-id={v.id}>
              <div className={styles.workTitle}>
                <div>
                  <span className={styles.badge}>
                    {v.handedOverAt && job
                      ? STATE_LABEL[job.state]
                      : VISIT_STATES[v.state]}
                  </span>
                  <h3>{hubOf(v.hubId)?.label}</h3>
                  <p>
                    {new Date(v.startAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {v.party}명 · {v.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <strong>
                  {v.task === "directions" ? "로봇 안내" : taskLabel[v.task]}
                </strong>
              </div>
              <p className={styles.workMeta}>
                {v.recognition || "인상착의 미입력"}
                {v.flightNo ? " · " + v.flightNo : ""} ·{" "}
                {owner
                  ? "담당 " + owner.label
                  : v.assignedCrew
                    ? "교대 확인 필요"
                    : "담당 미배정"}
              </p>
              {v.notice && <p className={styles.inlineNotice}>{v.notice}</p>}
              <div className={styles.actions}>
                {active && v.state !== "booked" && !v.assignedCrew && (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy || mine?.state === "away"}
                    onClick={() =>
                      void mutate({
                        action: "claim",
                        id: v.id,
                        version: v.version,
                      })
                    }
                  >
                    {v.service === "robot" && !v.handedOverAt
                      ? "직원 안내로 수락"
                      : "이 지원 맡기"}
                  </button>
                )}
                {active && v.assignedCrew === mine?.id && next && job && (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy}
                    onClick={() => {
                      if (
                        next === "complete" &&
                        !confirm(
                          "현장에서 지원을 마쳤나요? 완료 결과를 여객에게 전달합니다.",
                        )
                      )
                        return;
                      void mutate(
                        {
                          action: next,
                          id: job.id,
                          version: job.version,
                          ...(next === "complete"
                            ? {
                                resolution: {
                                  kind: "resolved",
                                  confirmed: true,
                                  message: "현장 지원을 완료했습니다.",
                                },
                              }
                            : {}),
                        },
                        true,
                      );
                    }}
                  >
                    {nextLabel}
                  </button>
                )}
                {v.requestId && v.state !== "booked" && (
                  <Link
                    className={styles.link}
                    href={"/staff/requests?search=" + v.requestId}
                  >
                    처리 기록 보기 →
                  </Link>
                )}
              </div>
              {active && (
                <details className={styles.workAdjust}>
                  <summary>지연 안내·교대·예약 조정</summary>
                  <div className={styles.field}>
                    <label htmlFor={"reason-" + v.id}>
                      여객 안내 또는 인계 사유
                    </label>
                    <input
                      id={"reason-" + v.id}
                      value={reasons[v.id] ?? ""}
                      maxLength={150}
                      onChange={(e) =>
                        setReasons((x) => ({ ...x, [v.id]: e.target.value }))
                      }
                      placeholder="예: 혼잡으로 현장 직원이 먼저 안내합니다."
                    />
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy || !reasons[v.id]?.trim()}
                      onClick={() =>
                        void mutate({
                          action: "delay",
                          id: v.id,
                          version: v.version,
                          reason: reasons[v.id],
                        })
                      }
                    >
                      여객에게 안내 전달
                    </button>
                    {v.state === "responding" && (
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            action: "handover",
                            id: v.id,
                            version: v.version,
                          })
                        }
                      >
                        로봇 응대 중단·직원 연결
                      </button>
                    )}
                  </div>
                  {v.assignedCrew && (
                    <>
                      <div className={styles.field}>
                        <label htmlFor={"target-" + v.id}>
                          인계할 가용 직원
                        </label>
                        <select
                          id={"target-" + v.id}
                          value={targets[v.id] ?? ""}
                          onChange={(e) =>
                            setTargets((x) => ({
                              ...x,
                              [v.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">직원 선택</option>
                          {crew
                            .filter(
                              (c) =>
                                c.state === "available" &&
                                c.id !== v.assignedCrew,
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        className={styles.secondary}
                        disabled={
                          busy || !targets[v.id] || !reasons[v.id]?.trim()
                        }
                        onClick={() =>
                          void mutate({
                            action: "transfer",
                            id: v.id,
                            version: v.version,
                            target: targets[v.id],
                            reason: reasons[v.id],
                          })
                        }
                      >
                        교대 인계
                      </button>
                    </>
                  )}
                  {v.state === "booked" && (
                    <button
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "예약 시각 15분 이후 미도착 예약을 종료할까요?",
                          )
                        )
                          void mutate({
                            action: "missed",
                            id: v.id,
                            version: v.version,
                          });
                      }}
                    >
                      미도착 확인·종료
                    </button>
                  )}
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {loaded && total > 20 && (
        <nav className={styles.pagination} aria-label="예약 목록 페이지">
          <button
            type="button"
            className={styles.secondary}
            disabled={busy || filters.offset === 0}
            onClick={() =>
              setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - 20) }))
            }
          >
            이전 20건
          </button>
          <span>
            {filters.offset + 1}–{Math.min(filters.offset + 20, total)} /{" "}
            {total}건
          </span>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy || !hasMore}
            onClick={() => setFilters((f) => ({ ...f, offset: f.offset + 20 }))}
          >
            다음 20건
          </button>
        </nav>
      )}
      <div className="staff-visit-settings">
        <ShiftSettings mine={mine} busy={busy} save={mutate} />
        {isDesk && (
          <details className={styles.panel}>
            <summary>거점 운영시간·정원·장비 기준</summary>
            <p className={styles.demo}>
              시연 장비 대장과 예약·현장 호출에 함께 적용합니다. 운영 중지
              후에는 진행 중인 지원을 확인하고 지연·대체 안내를 전달하세요.
            </p>
            <Link className={styles.link} href="/staff/resources">
              장비 상태·점유 확인 →
            </Link>
            {rules.map((r) => (
              <RuleForm
                key={r.hubId + r.service}
                rule={r}
                busy={busy}
                save={mutate}
              />
            ))}
          </details>
        )}
      </div>
    </>
  );
}
function ShiftSettings({
  mine,
  busy,
  save,
}: {
  mine?: Crew;
  busy: boolean;
  save: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(""),
    [state, setState] = useState("available");
  return (
    <details
      className={styles.panel}
      onToggle={(e) => {
        if (e.currentTarget.open) {
          setLabel(mine?.label ?? "");
          setState(mine?.state === "away" ? "away" : "available");
        }
      }}
    >
      <summary>
        내 근무 설정
        {mine
          ? " · " +
            mine.label +
            (mine.state === "busy"
              ? " · 처리 중"
              : mine.state === "away"
                ? " · 부재"
                : " · 가용")
          : ""}
      </summary>
      <form
        className={styles.toolbar}
        onSubmit={async (e) => {
          e.preventDefault();
          await save({ action: "shift", label, state });
        }}
      >
        <label>
          근무 표시 이름
          <input
            maxLength={30}
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="예: 안내 A"
          />
        </label>
        <label>
          상태
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="available">가용</option>
            <option value="busy">다른 업무 처리 중</option>
            <option value="away">부재·근무 종료</option>
          </select>
        </label>
        <button className={styles.secondary} disabled={busy}>
          근무 상태 저장
        </button>
      </form>
      <p className={styles.demo}>
        개인 실명 대신 근무 표시 이름을 사용하세요. 담당 지원은 교대 인계 후
        근무를 종료할 수 있습니다.
      </p>
    </details>
  );
}

function RuleForm({
  rule,
  busy,
  save,
}: {
  rule: HubRule;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(rule),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(rule);
  }, [rule, dirty]);
  const change = (patch: Partial<HubRule>) => {
    setDirty(true);
    setDraft((x) => ({ ...x, ...patch }));
  };
  return (
    <form
      className={styles.panel}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save({ action: "rule", ...draft })) setDirty(false);
      }}
    >
      <h3>
        {hubOf(rule.hubId)?.label} · {VISIT_SERVICES[rule.service]}
      </h3>
      <div className={styles.toolbar}>
        <label>
          운영 시작 시
          <input
            type="number"
            min={0}
            max={23}
            required
            value={draft.openHour}
            onChange={(e) => change({ openHour: Number(e.target.value) })}
          />
        </label>
        <label>
          운영 종료 시
          <input
            type="number"
            min={1}
            max={24}
            required
            value={draft.closeHour}
            onChange={(e) => change({ closeHour: Number(e.target.value) })}
          />
        </label>
        <label>
          30분 정원
          <input
            type="number"
            min={0}
            max={4}
            required
            value={draft.capacity}
            onChange={(e) => change({ capacity: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className={styles.field}>
        <label>
          장비 준비 상태
          <select
            value={draft.state}
            onChange={(e) =>
              change({ state: e.target.value as HubRule["state"] })
            }
          >
            <option value="ready">운영 가능</option>
            <option value="paused">혼잡·안전 중지</option>
            <option value="charging">충전·복귀 중</option>
          </select>
        </label>
      </div>
      <div className={styles.toolbar}>
        <label>
          확인한 배터리 %
          <input
            type="number"
            min={0}
            max={100}
            value={draft.battery}
            onChange={(e) => change({ battery: Number(e.target.value) })}
          />
        </label>
        <label>
          재개 예상 · 한국시간
          <input
            type="datetime-local"
            value={
              draft.availableAfter
                ? new Date(Date.parse(draft.availableAfter) + 9 * 3600000)
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            onChange={(e) =>
              change({
                availableAfter: e.target.value
                  ? new Date(e.target.value + "+09:00").toISOString()
                  : null,
              })
            }
          />
        </label>
      </div>
      <div className={styles.field}>
        <label>
          중지·충전 사유
          <input
            maxLength={150}
            required={draft.state !== "ready"}
            value={draft.reason}
            onChange={(e) => change({ reason: e.target.value })}
          />
        </label>
      </div>
      <button
        className={styles.secondary}
        type="submit"
        disabled={busy || !dirty}
      >
        기준 적용
      </button>
    </form>
  );
}
