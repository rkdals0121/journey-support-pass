"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SERVICE_HUBS,
  hubOf,
  VISIT_SERVICES,
  type VisitService,
  type VisitView,
  type HubRule,
} from "@/lib/service-hubs";
import { visitError } from "@/lib/visit-labels";
import { HubMap } from "../components/HubMap";
import styles from "../components/support-journey.module.css";

export const VISIT_STORAGE = "jsp-support-visits-v1";
export function rememberVisit(receipt: string, start: string) {
  try {
    const old = JSON.parse(localStorage.getItem(VISIT_STORAGE) ?? "[]");
    const list = Array.isArray(old)
      ? old.filter(
          (x) =>
            typeof x?.receipt === "string" &&
            x.receipt !== receipt &&
            x.until > Date.now(),
        )
      : [];
    localStorage.setItem(
      VISIT_STORAGE,
      JSON.stringify(
        [{ receipt, until: Date.parse(start) + 86400000 }, ...list].slice(
          0,
          10,
        ),
      ),
    );
  } catch {
    /* The confirmation URL remains available without local storage. */
  }
}
function dayKst(offset = 0) {
  return new Date(Date.now() + 9 * 3600000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
interface Slot {
  startAt: string;
  label: string;
  remaining: number;
  reason: string;
}
export function VisitForm({
  initialHub,
  registrationToken,
  en = false,
  edit,
}: {
  initialHub?: string;
  registrationToken?: string;
  en?: boolean;
  edit?: { receipt: string; visit: VisitView; onChanged: () => void };
}) {
  const t = (ko: string, english: string) => (en ? english : ko);
  const router = useRouter();
  const [hub, setHub] = useState(
    edit?.visit.hubId ?? hubOf(initialHub)?.id ?? SERVICE_HUBS[0].id,
  );
  const [service, setService] = useState<VisitService>(
    edit?.visit.service ?? "robot",
  );
  const [task, setTask] = useState(edit?.visit.task ?? "directions");
  const [day, setDay] = useState(
    edit
      ? new Date(Date.parse(edit.visit.startAt) + 9 * 3600000)
          .toISOString()
          .slice(0, 10)
      : dayKst(),
  );
  const [slot, setSlot] = useState(edit?.visit.startAt ?? "");
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const previousStep = useRef(0);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`visit-stage-${step}`)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const draftKey = `jsp-visit-draft-v2:${edit?.receipt ?? `${registrationToken ?? "public"}:${hubOf(initialHub)?.id ?? "any"}`}`;
  const [slots, setSlots] = useState<Slot[]>([]);
  const [rule, setRule] = useState<HubRule | null>(null);
  const [party, setParty] = useState(edit?.visit.party ?? 1);
  const [recognition, setRecognition] = useState(edit?.visit.recognition ?? "");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [refresh, setRefresh] = useState(0);
  const sending = useRef(false),
    receipt = useRef("");
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      if (
        d &&
        d.until > Date.now() &&
        hubOf(d.hub) &&
        ["robot", "mobility"].includes(d.service) &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.day)
      ) {
        receipt.current =
          typeof d.pendingReceipt === "string" &&
          /^[a-f0-9]{64}$/.test(d.pendingReceipt)
            ? d.pendingReceipt
            : "";
        setHub(d.hub);
        setService(d.service);
        setTask(
          d.task === "escort"
            ? "escort"
            : d.service === "robot"
              ? "directions"
              : "wheelchair",
        );
        setDay(d.day);
        setSlot(typeof d.slot === "string" ? d.slot : "");
        setParty(Math.max(1, Math.min(20, Number(d.party) || 1)));
        setRecognition(String(d.recognition ?? "").slice(0, 100));
        setConsent(d.consent === true);
        setStep(Math.max(0, Math.min(2, Number(d.step) || 0)));
      }
    } catch {
      /* Storage is optional. */
    }
    setRestored(true);
  }, [draftKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          hub,
          service,
          task,
          day,
          slot,
          party,
          recognition,
          consent,
          step,
          pendingReceipt: receipt.current,
          until: Date.now() + 3600000,
        }),
      );
    } catch {
      /* Keep the current form usable. */
    }
  }, [
    restored,
    draftKey,
    hub,
    service,
    task,
    day,
    slot,
    party,
    recognition,
    consent,
    step,
  ]);
  useEffect(() => {
    if (!restored || edit) return;
    const ctrl = new AbortController();
    const recover = () => {
      const cap = receipt.current;
      if (!cap) return;
      void fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", receipt: cap }),
        cache: "no-store",
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(10000)]),
      })
        .then(async (r) => {
          if (!r.ok) return;
          const b = await r.json();
          if (ctrl.signal.aborted || !b.visit?.startAt) return;
          rememberVisit(cap, b.visit.startAt);
          try {
            sessionStorage.removeItem(draftKey);
          } catch {
            /* Storage is optional. */
          }
          router.replace(`/visits/${cap}${en ? "?lang=en" : ""}`);
        })
        .catch(() => {
          /* Keep the same attempt key for a safe retry. */
        });
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) recover();
    };
    recover();
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", recover);
    return () => {
      ctrl.abort();
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", recover);
    };
  }, [restored, draftKey, edit, router, en]);
  useEffect(() => {
    if (!restored) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/visits?${new URLSearchParams({ hub, service, day })}`, {
      cache: "no-store",
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok)
          throw Error(
            b.error ??
              t("시간대를 불러오지 못했습니다", "Could not load times"),
          );
        if (!ctrl.signal.aborted) {
          setSlots(b.slots);
          setRule(b.rule);
          setSlot((old) =>
            b.slots.some((s: Slot) => s.startAt === old && s.remaining)
              ? old
              : "",
          );
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, service, day, refresh, restored]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < 2) {
      if (step === 0 || slot) setStep(step + 1);
      return;
    }
    if (sending.current || !slot || !e.currentTarget.reportValidity()) return;
    sending.current = true;
    setSaving(true);
    setError("");
    if (!receipt.current)
      receipt.current = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
    // Journal the attempt before sending: a lost response must not create a new booking on return.
    if (!edit)
      try {
        const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "{}");
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            ...draft,
            pendingReceipt: receipt.current,
            until: Date.now() + 3600000,
          }),
        );
      } catch {
        /* A same-page retry still uses the in-memory key. */
      }
    let definitiveFailure = false;
    try {
      const r = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(
          edit
            ? {
                action: "reschedule",
                receipt: edit.receipt,
                version: edit.visit.version,
                hubId: hub,
                startAt: slot,
              }
            : {
                action: "book",
                lang: en ? "en" : "ko",
                receipt: receipt.current,
                hubId: hub,
                service,
                task,
                startAt: slot,
                party,
                recognition,
                consent,
                ...(registrationToken ? { registrationToken } : {}),
              },
        ),
      });
      const b = await r.json();
      if (!r.ok) {
        definitiveFailure = r.status < 500;
        throw Error(visitError(b, en));
      }
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Optional storage. */
      }
      rememberVisit(edit?.receipt ?? receipt.current, b.visit.startAt);
      if (edit) edit.onChanged();
      else router.push(`/visits/${receipt.current}${en ? "?lang=en" : ""}`);
    } catch (e) {
      if (!edit && !definitiveFailure) rememberVisit(receipt.current, slot);
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }
  return (
    <div className={`${styles.layout} ${styles.visitLayout}`}>
      <form
        className={styles.panel}
        onSubmit={submit}
        noValidate
        aria-label={t("만남 예약", "Book assistance")}
      >
        <nav
          className={styles.draftSteps}
          aria-label={t("예약 단계", "Booking steps")}
        >
          {[
            t("장소·지원", "Place"),
            t("시간", "Time"),
            t("확인", "Review"),
          ].map((label, i) => (
            <button
              key={i}
              type="button"
              aria-current={step === i ? "step" : undefined}
              disabled={saving || (i === 2 && !slot)}
              onClick={() => setStep(i)}
            >
              {i + 1}. {label}
            </button>
          ))}
        </nav>
        <div hidden={step !== 0}>
          <h2 id="visit-stage-0" tabIndex={-1}>
            {t("장소와 지원 선택", "Choose place and assistance")}
          </h2>
          <div className={styles.field}>
            <label htmlFor="visit-hub">{t("만날 장소", "Meeting point")}</label>
            <select
              id="visit-hub"
              value={hub}
              onChange={(e) => setHub(e.target.value as typeof hub)}
              disabled={saving}
            >
              {SERVICE_HUBS.map((h) => (
                <option key={h.id} value={h.id}>
                  {en ? h.en : h.label}
                </option>
              ))}
            </select>
          </div>
          {!edit && (
            <div className={styles.field}>
              <label htmlFor="visit-service">
                {t("필요한 지원", "Assistance")}
              </label>
              <select
                id="visit-service"
                disabled={saving}
                value={service}
                onChange={(e) => {
                  const next = e.target.value as VisitService;
                  setService(next);
                  setTask(next === "robot" ? "directions" : "wheelchair");
                }}
              >
                {Object.entries(VISIT_SERVICES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {en
                      ? id === "robot"
                        ? "Robot guidance"
                        : "Mobility assistance"
                      : label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!edit && service === "mobility" && (
            <div className={styles.field}>
              <label htmlFor="visit-task">
                {t("어떤 도움이 필요하세요?", "What do you need?")}
              </label>
              <select
                id="visit-task"
                disabled={saving}
                value={task}
                onChange={(e) => setTask(e.target.value as typeof task)}
              >
                <option value="wheelchair">
                  {t("휠체어 지원", "Wheelchair assistance")}
                </option>
                <option value="escort">
                  {t("이동 동행", "Walking escort")}
                </option>
              </select>
            </div>
          )}
        </div>
        <div hidden={step !== 1}>
          <div className={styles.field}>
            <label htmlFor="visit-day">{t("방문 날짜", "Date")}</label>
            <input
              id="visit-day"
              type="date"
              min={dayKst()}
              max={dayKst(7)}
              value={day}
              required
              onChange={(e) => setDay(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className={styles.row}>
            <h2 id="visit-stage-1" tabIndex={-1}>
              {t("만날 시간", "Meeting time")}
            </h2>
            <button
              className={styles.secondary}
              type="button"
              disabled={loading || saving}
              onClick={() => setRefresh((x) => x + 1)}
            >
              {t("시간대 새로고침", "Refresh times")}
            </button>
          </div>
          {rule && (
            <p className={styles.muted}>
              {t(
                `시범 운영 ${rule.openHour}:00~${rule.closeHour}:00 · 응대·복귀 포함 30분 단위`,
                `Prototype hours ${rule.openHour}:00–${rule.closeHour}:00 · 30-minute units including response and return`,
              )}
            </p>
          )}
          {loading ? (
            <p role="status">
              {t("가능한 시간을 확인하고 있어요", "Checking available times")}
            </p>
          ) : (
            <fieldset className={styles.slots}>
              <legend className="sr-only">
                {t("예약 가능 시간", "Available times")}
              </legend>
              {slots
                .filter((s) => Date.parse(s.startAt) > Date.now())
                .map((s) => (
                  <label className={styles.slot} key={s.startAt}>
                    <input
                      type="radio"
                      name="visit-time"
                      value={s.startAt}
                      checked={slot === s.startAt}
                      disabled={!s.remaining || saving}
                      onChange={() => setSlot(s.startAt)}
                    />
                    <span>
                      <strong>{s.label}</strong>
                      <small>
                        {s.remaining
                          ? t(
                              `남은 정원 ${s.remaining}`,
                              `${s.remaining} available`,
                            )
                          : en
                            ? "Unavailable"
                            : Date.parse(s.startAt) < Date.now()
                              ? "지난 시간"
                              : s.reason}
                      </small>
                    </span>
                  </label>
                ))}
            </fieldset>
          )}
          {!loading && !slots.some((s) => s.remaining) && (
            <div className={styles.warning}>
              <p>
                {t(
                  "이 날짜에는 가능한 시간이 없어요. 다른 날짜·거점을 고르거나 현장 직원을 요청해 주세요.",
                  "No time is available. Choose another date or point, or request staff assistance.",
                )}
              </p>
              <Link
                href={`/help?place=${hubOf(hub)!.placeId}&fresh=1${en ? "&lang=en" : ""}`}
              >
                {t("현장 직원 도움 요청", "Request staff assistance")}
              </Link>
            </div>
          )}
        </div>
        <div hidden={step !== 2}>
          <h2 id="visit-stage-2" tabIndex={-1}>
            {t("예약 내용 확인", "Review your appointment")}
          </h2>
          <dl className={styles.summary}>
            <dt>{t("만날 장소", "Meeting point")}</dt>
            <dd>{en ? hubOf(hub)?.en : hubOf(hub)?.label}</dd>
            <dt>{t("예약 시각", "Time")}</dt>
            <dd>
              {slot
                ? new Date(slot).toLocaleString(en ? "en-GB" : "ko-KR", {
                    timeZone: "Asia/Seoul",
                  })
                : "—"}
            </dd>
          </dl>
          {!edit && (
            <>
              <div className={styles.field}>
                <label htmlFor="visit-party">
                  {t("함께 도움받을 인원", "People requiring assistance")}
                </label>
                <input
                  id="visit-party"
                  disabled={saving}
                  type="number"
                  min={1}
                  max={20}
                  value={party}
                  required
                  onChange={(e) => setParty(Number(e.target.value))}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="visit-recognition">
                  {t(
                    "만날 때 알아볼 특징 · 선택",
                    "How to recognise you · optional",
                  )}
                </label>
                <input
                  id="visit-recognition"
                  disabled={saving}
                  maxLength={100}
                  value={recognition}
                  onChange={(e) => setRecognition(e.target.value)}
                  placeholder={t(
                    "예: 파란 모자, 빨간 여행가방",
                    "e.g. blue hat, red suitcase",
                  )}
                />
                <small className={styles.muted}>
                  {t(
                    "이름·전화번호·여권 정보는 적지 마세요. 예약 번호와 장소로 확인해요.",
                    "Use your booking number and location. Do not enter names, phone numbers or passport details.",
                  )}
                </small>
              </div>
              {registrationToken && (
                <p className={styles.inlineNotice}>
                  {t(
                    "사전등록한 필요한 도움을 함께 전달합니다.",
                    "Your saved support needs will be included.",
                  )}
                </p>
              )}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  disabled={saving}
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {t(
                  "예약한 장소·시간·필요한 도움을 운영 담당자에게 전달하는 데 동의해요.",
                  "I agree to share this meeting point, time and assistance needs with the operating team.",
                )}
              </label>
            </>
          )}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          {step > 0 && (
            <button
              type="button"
              className={styles.secondary}
              disabled={saving}
              onClick={() => setStep(step - 1)}
            >
              {t("이전", "Back")}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className={styles.button}
              disabled={saving || (step === 1 && (!slot || loading))}
              onClick={() => setStep(step + 1)}
            >
              {t("다음", "Continue")}
            </button>
          ) : (
            <button
              type="submit"
              className={styles.button}
              disabled={!slot || loading || saving || (!edit && !consent)}
            >
              {saving
                ? t("확인 중…", "Confirming…")
                : edit
                  ? t("예약 변경", "Change booking")
                  : t("이 시간으로 예약", "Book this time")}
            </button>
          )}
        </div>
      </form>
      <aside className={styles.panel}>
        <HubMap hubId={hub} en={en} />
      </aside>
    </div>
  );
}
