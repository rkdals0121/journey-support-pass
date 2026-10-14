"use client";

import { BellRing, CircleCheck, UserCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** 버튼을 누를 때마다 알린다. 키오스크가 지금 여객이 부른 호출인지 가려, 앞사람이 남기고 간 호출이 다음 여객의 자동 종료를 막지 않게 한다. */
  onPress?: () => void;
  /** 소리 안내를 켠 여객에게 상태가 바뀔 때 읽어 준다. */
  say?: (text: string) => void;
}

const POLL_MS = 3000;
// 상태 확인 한 번을 기다리는 가장 긴 시간. 약한 와이파이에서 답이 오지 않는 요청 하나 때문에
// 다음 확인이 모두 건너뛰어지면, 직원이 받고 끝내도 화면이 "부르고 있습니다"에 멈춘다.
const POLL_TIMEOUT_MS = 8000;
// 부르기·거두기 한 번을 기다리는 가장 긴 시간. 답이 오지 않는 요청 하나에 붙잡히면 화면이 "부르고 있습니다"에 멈추고
// 버튼도 다시 듣지 않으며, 처음 화면으로도 돌아가지 않아 앞사람의 항공편이 공용 화면에 남는다.
// 확인보다 조금 더 기다린다. 느리게라도 만들어진 호출을 "부르지 못했습니다"로 알리는 일을 줄인다.
const SEND_TIMEOUT_MS = 12_000;
const DONE_SHOW_MS = 4000;
// 키오스크 설치(로그인)가 풀려 서버가 401 로 답하면 설치 화면으로 보낸다. 이 기기로는 더 부를 수 없다.
const KIOSK_SETUP = "/kiosk";

/**
 * 「직원 부르기」. 키오스크의 모든 화면에서 같은 자리(오른쪽 위)에 있다.
 * 누르면 이 키오스크가 속한 구역의 직원 화면에 호출이 뜬다. 직원이 받으면 여기에 "오고 있습니다"로 바뀐다.
 */
export function StaffCall({ t, big, token, screen, onActive, onPress, say }: Props) {
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
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const callIdRef = useRef(callId);
  callIdRef.current = callId;
  // 마지막으로 호출을 보낼 때 붙인 패스. 앞사람의 호출이 남은 키오스크에서 다음 사람이 누르면 다시 보내 패스를 바꾼다.
  const sentToken = useRef<string | null>(null);
  // 보내는 중인 부르기·거두기 요청. 화면이 사라지면 끊는다. 더는 답을 쓸 곳이 없다.
  const sending = useRef(new Set<AbortController>());
  useEffect(() => {
    const live = sending.current;
    return () => live.forEach((c) => c.abort());
  }, []);

  // 누른 직후 서버의 답을 기다리는 동안에도 "부르고 있습니다"로 보여준다. 눌렀는데 아무 설명 없이 멈춘 것처럼 보이면 안 된다.
  const shown: CallState | null = state ?? (busy && !error ? "waiting" : null);
  const active = state === "waiting" || state === "accepted";
  // 누른 직후 서버의 답을 기다리는 동안도 "부르는 중"으로 친다. 그사이에 키오스크가 처음 화면으로 돌아가지 않는다.
  const calling = active || shown === "waiting";
  useEffect(() => {
    onActiveRef.current?.(calling);
  }, [calling]);

  // "부르지 못했습니다"는 열린 호출이 없을 때만 보인다. 열린 호출이 있으면 직원은 여전히 이 자리로 온다.
  const title =
    state === "accepted" ? t.callAccepted : state === "done" ? t.callDone : error && !active ? t.callFailed : t.callWaiting;
  const body = shown === "accepted" ? t.callAcceptedBody : shown === "waiting" ? t.callWaitingBody : "";

  // 창을 닫아 둔 사이에 바뀐 상태. 버튼 옆의 알림 칸에 넣어 화면 읽기 프로그램도 알려 주게 한다.
  const [news, setNews] = useState("");
  // 상태가 바뀌면 읽어 준다. 창을 닫아 두었어도 직원이 받았거나 끝냈으면 읽는다.
  // 화면을 보지 못하는 여객은 「기다리면서 계속 보기」로 창을 닫은 뒤에는 버튼 글이 바뀐 것을 알 수 없기 때문이다.
  const lastState = useRef<CallState | null>(state);
  useEffect(() => {
    const changed = lastState.current !== state;
    lastState.current = state;
    // 여객이 스스로 거둔 호출은 읽지 않는다. 창이 바로 닫히는데 "부르고 있습니다"라고 읽으면 틀린 말이 된다.
    if (state === "cancelled" || !(state || error)) return;
    if (open) {
      sayRef.current?.(`${title}. ${body}`);
    } else if (changed && (state === "accepted" || state === "done")) {
      sayRef.current?.(`${title}. ${body}`);
      setNews(`${title}. ${body}`);
    }
  }, [state, error, open, title, body]);

  // 직원이 받았는지, 끝냈는지 주기적으로 확인한다.
  useEffect(() => {
    if (!callId || !active) return;
    let inFlight = false;
    let ctrl: AbortController | null = null;
    const timer = setInterval(async () => {
      // 앞의 확인이 아직 오는 중이면 건너뛴다. 늦게 온 옛 답이 새 상태를 덮지 않게 한다.
      if (inFlight) return;
      inFlight = true;
      // 답이 오지 않는 요청은 끊는다. 끊지 않으면 그 뒤의 확인이 모두 건너뛰어진다.
      const mine = new AbortController();
      ctrl = mine;
      const limit = setTimeout(() => mine.abort(), POLL_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/kiosk/call/${callId}`, { cache: "no-store", signal: mine.signal });
        if (res.status === 401) return window.location.replace(KIOSK_SETUP);
        if (!res.ok) return;
        const data = await res.json();
        // 그사이 여객이 거뒀거나 다른 호출로 바뀌었으면 이 답은 버린다.
        // 버리지 않으면 거둔 뒤에 "기다리는 중"이 돌아와 키오스크가 "부르는 중"에 갇힌다.
        if (callIdRef.current !== callId) return;
        setState((s) => (s === "waiting" || s === "accepted" ? data.state : s));
      } catch {
        // 한 번 못 읽은 것(끊은 것 포함)은 넘어간다. 다음 차례에 다시 읽는다.
      } finally {
        clearTimeout(limit);
        inFlight = false;
      }
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      // 호출이 바뀌거나 끝나면 오는 중인 확인도 끊는다. 더는 쓸 데가 없다.
      ctrl?.abort();
    };
  }, [callId, active]);

  // 끝난 호출은 잠시 보여준 뒤 치운다.
  useEffect(() => {
    if (state !== "done" && state !== "cancelled") return;
    const timer = setTimeout(
      () => {
        setCallId(null);
        setState(null);
        setOpen(false);
        setNews("");
      },
      state === "done" ? DONE_SHOW_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const press = useCallback(async () => {
    // 이미 열린 호출의 창만 여는 경우에도 알린다. 앞사람이 남긴 호출을 다음 여객이 눌러 이어받으면 그 여객의 호출이 된다.
    onPressRef.current?.();
    setOpen(true);
    // 창을 열면 창이 알려 준다. 알림 칸의 지난 소식은 비워 둔다.
    setNews("");
    if (busy) return;
    // 이미 부른 상태에서 같은 사람이 다시 누르면 창만 연다. 다른 사람(다른 패스, 또는 패스 없이)이 누르면
    // 다시 보내 호출에 붙은 패스를 지금 누른 사람의 것으로 바꾼다(직원이 아직 받지 않았을 때만 바뀐다).
    if (active && token === sentToken.current) return;
    setBusy(true);
    setError(false);
    // 답이 오지 않으면 끊는다. 끊긴 것은 아래 catch 로 가서 "부르지 못했습니다"가 되고, 버튼과 자동 종료가 다시 돈다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
    sending.current.add(ctrl);
    try {
      const res = await fetch("/api/kiosk/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, screen }),
        signal: ctrl.signal,
      });
      if (res.status === 401) return window.location.replace(KIOSK_SETUP);
      const data = await res.json();
      if (!res.ok) throw new Error();
      sentToken.current = token;
      setCallId(data.id);
      setState(data.state);
    } catch {
      // 이미 열린 호출의 패스만 바꾸려다 못 한 것이면 실패로 알리지 않는다. 앞의 호출이 그대로 열려 있어
      // 직원은 이 자리로 온다. "안내데스크로 와 주세요"라고 하면 여객이 자리를 떠나 버린다. 다시 누르면 다시 바꿔 본다.
      if (!active) setError(true);
    } finally {
      clearTimeout(limit);
      sending.current.delete(ctrl);
      setBusy(false);
    }
  }, [active, busy, token, screen]);

  const cancel = useCallback(async () => {
    if (!callId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    // 답이 오지 않으면 끊고 거둔 것으로 친다. 끊지 않으면 버튼이 막힌 채 화면이 "부르고 있습니다"로 남는다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
    sending.current.add(ctrl);
    try {
      const res = await fetch(`/api/kiosk/call/${callId}`, { method: "DELETE", signal: ctrl.signal });
      if (res.status === 401) return window.location.replace(KIOSK_SETUP);
    } catch {
      // 못 거뒀으면(답이 없어 끊은 것 포함) 30분 뒤 서버가 스스로 닫는다.
    } finally {
      clearTimeout(limit);
      sending.current.delete(ctrl);
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
      <span className="sr-only" role="status">
        {news}
      </span>

      {/* 창은 문서의 맨 바깥(body 바로 아래)에 띄운다. 「직원 부르기」 줄(.call-dock) 안에 두면 그 줄의 겹침 순서에 갇혀,
          어둡게 덮는 막이 위쪽 줄(「이전·처음으로·설정」)을 덮지 못하고 그 버튼들이 창이 열린 채로 눌린다. */}
      {open && createPortal(
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
        </div>,
        document.body,
      )}
    </>
  );
}
