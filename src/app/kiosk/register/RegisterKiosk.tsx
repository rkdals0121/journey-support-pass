"use client";
import { useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { type Prefs } from "@/lib/catalog";
import { textOf, type Lang } from "@/lib/i18n";
import { RegisterFlow } from "../../components/RegisterFlow";
import { Scanner } from "../../components/Scanner";
import { FlowShell } from "../../components/FlowShell";
import { IdleGuard } from "../../components/IdleGuard";
import { ErrorNote } from "../../components/Alert";
const BASE: Prefs = {
  large: false,
  voice: false,
  picture: false,
  easy: false,
  slow: false,
  wantsStaff: false,
};

/** Staff-assisted registration. Existing boarding codes are linked; no separate code or sticker is issued. */
export function RegisterKiosk({
  placeLabel,
  placeLabelEn,
  assisted = false,
  idleAskSec,
  idleAnswerSec,
}: {
  placeLabel: string;
  placeLabelEn: string;
  assisted?: boolean;
  idleAskSec: number;
  idleAnswerSec: number;
}) {
  const [view, setView] = useState<"start" | "form" | "link">("start");
  const [lang, setLang] = useState<Lang>("ko"),
    [prefs, setPrefs] = useState(BASE);
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [linked, setLinked] = useState(false),
    [error, setError] = useState("");
  const en = lang === "en",
    t = textOf(lang, prefs.easy);
  function reset(l: Lang = lang) {
    setLang(l);
    setToken("");
    setLinked(false);
    setBusy(false);
    setError("");
    setPrefs(BASE);
    setView("start");
  }
  async function link(scanned: string) {
    if (busy || !token) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pass/boarding-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, scanned }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          en
            ? "Could not link this boarding pass. Check the flight and date."
            : data.error,
        );
        return;
      }
      setLinked(true);
    } catch {
      setError(
        en
          ? "Connection failed. Try again."
          : "연결하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!assisted)
    return (
      <main className="page">
        <Link className="btn btn-primary" href="/kiosk/entry">
          탑승권으로 현장 등록하기
        </Link>
      </main>
    );
  return (
    <>
      <IdleGuard
        t={t}
        enabled={view !== "start"}
        askSec={idleAskSec}
        answerSec={idleAnswerSec}
        onTimeout={() => reset()}
      />
      {view === "form" ? (
        <RegisterFlow
          mode="assisted"
          initialLang={lang}
          onExit={reset}
          onPrefs={(l, p) => {
            setLang(l);
            setPrefs(p);
          }}
          onDone={(r) => {
            setLang(r.lang);
            setToken(r.token);
            setView("link");
          }}
        />
      ) : (
        <FlowShell
          lang={lang}
          prefs={prefs}
          kiosk
          screenKey={view}
          speakText={view === "link" ? "지원등록 완료" : "지원등록"}
          onHome={() => reset()}
          cta={
            view === "start" ? (
              <button
                className="btn btn-primary"
                onClick={() => setView("form")}
              >
                {en ? "Start registration" : "대신 등록 시작"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => reset()}
                disabled={busy}
              >
                {en ? "Finish" : "완료"}
              </button>
            )
          }
        >
          {view === "start" ? (
            <>
              <p className="kicker">{en ? placeLabelEn : placeLabel}</p>
              <h1>{en ? "Register support needs" : "지원정보 대신 등록"}</h1>
              <p className="lead">
                {en
                  ? "Save the passenger's needs, then link their existing boarding pass."
                  : "필요한 도움을 저장한 뒤 여객의 기존 탑승권에 연결합니다."}
              </p>
              <Link className="btn" href="/staff/desk">
                {en ? "Back to desk" : "안내데스크로"}
              </Link>
            </>
          ) : (
            <>
              <p className="success-head">
                <CircleCheck aria-hidden="true" />
                {en ? "Support needs saved" : "지원정보 저장 완료"}
              </p>
              <h1>
                {linked
                  ? en
                    ? "Boarding pass linked"
                    : "기존 탑승권 연결 완료"
                  : en
                    ? "Link existing boarding pass"
                    : "기존 탑승권 연결"}
              </h1>
              <p className="lead">
                {en
                  ? "Use the QR or barcode already on the boarding pass. No extra code or sticker is needed."
                  : "탑승권에 있는 QR·바코드를 사용합니다. 별도 QR이나 스티커는 발급하지 않습니다."}
              </p>
              {!linked && (
                <Scanner
                  paused={busy}
                  onScan={(v) => void link(v)}
                  text={{
                    starting: en ? "Starting camera…" : "카메라를 켜는 중…",
                    ready: en
                      ? "Show the boarding code"
                      : "탑승권 코드를 보여 주세요",
                    read: en ? "Linking…" : "연결 중…",
                    none: en
                      ? "Use a boarding pass image."
                      : "카메라를 사용할 수 없으면 탑승권 이미지를 선택해 주세요.",
                    switchCamera: en ? "Switch camera" : "카메라 전환",
                  }}
                />
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
            </>
          )}
        </FlowShell>
      )}
    </>
  );
}
