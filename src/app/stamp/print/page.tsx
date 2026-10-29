"use client";

import { useEffect, useState } from "react";
import { AREA_LABEL, CHECKPOINTS, checkpointUrl } from "@/lib/stamp-book";
import "../stamp.css";

// 체크포인트(안내로봇 미팅포인트 겸용) 거점에 붙일 QR 인쇄물. 모두 에어사이드(출국심사 뒤)에 붙인다.
export default function PrintPage() {
  const [qrs, setQrs] = useState<string[]>([]);
  useEffect(() => {
    import("qrcode").then((m) =>
      Promise.all(CHECKPOINTS.map((_, i) => m.default.toString(checkpointUrl(window.location.origin, i), { type: "svg", errorCorrectionLevel: "M", margin: 2 }))).then(setQrs),
    );
  }, []);
  return (
    <main className="sb-print">
      <div className="sb-print-hide">
        <h1>스탬프북 체크포인트 QR</h1>
        <p>거점마다 하나씩 붙입니다. 휴대전화 기본 카메라로 찍어도 스탬프북이 열려 도장이 찍힙니다. 아래 세 글자는 카메라가 안 될 때 손으로 누르는 번호입니다.</p>
        <button type="button" className="sb-btn" style={{ background: "var(--color-blue)", color: "var(--color-surface)", marginBottom: "1rem" }} onClick={() => window.print()}>인쇄하기</button>
      </div>
      <div className="sb-print-grid">
        {CHECKPOINTS.map((c, i) => (
          <section key={c.code} className="sb-print-card">
            <strong>{AREA_LABEL[c.area]} 체크포인트</strong>
            <div className="qr" role="img" aria-label={`${c.code} 체크포인트 QR`} dangerouslySetInnerHTML={{ __html: qrs[i] ?? "" }} />
            <span className="sb-print-no">{c.code}</span>
            <small>{c.place}</small>
            <span className="sb-print-meet">안내로봇 미팅포인트</span>
          </section>
        ))}
      </div>
    </main>
  );
}
