"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefsOf } from "@/lib/catalog";
import { textOf } from "@/lib/i18n";
import { hubOf, VISIT_STATES, type VisitView } from "@/lib/service-hubs";
import { VISIT_STATE_EN, visitError } from "@/lib/visit-labels";
import { FlowShell } from "../../components/FlowShell";
import { IdleGuard } from "../../components/IdleGuard";
import { SharedVisitPrivacy } from "../../components/SharedVisitPrivacy";
import { VisitResponse } from "../../visits/VisitResponse";
import styles from "../../components/support-journey.module.css";
export function KioskVisitFlow({
  en: initialEnglish,
  hubId,
  place,
  returnTo,
  askSec,
  answerSec,
}: {
  en: boolean;
  hubId?: string;
  place: string;
  returnTo: string;
  askSec: number;
  answerSec: number;
}) {
  const [en, setEn] = useState(initialEnglish),
    [reference, setReference] = useState("");
  const [visit, setVisit] = useState<VisitView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    saving = useRef(false),
    latest = useRef<VisitView | null>(null);
  const controller = useRef<AbortController | null>(null);
  const t = (ko: string, english: string) => (en ? english : ko);
  const hub = hubOf(hubId);
  const reset = useCallback(() => {
    epoch.current++;
    controller.current?.abort();
    saving.current = false;
    latest.current = null;
    setVisit(null);
    setReference("");
    setError("");
    setBusy(false);
  }, []);
  const send = useCallback(
    async (action: string, silent = false) => {
      if (!silent && saving.current) return;
      const turn = epoch.current;
      if (!silent) {
        saving.current = true;
        setBusy(true);
        setError("");
      }
      const request = new AbortController();
      if (!silent) controller.current = request;
      try {
        const body =
          action === "lookup"
            ? { action, reference }
            : {
                action,
                id: latest.current?.id,
                version: latest.current?.version,
                confirmed: action === "complete",
              };
        const r = await fetch("/api/kiosk/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]),
        });
        const b = await r.json();
        if (!r.ok) throw Error(visitError(b, en));
        if (turn !== epoch.current) return;
        if (
          !latest.current ||
          latest.current.id !== b.visit.id ||
          b.visit.version >= latest.current.version
        ) {
          latest.current = b.visit;
          setVisit(b.visit);
        }
      } catch (e) {
        if (turn === epoch.current && !request.signal.aborted)
          setError((e as Error).message);
      } finally {
        if (!silent && turn === epoch.current) {
          saving.current = false;
          setBusy(false);
        }
      }
    },
    [reference, en],
  );
  useEffect(() => {
    if (!visit?.id) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running || saving.current) return;
      running = true;
      try {
        await send("status", true);
      } finally {
        running = false;
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [visit?.id, send]);
  useEffect(() => {
    const clear = () => reset();
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", clear);
      controller.current?.abort();
    };
  }, [reset]);
  const title = visit
    ? en
      ? VISIT_STATE_EN[visit.state]
      : VISIT_STATES[visit.state]
    : t("만남 예약을 확인할게요", "Let's find your appointment");
  return (
    <FlowShell
      lang={en ? "en" : "ko"}
      prefs={prefsOf(visit?.choices ?? [])}
      kiosk
      screenKey={"visit-" + (visit?.state ?? "lookup")}
      speakText={title}
      onHome={reset}
      onBack={visit ? reset : () => window.location.replace(returnTo)}
      headerTools={
        <button className="bar-btn" onClick={() => setEn(!en)}>
          {en ? "한국어" : "English"}
        </button>
      }
    >
      <SharedVisitPrivacy />
      <main className={styles.devicePage}>
        <p className={styles.eyebrow}>
          {en ? (hub?.en ?? "Airport device") : (hub?.label ?? place)}
        </p>
        <h1>{title}</h1>
        {!hub && (
          <>
            <p>
              {t(
                "예약한 만남 장소의 기기 또는 개인 휴대전화에서 예약을 확인해 주세요.",
                "Confirm your appointment at the booked meeting point, or on your own phone.",
              )}
            </p>
            <Link className={styles.button} href={returnTo}>
              {t("이 기기의 안내로 돌아가기", "Back to this device")}
            </Link>
          </>
        )}
        {hub && !visit && (
          <form
            className={styles.panel}
            onSubmit={(e) => {
              e.preventDefault();
              void send("lookup");
            }}
          >
            <div className={styles.field}>
              <label htmlFor="kiosk-visit-reference">
                {t(
                  "예약 확인번호 · 8자리",
                  "Appointment reference · 8 characters",
                )}
              </label>
              <input
                id="kiosk-visit-reference"
                value={reference}
                maxLength={8}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="AB12CD34"
                onChange={(e) =>
                  setReference(
                    e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ""),
                  )
                }
              />
            </div>
            <div
              className={styles.hexKeys}
              aria-label={t("확인번호 입력 키패드", "Reference keypad")}
            >
              {"1234567890ABCDEF".split("").map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy || reference.length >= 8}
                  onClick={() => setReference((v) => (v + key).slice(0, 8))}
                >
                  {key}
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                type="button"
                disabled={busy || !reference}
                onClick={() => setReference((v) => v.slice(0, -1))}
              >
                {t("한 글자 지우기", "Delete one")}
              </button>
              <button
                className={styles.button}
                type="submit"
                disabled={busy || reference.length !== 8}
              >
                {t("예약 확인", "Find appointment")}
              </button>
            </div>
          </form>
        )}
        {visit && (
          <section className={styles.panel}>
            <h2>{en ? hub?.en : hub?.label}</h2>
            <p>
              <strong>
                {new Date(visit.startAt).toLocaleTimeString(
                  en ? "en-GB" : "ko-KR",
                  {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}{" "}
                · {visit.party}
                {t("명", " people")}
              </strong>
            </p>
            <p>
              {t("확인번호", "Reference")} {visit.id.slice(0, 8).toUpperCase()}
            </p>
            {visit.recognition && <p>{visit.recognition}</p>}
            {visit.notice && <p role="status">{visit.notice}</p>}
            <div className={styles.actions}>
              {visit.state === "booked" && (
                <button
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void send("checkin")}
                >
                  {t("이곳에 도착했어요", "I have arrived")}
                </button>
              )}
              {visit.state === "checked_in" && (
                <>
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() =>
                      void send(
                        visit.service === "robot" ? "respond" : "handover",
                      )
                    }
                  >
                    {visit.service === "robot"
                      ? t("안내 시작", "Start guidance")
                      : t("직원 지원으로 연결", "Connect to staff")}
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => void send("handover")}
                  >
                    {t("직원 안내가 필요해요", "I need staff guidance")}
                  </button>
                </>
              )}
            </div>
            {visit.state === "handed_over" && (
              <p role="status">
                {t(
                  "같은 확인번호로 직원에게 전달했어요. 이 장소에서 기다려 주세요.",
                  "Your existing request was handed to staff. Please wait at this meeting point.",
                )}
              </p>
            )}
          </section>
        )}
        {visit?.state === "responding" && (
          <VisitResponse
            visit={visit}
            en={en}
            busy={busy}
            onComplete={() => void send("complete")}
            onHandover={() => void send("handover")}
          />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {visit && (
          <button className={styles.secondary} type="button" onClick={reset}>
            {t("화면 닫기 · 다음 이용자", "Close · next visitor")}
          </button>
        )}
        <p className={styles.demo}>
          {t(
            "시연 화면 · 실제 로봇 주행 미연결",
            "Prototype screen · no live robot navigation",
          )}
        </p>
      </main>
      <IdleGuard
        t={textOf(en ? "en" : "ko")}
        enabled={!!visit || !!reference}
        askSec={askSec}
        answerSec={answerSec}
        onTimeout={reset}
      />
    </FlowShell>
  );
}
