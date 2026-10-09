"use client";

import { PlaneTakeoff, Printer, Trash2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
  const [asking, setAsking] = useState(false);
  const busyRef = useRef(false);

  const open = useCallback(async (body: { scanned: string } | { passNo: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/kiosk/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const onScan = useCallback(
    (text: string) => {
      if (!extractToken(text)) return setError("QR은 읽었지만 Journey Support Pass의 QR이 아닙니다.");
      void open({ scanned: text });
    },
    [open],
  );

  async function erase() {
    if (!found) return;
    setBusy(true);
    try {
      const res = await fetch("/api/desk/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: found.token }),
      });
      if (!res.ok) throw new Error();
      setFound(null);
      setNotice("등록을 지웠습니다. 그 QR과 번호는 더 쓸 수 없습니다.");
    } catch {
      setError("지우지 못했습니다. 잠시 후 다시 해 주세요.");
    } finally {
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
          <strong>찾은 패스</strong>
          <button className="icon-btn" onClick={() => setFound(null)} aria-label="닫기">
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <PassQr token={found.token} passNo={g.passNo} label="패스 번호" />
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
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={20} aria-hidden="true" />
          스티커 뽑기
        </button>
        <button className="btn btn-ghost btn-danger-text" onClick={() => setAsking(true)}>
          <Trash2 size={20} aria-hidden="true" />
          등록 지우기
        </button>
        <Sticker token={found.token} passNo={g.passNo} />
        {asking && (
          <ConfirmSheet
            title="이 등록을 지울까요?"
            body={`패스 ${formatPassNo(g.passNo)} 의 항공편과 고른 항목을 지웁니다. 여객이 지워 달라고 했을 때만 지워 주세요. 되돌릴 수 없습니다.`}
            confirmLabel="지우기"
            busy={busy}
            onConfirm={erase}
            onCancel={() => setAsking(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="muted">여객이 보여 준 QR을 찍거나, 불러 준 번호 여섯 자리를 넣어 주세요.</p>
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
        text={{ starting: ko.camStarting, ready: ko.camReady, read: ko.camRead, none: "이 기기에서는 카메라를 쓸 수 없습니다. 번호를 넣어 주세요.", switchCamera: ko.camSwitch }}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (passNo.length === PASS_NO_LENGTH) void open({ passNo });
        }}
      >
        <label htmlFor="desk-pass-no">패스 번호 여섯 자리</label>
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
