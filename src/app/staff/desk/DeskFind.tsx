"use client";

import { PlaneTakeoff, Printer, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GROUPS, itemsOf } from "@/lib/catalog";
import type { GuideDto } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { extractToken, formatPassNo, PASS_NO_LENGTH } from "@/lib/pass-format";
import { ErrorNote } from "../../components/Alert";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { closeText } from "../../components/GuideParts";
import { PassQr, Sticker } from "../../components/PassQr";
import { Scanner } from "../../components/Scanner";

const ko = textOf("ko");
// 패스 찾기·등록 지우기 한 번을 기다리는 가장 긴 시간(키오스크의 QR 확인과 같다). 약한 와이파이에서 답이 오지 않는 요청 하나에
// 붙잡히면 카메라가 「확인하는 중」으로 멈추고 「찾기」도 눌리지 않아, 화면을 새로 열기 전까지 어떤 여객의 패스도 찾지 못한다.
const DESK_TIMEOUT_MS = 15_000;
// 스티커의 QR 그림을 기다리는 가장 긴 시간(등록 키오스크와 같다). 그림은 따로 받아 오는 조각(qrcode)으로 그려서,
// 약한 와이파이에서는 패스를 찾은 뒤에도 QR 칸이 한참 비어 있을 수 있다. 이만큼 기다려도 없으면 더 붙잡지 않는다.
// 다시 누르면 그 조각을 새로 받아 다시 그린다(아래 qrTry). 한 번 받지 못한 그림은 저절로 다시 받지 않는다.
const STICKER_WAIT_MS = 10_000;

/**
 * 여객이 보여 준 QR 을 찍거나 불러 준 번호를 넣어 패스를 찾는다.
 * 찾은 패스는 스티커로 다시 뽑거나, 여객이 원하면 지운다. 이름으로는 찾을 수 없다(이름을 받지 않는다).
 */
export function DeskFind() {
  const [found, setFound] = useState<{ token: string; guide: GuideDto } | null>(null);
  const [passNo, setPassNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 패스를 찾으면 「찾은 패스」로, 닫거나 지우면 번호 칸으로 초점을 옮긴다. 누른 단추가 사라져 초점이 빠지지 않게 한다.
  const foundRef = useRef<HTMLElement>(null);
  const hadFound = useRef(false);
  useEffect(() => {
    if (found) foundRef.current?.focus();
    else if (hadFound.current && (!document.activeElement || document.activeElement === document.body)) {
      document.getElementById("desk-pass-no")?.focus();
    }
    hadFound.current = found !== null;
  }, [found]);
  // 방금 지운 패스. 지운 뒤 잠시 그 QR 을 다시 읽지 않는다(위 onScan).
  const justErased = useRef<{ token: string; at: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const busyRef = useRef(false);
  // QR 그림을 다시 받아 그린 횟수. 스티커와 화면의 QR 은 그림 조각(qrcode)을 처음 그릴 때 한 번만 받아서, 약한 와이파이에서 한 번
  // 받지 못하면 그 칸은 계속 빈다. 그러면 「스티커 뽑기」를 몇 번 눌러도 매번 기다리다 같은 오류만 뜨고, 패스를 닫았다 다시 찾아야만 풀린다.
  // 그래서 그림이 없을 때 누르면 이 수를 올려 두 QR 을 새로 그린다(key). 그때 조각도 다시 받는다. 아직 받는 중이었으면 그것을 그대로 기다린다.
  const [qrTry, setQrTry] = useState(0);

  // QR 그림을 그리는 조각(qrcode)을 화면을 열 때 미리 받아 둔다. 패스를 찾은 뒤에야 받기 시작하면 스티커의 QR 칸이 한참 비어 있다.
  // 받지 못해도 여기서는 알리지 않는다(QR 을 그릴 때 다시 받는다).
  useEffect(() => {
    import("qrcode").catch(() => {});
  }, []);

  const open = useCallback(async (body: { scanned: string } | { passNo: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    // 답이 오지 않는 요청은 끊는다. 끊긴 것은 catch 로 가서 연결 오류로 알리고, 카메라와 「찾기」가 다시 풀린다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), DESK_TIMEOUT_MS);
    try {
      const res = await fetch("/api/kiosk/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      // 로그인이 풀렸으면 오류만 띄우지 않고 로그인 화면으로 보낸다. 다시 해 봐도 되지 않는다.
      if (res.status === 401) return window.location.replace("/staff/login");
      const data = await res.json();
      if (!res.ok) {
        // 없는 번호였으면 입력칸을 비운다. 틀린 번호를 지우지 않고 바로 다시 칠 수 있다.
        if (res.status === 404) setPassNo("");
        return setError(data.error ?? "패스를 찾지 못했습니다");
      }
      setFound({ token: data.token, guide: data.guide });
      setPassNo("");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 해 주세요.");
    } finally {
      clearTimeout(limit);
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const onScan = useCallback(
    (text: string) => {
      const scanned = extractToken(text);
      if (!scanned) return setError("QR은 읽었지만 Journey Support Pass의 QR이 아닙니다.");
      // 방금 지운 QR 이 아직 카메라 앞에 있으면 다시 찾지 않는다. 찾으면 "등록을 지웠습니다" 알림이 "사용이 끝난 패스" 오류로 바뀐다.
      const gone = justErased.current;
      if (gone && gone.token === scanned && Date.now() - gone.at < 10_000) return;
      void open({ scanned: text });
    },
    [open],
  );

  async function erase() {
    // 「지우기」를 빠르게 두 번 눌러도 한 번만 보낸다(단추가 막히기 전에 두 번째 누름이 들어올 수 있다).
    if (!found || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // 지우기도 답이 오지 않으면 끊는다. 끊지 않으면 묻는 창의 두 단추가 몇 분씩 눌리지 않고, 실패했다는 말도 없다.
    // 끊겼어도 서버는 이미 지웠을 수 있다. 그래도 "다시 해 주세요"가 맞다. 이미 지운 패스를 다시 지우면 서버는 지웠다고 답한다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), DESK_TIMEOUT_MS);
    try {
      const res = await fetch("/api/desk/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: found.token }),
        signal: ctrl.signal,
      });
      // 로그인이 풀렸으면 "지우지 못했습니다"만 띄우지 않고 로그인 화면으로 보낸다. 다시 해 봐도 되지 않는다.
      if (res.status === 401) return window.location.replace("/staff/login");
      if (!res.ok) throw new Error();
      justErased.current = { token: found.token.toUpperCase(), at: Date.now() };
      setFound(null);
      setNotice("등록을 지웠습니다. 그 QR과 고유 일련 번호는 더 쓸 수 없습니다.");
    } catch {
      setError("지우지 못했습니다. 잠시 후 다시 해 주세요.");
    } finally {
      clearTimeout(limit);
      busyRef.current = false;
      setBusy(false);
      setAsking(false);
    }
  }

  if (found) {
    const g = found.guide;
    const picked = GROUPS.flatMap((x) => itemsOf(x)).filter((i) => g.choices.includes(i.code));
    return (
      <div className="panel desk-found">
        <div className="desk-found-head">
          <strong ref={foundRef} tabIndex={-1}>
            찾은 패스
          </strong>
          <button
            className="icon-btn"
            onClick={() => {
              // 지우기에 실패한 알림도 함께 지운다. 남기면 다음 여객을 찾는 화면 위에 "지우지 못했습니다"가 그대로 보인다.
              setFound(null);
              setError(null);
            }}
            aria-label="닫기"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <PassQr key={`qr-${qrTry}`} token={found.token} passNo={g.passNo} label="고유 일련 번호" />
        <p className="call-flight">
          <PlaneTakeoff size={18} aria-hidden="true" />
          <b className="num">{g.flight.flightNo}</b> {g.flight.destName} · 탑승구 <b className="num">{g.flight.gate ?? "미정"}</b>
          <span className="call-close">{closeText(g.flight, ko)}</span>
        </p>
        <ul className="chips" aria-label="여객이 고른 항목">
          {g.lang === "en" && <li className="chip chip-sun">영어 사용</li>}
          {picked.map((i) => (
            <li key={i.code} className="chip">
              {i.short}
            </li>
          ))}
          {picked.length === 0 && <li className="chip">고른 항목 없음</li>}
        </ul>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrintSticker onRedraw={() => setQrTry((n) => n + 1)} />
        <button className="btn btn-ghost btn-danger-text" onClick={() => setAsking(true)}>
          <Trash2 size={20} aria-hidden="true" />
          등록 지우기
        </button>
        <Sticker key={`sticker-${qrTry}`} token={found.token} passNo={g.passNo} />
        {asking && (
          <ConfirmSheet
            title="이 등록을 지울까요?"
            body={`고유 일련 번호 ${formatPassNo(g.passNo)}의 항공편과 고른 항목을 지웁니다. 여객이 지워 달라고 했을 때만 지워 주세요. 되돌릴 수 없습니다.`}
            confirmLabel="지우기"
            busy={busy}
            onConfirm={erase}
            // 지우는 중에는 바깥을 눌러도 Esc 를 눌러도 닫지 않는다. 닫히면 그만둔 줄 알지만 지우기는 그대로 간다.
            onCancel={() => {
              if (!busy) setAsking(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="muted">여객이 보여 준 QR을 찍거나, 불러 준 고유 일련 번호 여섯 자리를 넣어 주세요.</p>
      {notice && (
        <p className="banner" role="status">
          <span>{notice}</span>
        </p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Scanner
        onScan={onScan}
        paused={busy}
        prefer="environment"
        text={{ starting: ko.camStarting, ready: ko.camReady, read: ko.camRead, none: "이 기기에서는 카메라를 쓸 수 없습니다. 고유 일련 번호를 넣어 주세요.", switchCamera: ko.camSwitch }}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (passNo.length === PASS_NO_LENGTH) void open({ passNo });
        }}
      >
        <label htmlFor="desk-pass-no">고유 일련 번호 여섯 자리</label>
        <div className="row">
          <input
            id="desk-pass-no"
            className="input-code"
            type="text"
            inputMode="numeric"
            maxLength={PASS_NO_LENGTH + 1}
            autoComplete="off"
            placeholder="000 000"
            value={formatPassNo(passNo)}
            onChange={(e) => setPassNo(e.target.value.replace(/\D/g, "").slice(0, PASS_NO_LENGTH))}
          />
          <button className="btn btn-primary btn-inline" disabled={passNo.length !== PASS_NO_LENGTH || busy}>
            찾기
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * 「스티커 뽑기」. 스티커는 QR 그림이 실제로 그려진 뒤에 뽑는다. 그림이 없을 때 뽑으면 QR 칸이 빈 스티커가 나온다.
 * 그림을 기다리는 동안은 단추를 막아 둔다. 오래 기다려도 그려지지 않으면 뽑지 않고 단추를 다시 풀어, 잠시 뒤 다시 누르라고 띄운다.
 * 그림이 없을 때 누르면 onRedraw 로 QR 을 새로 그리게 한다(DeskFind 의 qrTry). 그래야 한 번 받지 못한 그림도 다시 누르면 다시 받는다.
 * QR 칸이 빈 스티커는 안내 키오스크에서 찍을 수 없어 한 장만 버린다.
 * 찾은 패스를 닫거나 지우면 이 단추도 사라지고, 기다리던 인쇄도 함께 거둬진다.
 */
function PrintSticker({ onRedraw }: { onRedraw: () => void }) {
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const until = Date.now() + STICKER_WAIT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const drawn = stickerDrawn();
      if (!drawn && Date.now() < until) {
        timer = setTimeout(check, 100);
        return;
      }
      setWaiting(false);
      if (!drawn) return setFailed(true);
      window.print();
    };
    check();
    return () => clearTimeout(timer);
  }, [waiting]);
  return (
    <>
      {failed && <ErrorNote>{ko.stickerQrFail}</ErrorNote>}
      <button
        className="btn btn-primary"
        disabled={waiting}
        aria-busy={waiting}
        onClick={() => {
          setFailed(false);
          if (stickerDrawn()) return window.print();
          onRedraw();
          setWaiting(true);
        }}
      >
        <Printer size={20} aria-hidden="true" />
        스티커 뽑기
      </button>
    </>
  );
}

/** 인쇄될 스티커(PassQr 의 Sticker)에 QR 그림이 실제로 들어가 있는지. */
function stickerDrawn(): boolean {
  return document.querySelector(".sticker-qr svg") !== null;
}
