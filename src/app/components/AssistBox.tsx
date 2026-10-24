"use client";

import { CarFront, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Text } from "@/lib/i18n";

interface AssistDto {
  state: "received" | "assigned" | "moving" | "done" | "cancelled";
  time: string;
  place: string;
}
const OPEN = ["received", "assigned", "moving"];
const POLL_MS = 10_000;

async function post(url: string, token: string) {
  const ctrl = new AbortController();
  const limit = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: ctrl.signal });
    return { ok: res.ok, body: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(limit);
  }
}

/** 휴대전화 패스 화면의 이동지원(전동차) 요청과 접수 상태. 끝나지 않은 요청이 있으면 10초마다 다시 본다. */
export function AssistBox({ token, t }: { token: string; t: Text }) {
  const [req, setReq] = useState<AssistDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (url = "/api/assist/status") => {
    try {
      const res = await post(url, token);
      if (res.ok) {
        setReq(res.body.request ?? null);
        setError(false);
      } else setError(true);
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);
  const open = req !== null && OPEN.includes(req.state);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  const act = async (url: string) => {
    setBusy(true);
    await load(url);
    setBusy(false);
  };

  return (
    <section className="assist-box" aria-label={t.assistTitle}>
      <h2>
        <CarFront size={22} aria-hidden="true" /> {t.assistTitle}
      </h2>
      {req && (
        <p className="assist-state" role="status">
          <strong>{t.assistState[req.state]}</strong>
          <span>{t.assistStateBody[req.state]}</span>
          <span className="muted">{t.assistAt(req.time, req.place)}</span>
        </p>
      )}
      {error && <p className="muted">{t.offline}</p>}
      {open ? (
        (req!.state === "received" || req!.state === "assigned") && (
          <button className="btn btn-ghost" onClick={() => void act("/api/assist/cancel")} disabled={busy}>
            <X size={20} aria-hidden="true" />
            {t.assistCancel}
          </button>
        )
      ) : (
        <button className="btn" onClick={() => void act("/api/assist")} disabled={busy} aria-busy={busy}>
          <CarFront size={20} aria-hidden="true" />
          {t.svcAssist}
        </button>
      )}
    </section>
  );
}
