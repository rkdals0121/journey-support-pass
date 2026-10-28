"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VISIT_STATES, VISIT_SERVICES, hubOf, type VisitView } from "@/lib/service-hubs";
import { placeOf, nearestFacilities, routeOptionsOf, type FacilityKind } from "@/lib/airport";
import { HubMap } from "../components/HubMap";
import { VisitForm, rememberVisit } from "./VisitForm";
import styles from "../components/support-journey.module.css";
interface History { version: number; action: string; actor: string; at: string; reason: string; }
const timeOf = (value: string, en: boolean) => new Date(value).toLocaleString(en ? "en-GB" : "ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export function VisitStatus({ receipt, en = false }: { receipt: string; en?: boolean }) {
  const t = (ko: string, english: string) => en ? english : ko;
  const [visit, setVisit] = useState<VisitView | null>(null), [history, setHistory] = useState<History[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState("location");
  const saving = useRef(false);
  const highestVersion = useRef(-1);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", receipt }), cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      const b = await r.json(); if (!r.ok) throw Error(b.error ?? "예약을 불러오지 못했습니다");
      if (!signal?.aborted && b.visit.version >= highestVersion.current) { highestVersion.current = b.visit.version; setVisit(b.visit); setHistory(b.history); rememberVisit(receipt, b.visit.startAt); }
    } catch (e) { if (!signal?.aborted) setError((e as Error).message); }
  }, [receipt]);
  useEffect(() => { const ctrl = new AbortController(); void load(ctrl.signal); const timer = setInterval(() => void load(ctrl.signal), 10000); return () => { ctrl.abort(); clearInterval(timer); }; }, [load]);
  async function act(action: string) {
    if (!visit || saving.current) return;
    if (action === "cancel" && !window.confirm(t("예약을 취소할까요?", "Cancel this appointment?"))) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const r = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ action, receipt, version: visit.version, confirmed: action === "complete" }) });
      const b = await r.json(); if (!r.ok) throw Error(b.error ?? "처리하지 못했습니다");
      if (b.visit.version >= highestVersion.current) { highestVersion.current = b.visit.version; setVisit(b.visit); setHistory(b.history); }
    } catch (e) { setError((e as Error).message); await load(); } finally { saving.current = false; setBusy(false); }
  }
  if (!visit) return <main id="public-main" className={styles.page}><h1>{t("예약 확인", "Your appointment")}</h1>{error ? <p role="alert" className={styles.error}>{error}</p> : <p role="status">{t("예약을 확인하고 있어요", "Loading appointment")}</p>}<button className={styles.secondary} onClick={() => { setError(""); void load(); }}>{t("다시 확인", "Try again")}</button></main>;
  const hub = hubOf(visit.hubId)!;
  if (editing && visit.state === "booked") return <main id="public-main" className={styles.page}><h1>{t("예약 변경", "Change appointment")}</h1><button className={styles.secondary} onClick={() => setEditing(false)}>{t("기존 예약 유지", "Keep current booking")}</button><VisitForm en={en} edit={{ receipt, visit, onChanged: () => { setEditing(false); void load(); } }} /></main>;
  const from = placeOf(hub.placeId)!;
  const facility = !from.landside && topic.startsWith("facility:") ? nearestFacilities(from, routeOptionsOf(visit.choices)).find(f => f.kind === topic.slice(9) as FacilityKind) : undefined;
  const finished = ["done", "cancelled", "missed"].includes(visit.state);
  const stateEn = { booked: "Booked", checked_in: "Arrival confirmed", responding: "Robot response", handed_over: "Handed to staff", done: "Completed", cancelled: "Cancelled", missed: "Missed appointment" };
  return <main id="public-main" className={styles.page}>
    <p className={styles.eyebrow}>{t("내 예약", "YOUR APPOINTMENT")}</p><h1>{en ? stateEn[visit.state] : VISIT_STATES[visit.state]}</h1><p className={styles.demo}>{t("시연 예약·화면 응대 · 실제 로봇 주행 미연결", "Prototype appointment and on-screen response · no live robot navigation")}</p>
    <ol className={styles.progress} aria-label={t("진행 단계", "Progress")}>{["booked", "checked_in", "responding", "done"].map((state, i) => <li key={state} aria-current={visit.state === state ? "step" : undefined}>{en ? ["Booked", "Arrived", "Response", "Complete"][i] : ["예약", "도착", "응대", "완료"][i]}</li>)}</ol>
    <div className={styles.layout}><div><section className={styles.panel}><h2>{en ? hub.en : hub.label}</h2><dl className={styles.summary}><dt>{t("예약 시각", "Meeting time")}</dt><dd>{timeOf(visit.startAt, en)} {t("한국시간", "KST")}</dd><dt>{t("지원", "Assistance")}</dt><dd>{en ? visit.service === "robot" ? "Robot guidance" : "Mobility assistance" : VISIT_SERVICES[visit.service]} · {visit.party}{t("명", " people")}</dd><dt>{t("확인 번호", "Reference")}</dt><dd>{visit.id.slice(0, 8).toUpperCase()}</dd>{visit.recognition && <><dt>{t("만날 때 특징", "Recognition")}</dt><dd>{visit.recognition}</dd></>}</dl>
      {visit.notice && <p className={styles.warning} role="status">{visit.notice}</p>}
      {visit.state === "booked" && <><p>{t("거점에 도착하면 아래 버튼을 눌러 주세요. 예약 시각 15분 전부터 확인할 수 있어요.", "When you arrive, confirm below. Arrival opens 15 minutes before your appointment.")}</p><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => void act("checkin")}>{t("이곳에 도착했어요", "I have arrived")}</button><button className={styles.secondary} disabled={busy} onClick={() => setEditing(!editing)}>{t("시간·장소 변경", "Change time or point")}</button></div></>}
      {visit.state === "checked_in" && <><p>{t("도착을 확인했어요. 화면에서 안내를 받거나 직원에게 필요한 지원을 전달할 수 있어요.", "Arrival confirmed. Continue on-screen or send your assistance needs to staff.")}</p><button className={styles.button} disabled={busy} onClick={() => void act(visit.service === "robot" ? "respond" : "handover")}>{visit.service === "robot" ? t("로봇 화면 안내 시작", "Start robot screen guidance") : t("담당 직원에게 지원 전달", "Send to staff")}</button></>}
      {visit.state === "handed_over" && <><p role="status">{visit.requestId ? t("앞서 입력한 장소와 필요한 도움을 같은 접수로 직원에게 전달했어요.", "Your location and assistance needs were handed to staff without re-entry.") : t("직원 접수를 연결하고 있어요. 연결이 멈추면 다시 시도해 주세요.", "Connecting to staff. Retry if this does not finish.")}</p>{visit.requestId ? <Link className={styles.button} href={`/help/receipt/${receipt}${en ? "?lang=en" : ""}`}>{t("직원 처리 상태 보기", "View staff progress")}</Link> : <button className={styles.button} disabled={busy} onClick={() => void act("handover")}>{t("직원 연결 다시 시도", "Retry handover")}</button>}</>}
      {visit.state === "missed" && <p>{t("예정 시간이 지나 예약이 종료됐어요. 다른 시간을 선택하거나 현장 도움을 요청해 주세요.", "The appointment window has ended. Choose another time or request on-site assistance.")}</p>}
      {visit.state === "done" && <p>{t("지원이 완료됐어요. 공항 이용에 도움이 되었기를 바라요.", "Your assistance is complete. We hope it helped your journey.")}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>{!finished && <button className={styles.secondary} disabled={busy} onClick={() => void act("cancel")}>{t("예약 취소", "Cancel appointment")}</button>}<Link className={styles.secondary} href={`/help?place=${hub.placeId}&fresh=1${en ? "&lang=en" : ""}`}>{t("현장 도움 요청", "On-site assistance")}</Link>{finished && <Link className={styles.secondary} href={`/visits?hub=${hub.id}${en ? "&lang=en" : ""}`}>{t("새 예약", "New appointment")}</Link>}</div>
    </section>
    {visit.state === "responding" && <section className={styles.panel} aria-label={t("로봇 직접 안내", "Robot self-service guidance")}><h2>{t("무엇을 안내해 드릴까요?", "How can I help?")}</h2><div className={styles.field}><label htmlFor="robot-topic">{t("안내받을 내용", "Information")}</label><select id="robot-topic" value={topic} onChange={e => setTopic(e.target.value)}><option value="location">{t("현재 장소와 만남 표지", "Current place and meeting sign")}</option><option value="support">{t("이곳에서 받을 수 있는 도움", "Assistance available here")}</option>{!from.landside && <><option value="facility:restroom">{t("가까운 화장실", "Nearest restroom")}</option><option value="facility:nursing">{t("영유아 휴게실", "Nursing room")}</option><option value="facility:pharmacy">{t("약국", "Pharmacy")}</option><option value="facility:food">{t("식사할 곳", "Food")}</option></>}</select></div>
      {topic === "location" && <p>{hub.landmark}</p>}{topic === "support" && <p>{t("위치·시설 안내는 이 화면에서 확인할 수 있어요. 휠체어·이동 동행 등 사람이 필요한 지원은 입력한 내용을 유지해 직원에게 연결해 드려요. 일반 안내에는 증빙서류가 필요하지 않아요.", "Check location and facility guidance here. Wheelchair or escort needs can be handed to staff with your existing details. General guidance does not require documents.")}</p>}
      {facility && <div className={styles.inlineNotice}><p>{t(`${facility.nearGate}번 게이트 부근 · 약 ${facility.route.minutes}분, ${Math.round(facility.route.meters)}m`, `Near gate ${facility.nearGate} · about ${facility.route.minutes} min, ${Math.round(facility.route.meters)}m`)}</p><ol>{facility.route.steps.map((step, i) => <li key={i}>{step.kind === "walk" ? t(`${step.towardGate ?? "시설"} 방향으로 ${Math.round(step.meters)}m 이동`, `Walk ${Math.round(step.meters)}m towards ${step.towardGate ?? "the facility"}`) : step.kind === "elevator" ? t("엘리베이터 이용", "Take the lift") : step.kind === "shuttle" ? t("셔틀트레인 이용", "Take the shuttle train") : t("층 이동 안내를 확인해 주세요", "Check the level change")}</li>)}</ol><p className={styles.muted}>{t("시연 지도 기준 추정 거리·시간", "Estimated using the prototype map")}</p></div>}
      {topic.startsWith("facility:") && !facility && <p>{t("이 구역에서 확인된 시설이 없어 직원 안내가 필요해요.", "This facility is not mapped in this area. Ask staff for help.")}</p>}
      <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => void act("complete")}>{t("안내를 받았어요 · 완료", "That helped · finish")}</button><button className={styles.secondary} disabled={busy} onClick={() => void act("handover")}>{t("직원 도움이 더 필요해요", "I need staff assistance")}</button></div></section>}
    <details className={styles.panel}><summary>{t("예약·처리 이력", "Appointment history")}</summary><ol className={styles.timeline}>{history.map(h => <li key={h.version}><time>{timeOf(h.at, en)}</time>{({book:"예약 확정",reschedule:"예약 변경",checkin:"도착 확인",checked_in:"도착 확인",respond:"안내 시작",responding:"안내 시작",complete:"안내 완료",done:"완료",cancel:"취소",cancelled:"취소",missed:"미도착 종료",handover:"직원 인계",handed_over:"직원 인계",claim:"담당자 수락",transfer:"담당자 인계",delay:"지연 안내",updated:"예약 정보 변경"} as Record<string,string>)[h.action] || "상태 변경"}{h.reason ? " · " + h.reason : ""}</li>)}</ol></details>
    </div><aside className={styles.panel}><HubMap hubId={hub.id} photo /></aside></div>
  </main>;
}
