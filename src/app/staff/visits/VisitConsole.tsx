"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SERVICE_HUBS, VISIT_SERVICES, VISIT_STATES, hubOf, type HubRule, type VisitView } from "@/lib/service-hubs";
import styles from "@/app/components/support-journey.module.css";
interface Crew { id: string; label: string; zoneId: string; state: string; mine: boolean; }
export function VisitConsole({ isDesk }: { isDesk: boolean }) {
  const [visits, setVisits] = useState<VisitView[]>([]), [crew, setCrew] = useState<Crew[]>([]), [rules, setRules] = useState<HubRule[]>([]);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [notice, setNotice] = useState("");
  const [label, setLabel] = useState(""), [shift, setShift] = useState("available"), [hub, setHub] = useState("all"), [state, setState] = useState("open"), [search, setSearch] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({}), [targets, setTargets] = useState<Record<string, string>>({});
  const saving = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/staff/visits", { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      const b = await r.json(); if (!r.ok) throw Error(b.error ?? "운영 현황을 불러오지 못했습니다");
      if (!signal?.aborted) { setVisits(b.visits); setCrew(b.crew); setRules(b.rules); setLoaded(true); setLoadError(""); }
    } catch (e) { if (!signal?.aborted) setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { const ctrl = new AbortController(); let running = false; const poll = async () => { if (running) return; running = true; try { await load(ctrl.signal); } finally { running = false; } }; void poll(); const timer = setInterval(() => void poll(), 8000); return () => { ctrl.abort(); clearInterval(timer); }; }, [load]);
  async function mutate(body: Record<string, unknown>) {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/staff/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const b = await r.json(); if (!r.ok) throw Error(b.error ?? "변경하지 못했습니다");
      await load(); setNotice("변경을 저장했습니다."); return true;
    } catch (e) { setError((e as Error).message); await load(); return false; } finally { saving.current = false; setBusy(false); }
  }
  const mine = crew.find(c => c.mine);
  const visible = visits.filter(v => (hub === "all" || v.hubId === hub) && (state === "all" || (state === "mine" ? v.assignedCrew === mine?.id : !["done", "cancelled", "missed"].includes(v.state))) && `${v.id} ${v.recognition} ${hubOf(v.hubId)?.label}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
    {(error || loadError) && <p role="alert" className={styles.error}>{error || loadError}</p>}<p role="status" className={styles.status}>{notice}</p>
    <section className={styles.panel} aria-label="내 근무 상태"><h2>내 근무</h2>{mine && <p><span className={styles.badge}>{mine.label} · {mine.state === "available" ? "가용" : mine.state === "busy" ? "처리 중" : "부재"}</span></p>}<form className={styles.toolbar} onSubmit={e => { e.preventDefault(); void mutate({ action: "shift", label: label || mine?.label, state: shift }); }}><label>근무 표시 이름<input id="crew-label" maxLength={30} value={label} placeholder={mine?.label ?? "예: 안내 A"} required={!mine} onChange={e => setLabel(e.target.value)} /></label><label>상태<select id="crew-state" value={shift} onChange={e => setShift(e.target.value)}><option value="available">가용</option><option value="busy">다른 업무 중</option><option value="away">부재·근무 종료</option></select></label><button className={styles.button} type="submit" disabled={busy}>근무 상태 저장</button></form><p className={styles.muted}>개인 실명 대신 근무용 이름을 사용하세요. 담당 중인 예약은 교대 인계 후 부재로 바꿀 수 있습니다. 근무 상태는 최대 4시간 뒤 다시 확인합니다.</p></section>
    <div className={styles.toolbar}><label>거점<select id="visits-hub-filter" value={hub} onChange={e => setHub(e.target.value)}><option value="all">모든 거점</option>{SERVICE_HUBS.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}</select></label><label>예약 범위<select id="visits-state-filter" value={state} onChange={e => setState(e.target.value)}><option value="open">진행 중</option><option value="mine">내 담당</option><option value="all">전체·종료 포함</option></select></label><label>예약·인상착의 검색<input id="visits-search" type="search" value={search} onChange={e => setSearch(e.target.value)} maxLength={80} /></label><button type="button" className={styles.secondary} onClick={() => void load()}>새로고침</button></div>
    {!loaded && <p role="status">예약을 확인하고 있습니다.</p>}{loaded && !visible.length && <p className={styles.panel}>조건에 맞는 예약이 없습니다.</p>}
    <ul className={styles.list}>{visible.map(v => { const owner = crew.find(c => c.id === v.assignedCrew); return <li key={v.id} data-visit-id={v.id}><div className={styles.row}><span className={styles.badge}>{VISIT_STATES[v.state]}</span><strong>{hubOf(v.hubId)?.label}</strong><span>{new Date(v.startAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div><h3>{VISIT_SERVICES[v.service]} · {v.party}명 · {v.id.slice(0, 8).toUpperCase()}</h3><p>{v.recognition || "인상착의 입력 없음"} · 담당 {owner?.label ?? (v.assignedCrew ? "근무 확인·인계 필요" : "미배정")}</p>{v.notice && <p className={styles.warning}>{v.notice}</p>}
      {!['done','cancelled','missed'].includes(v.state) && <>
        <div className={styles.actions}>{!v.assignedCrew && v.state !== "booked" && <button className={styles.button} disabled={busy || !mine || mine.state !== "available"} onClick={() => void mutate({ action: "claim", id: v.id, version: v.version })}>제가 맡겠습니다</button>}{v.requestId && <Link className={styles.secondary} href={`/staff/requests?search=${v.requestId}`}>통합 접수에서 처리 →</Link>}</div>
        <details className={styles.panel}><summary>지연 안내·교대 인계</summary><div className={styles.field}><label htmlFor={`reason-${v.id}`}>여객 안내 또는 인계 사유</label><input id={`reason-${v.id}`} maxLength={150} value={reasons[v.id] ?? ""} onChange={e => setReasons(x => ({ ...x, [v.id]: e.target.value }))} placeholder="예: 혼잡으로 확인 중입니다. 현장 직원이 먼저 안내합니다." /></div><div className={styles.actions}><button className={styles.secondary} disabled={busy || !reasons[v.id]?.trim()} onClick={() => void mutate({ action: "delay", id: v.id, version: v.version, reason: reasons[v.id] })}>여객에게 지연·대체 안내</button></div>{v.assignedCrew && <><div className={styles.field}><label htmlFor={`target-${v.id}`}>인계할 가용 직원</label><select id={`target-${v.id}`} value={targets[v.id] ?? ""} onChange={e => setTargets(x => ({ ...x, [v.id]: e.target.value }))}><option value="">직원 선택</option>{crew.filter(c => c.state === "available" && c.id !== v.assignedCrew).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div><button className={styles.secondary} disabled={busy || !targets[v.id] || !reasons[v.id]?.trim()} onClick={() => void mutate({ action: "transfer", id: v.id, version: v.version, target: targets[v.id], reason: reasons[v.id] })}>사유와 함께 인계</button></>}{v.state === "booked" && <button className={styles.secondary} disabled={busy} onClick={() => { if (confirm("예약 시각 15분 이후 미도착 예약을 종료할까요?")) void mutate({ action: "missed", id: v.id, version: v.version }); }}>미도착 확인·종료</button>}</details>
      </>}
    </li>; })}</ul>
    {isDesk && <details className={styles.panel}><summary>거점 운영시간·정원·장비 준비 기준</summary><p className={styles.warning}>시범 예약 정원입니다. 실제 장비 대수·운행·충전 상태를 자동 수신하지 않습니다. 기존 예약은 기준을 바꿔도 자동 취소되지 않으므로 지연 안내·시간 변경을 함께 처리하세요.</p><div className={styles.grid}>{rules.map(rule => <RuleForm key={`${rule.hubId}-${rule.service}`} rule={rule} busy={busy} save={mutate} />)}</div></details>}
    <Link className={styles.link} href="/staff/experience">운영 효과·체험 집계 보기 →</Link>
  </>;
}
function RuleForm({ rule, busy, save }: { rule: HubRule; busy: boolean; save: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [draft, setDraft] = useState(rule), [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(rule); }, [rule, dirty]);
  const change = (patch: Partial<HubRule>) => { setDirty(true); setDraft(x => ({ ...x, ...patch })); };
  return <form className={styles.panel} onSubmit={async e => { e.preventDefault(); if (await save({ action: "rule", ...draft })) setDirty(false); }}><h3>{hubOf(rule.hubId)?.label} · {VISIT_SERVICES[rule.service]}</h3><div className={styles.toolbar}><label>운영 시작 시<input type="number" min={0} max={23} required value={draft.openHour} onChange={e => change({ openHour: Number(e.target.value) })} /></label><label>운영 종료 시<input type="number" min={1} max={24} required value={draft.closeHour} onChange={e => change({ closeHour: Number(e.target.value) })} /></label><label>30분 정원<input type="number" min={0} max={4} required value={draft.capacity} onChange={e => change({ capacity: Number(e.target.value) })} /></label></div><div className={styles.field}><label>장비 준비 상태<select value={draft.state} onChange={e => change({ state: e.target.value as HubRule["state"] })}><option value="ready">운영 가능</option><option value="paused">혼잡·안전 중지</option><option value="charging">충전·복귀 중</option></select></label></div><div className={styles.toolbar}><label>확인한 배터리 %<input type="number" min={0} max={100} value={draft.battery} onChange={e => change({ battery: Number(e.target.value) })} /></label><label>재개 예상 · 한국시간<input type="datetime-local" value={draft.availableAfter ? new Date(Date.parse(draft.availableAfter) + 9 * 3600000).toISOString().slice(0, 16) : ""} onChange={e => change({ availableAfter: e.target.value ? new Date(e.target.value + "+09:00").toISOString() : null })} /></label></div><div className={styles.field}><label>중지·충전 사유<input maxLength={150} required={draft.state !== "ready"} value={draft.reason} onChange={e => change({ reason: e.target.value })} /></label></div><button className={styles.secondary} type="submit" disabled={busy || !dirty}>기준 적용</button></form>;
}
