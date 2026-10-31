"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { VISIT_STORAGE } from "./VisitForm";
import { VISIT_STATES, hubOf, type VisitView } from "@/lib/service-hubs";
import { VISIT_STATE_EN } from "@/lib/visit-labels";
import styles from "../components/support-journey.module.css";
export function SavedVisits({ en = false }: { en?: boolean }) {
  const [rows, setRows] = useState<{ receipt: string; visit: VisitView }[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      let saved: { receipt: string; until: number }[] = [];
      try {
        const raw = JSON.parse(localStorage.getItem(VISIT_STORAGE) ?? "[]");
        if (Array.isArray(raw))
          saved = raw
            .filter(
              (x) => /^[a-f0-9]{64}$/.test(x?.receipt) && x.until > Date.now(),
            )
            .slice(0, 10);
      } catch {
        return;
      }
      const outcomes = await Promise.allSettled(
        saved.map(async (item) => {
          const r = await fetch("/api/visits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(10000)]),
            body: JSON.stringify({ action: "status", receipt: item.receipt }),
          });
          const b = await r.json();
          return r.ok
            ? { receipt: item.receipt, visit: b.visit as VisitView }
            : null;
        }),
      );
      if (!ctrl.signal.aborted)
        setRows(
          outcomes.flatMap((r) =>
            r.status === "fulfilled" && r.value ? [r.value] : [],
          ),
        );
    }
    void load();
    return () => ctrl.abort();
  }, []);
  if (!rows.length) return null;
  return (
    <section className="service-info-card">
      <header className="service-info-heading">
        <span className="service-info-icon">
          <CalendarClock aria-hidden="true" />
        </span>
        <h2>{en ? "Appointments saved on this device" : "이 기기의 예약"}</h2>
      </header>
      <ul className={styles.list}>
        {rows.map(({ receipt, visit }) => (
          <li key={receipt}>
            <span className={styles.badge}>
              {en ? VISIT_STATE_EN[visit.state] : VISIT_STATES[visit.state]}
            </span>
            <p>
              {en ? hubOf(visit.hubId)?.en : hubOf(visit.hubId)?.label} ·{" "}
              {new Date(visit.startAt).toLocaleString(en ? "en-GB" : "ko-KR", {
                timeZone: "Asia/Seoul",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <Link
              className={styles.link}
              href={`/visits/${receipt}${en ? "?lang=en" : ""}`}
            >
              {en ? "View or change appointment" : "예약 확인·변경"} →
            </Link>
          </li>
        ))}
      </ul>
      <button
        className={styles.secondary}
        onClick={() => {
          if (
            !confirm(
              en
                ? "Forget the links on this device? Bookings will not be cancelled."
                : "이 기기의 예약 링크를 지울까요? 실제 예약은 취소되지 않습니다.",
            )
          )
            return;
          try {
            localStorage.removeItem(VISIT_STORAGE);
          } catch {
            /* Nothing retained. */
          }
          setRows([]);
        }}
      >
        {en ? "Forget links on this device" : "이 기기의 예약 링크 지우기"}
      </button>
    </section>
  );
}
