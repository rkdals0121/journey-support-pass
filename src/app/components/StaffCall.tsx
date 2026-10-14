"use client";

import { BellRing, CircleCheck, UserCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Text } from "@/lib/i18n";
import { useFocusTrap } from "./useFocusTrap";

type CallState = "waiting" | "accepted" | "done" | "cancelled";

interface Props {
  t: Text;
  /** 등록할 때 "직원을 부르고 싶습니다"를 고른 여객에게는 버튼을 크게 둔다. */
  big: boolean;
  /** 패스를 찍은 뒤라면 그 QR 값. 직원이 여객이 고른 항목을 보고 온다. */
  token: string | null;
  screen: "register" | "guide";
  /** 호출이 진행 중인지 알린다. 진행 중에는 키오스크가 처음 화면으로 돌아가지 않는다. */
  onActive?: (active: boolean) => void;
  /** 소리 안내를 켠 여객에게 상태가 바뀔 때 읽어 준다. */
  say?: (text: string) => void;
}

const POLL_MS = 3000;
const DONE_SHOW_MS = 4000;

/**
 * 「직원 부르기」. 키오스크의 모든 화면에서 같은 자리(오른쪽 위)에 있다.
 * 누르면 이 키오스크가 속한 구역의 직원 화면에 호출이 뜬다. 직원이 받으면 여기에 "오고 있습니다"로 바뀐다.
 */
export function StaffCall({ t, big, token, screen, onActive, say }: Props) {
  const [callId, setCallId] = useState<string | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef, open);
  const sayRef = useRef(say);
  sayRef.current = say;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const callIdRef = useRef(callId);
  callIdRef.current = callId;
  // 마지막으로 호출을 보낼 때 붙인 패스. 앞사람의 호출이 남은 키오스크에서 다음 사람이 누르면 다시 보내 패스를 바꾼다.
  const sentToken = useRef<string | null>(null);

  // 누른 직후 서버의 답을 기다리는 동안에도 "부르고 있습니다"로 보여준다. 눌렀는데 아무 설명 없이 멈춘 것처럼 보이면 안 된다.
  const shown: CallState | null = state ?? (busy && !error ? "waiting" : null);
  const active = state === "waiting" || state === "accepted";
  // 누른 직후 서버의 답을 기다리는 동안도 "부르는 중"으로 친다. 그사이에 키오스크가 처음 화면으로 돌아가지 않는다.
  const calling = active || shown === "waiting";
  useEffect(() => {
    onActiveRef.current?.(calling);
  }, [calling]);

  const title =
    state === "accepted" ? t.callAccepted : state === "done" ? t.callDone : error ? t.callFailed : t.callWaiting;
  const body = shown === "accepted" ? t.callAcceptedBody : shown === "waiting" ? t.callWaitingBody : "";

  // 상태가 바뀌면 읽어 준다.
  useEffect(() => {
    // 여객이 스스로 거둔 호출은 읽지 않는다. 창이 바로 닫히는데 "부르고 있습니다"라고 읽으면 틀린 말이 된다.
    if (open && state !== "cancelled" && (state || error)) sayRef.current?.(`${title}. ${body}`);
  }, [state, error, open, title, body]);

  // 직원이 받았는지, 끝냈는지 주기적으로 확인한다.
  useEffect(() => {
    if (!callId || !active) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      // 앞의 확인이 아직 오는 중이면 건너뛴다. 늦게 온 옛 답이 새 상태를 덮지 않게 한다.
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/kiosk/call/${callId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        // 그사이 여객이 거뒀거나 다른 호출로 바뀌었으면 이 답은 버린다.
        // 버리지 않으면 거둔 뒤에 "기다리는 중"이 돌아와 키오스크가 "부르는 중"에 갇힌다.
        if (callIdRef.current !== callId) return;
        setState((s) => (s === "waiting" || s === "accepted" ? data.state : s));
      } catch {
        // 한 번 못 읽은 것은 넘어간다. 다음 차례에 다시 읽는다.
      } finally {
        inFlight = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [callId, active]);

  // 끝난 호출은 잠시 보여준 뒤 치운다.
  useEffect(() => {
    if (state !== "done" && state !== "cancelled") return;
    const timer = setTimeout(
      () => {
        setCallId(null);
        setState(null);
        setOpen(false);
      },
      state === "done" ? DONE_SHOW_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const press = useCallback(async () => {
    setOpen(true);
    if (busy) return;
    // 이미 부른 상태에서 같은 사람이 다시 누르면 창만 연다. 다른 사람(다른 패스, 또는 패스 없이)이 누르면
    // 다시 보내 호출에 붙은 패스를 지금 누른 사람의 것으로 바꾼다(직원이 아직 받지 않았을 때만 바뀐다).
    if (active && token === sentToken.current) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/kiosk/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, screen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      sentToken.current = token;
      setCallId(data.id);
      setState(data.state);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [active, busy, token, screen]);

  const cancel = useCallback(async () => {
    if (!callId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/kiosk/call/${callId}`, { method: "DELETE" });
    } catch {
      // 못 거뒀으면 30분 뒤 서버가 스스로 닫는다.
    }
    setBusy(false);
    setState("cancelled");
  }, [callId]);

  const Icon = state === "accepted" ? UserCheck : BellRing;
  return (
    <>
      <button
        className={`call-btn ${big ? "call-big" : ""} ${active ? "call-active" : ""}`}
        onClick={press}
        aria-haspopup="dialog"
      >
        <Icon size={22} aria-hidden="true" />
        <span>{state === "accepted" ? t.callChipAccepted : state === "waiting" ? t.callChip : t.callStaff}</span>
      </button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            ref={boxRef}
            className="sheet-box call-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="call-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`call-badge ${state === "accepted" || state === "done" ? "ok" : ""} ${shown === "waiting" ? "pulse" : ""}`}>
              {state === "done" ? (
                <CircleCheck size={44} aria-hidden="true" />
              ) : state === "accepted" ? (
                <UserCheck size={44} aria-hidden="true" />
              ) : (
                <BellRing size={44} aria-hidden="true" />
              )}
            </span>
            <h2 id="call-title" aria-live="assertive">
              {title}
            </h2>
            {body && <p>{body}</p>}
            <div className="sheet-actions">
              <button ref={closeRef} className="btn btn-primary" onClick={() => setOpen(false)}>
                {shown === "waiting" || shown === "accepted" ? t.callKeep : t.close}
              </button>
              {active && (
                <button className="btn btn-ghost" onClick={cancel} disabled={busy}>
                  {t.callCancel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
