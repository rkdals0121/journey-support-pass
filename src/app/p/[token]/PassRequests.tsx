"use client";
import { useEffect, useState } from "react";
import {
  requestStateLabel,
  SERVICE_LABEL,
  SERVICE_EN,
  type ServiceType,
  type RequestState,
} from "@/lib/service-request-model";
type Progress = {
  service: ServiceType;
  state: RequestState;
  createdAt: string;
  updatedAt: string;
};
export function PassRequests({
  token,
  lang,
}: {
  token: string;
  lang: "ko" | "en";
}) {
  const [rows, setRows] = useState<Progress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let loading = false;
    let ctrl: AbortController | null = null;
    const load = async () => {
      if (loading || document.hidden) return;
      loading = true;
      ctrl = new AbortController();
      const timer = setTimeout(() => ctrl?.abort(), 10000);
      try {
        const r = await fetch("/api/pass/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error();
        if (live) {
          setRows(data.requests);
          setLoaded(true);
          setError(false);
        }
      } catch {
        if (live) setError(true);
      } finally {
        loading = false;
        clearTimeout(timer);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      clearInterval(timer);
      ctrl?.abort();
      window.removeEventListener("focus", focus);
    };
  }, [token]);
  if (!rows.length)
    return error ? (
      <p role="status">
        {lang === "en"
          ? "Could not refresh assistance status. Check your connection."
          : "도움 요청 상태를 확인하지 못했습니다. 연결을 확인해 주세요."}
      </p>
    ) : !loaded ? (
      <p role="status">
        {lang === "en"
          ? "Checking assistance requests…"
          : "도움 요청 내역 확인 중…"}
      </p>
    ) : null;
  return (
    <section className="dx-card">
      <h2>
        {lang === "en"
          ? "Assistance requests linked to my registration"
          : "내 등록에 연결된 도움 요청"}
      </h2>
      {error && (
        <p role="status">
          {lang === "en"
            ? "Showing the last received status. Reconnecting…"
            : "마지막으로 받은 상태입니다. 연결을 확인하고 있어요."}
        </p>
      )}
      <ul>
        {rows.map((r, i) => (
          <li key={`${r.createdAt}-${i}`}>
            <strong>
              {lang === "en" ? SERVICE_EN[r.service] : SERVICE_LABEL[r.service]}
            </strong>{" "}
            · {requestStateLabel(r, lang)}
            <br />
            <small>
              {new Date(r.updatedAt).toLocaleString(
                lang === "en" ? "en-GB" : "ko-KR",
              )}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
