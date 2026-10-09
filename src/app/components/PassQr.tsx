"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatPassNo, passUrl } from "@/lib/pass-format";

/** 패스의 QR 그림(SVG 글자). 주소만 담는다. 항공편이나 고른 항목은 들어가지 않는다. */
export function usePassQr(token: string | null, ready = ""): string {
  const [svg, setSvg] = useState(ready);
  useEffect(() => {
    // 서버가 미리 그려 준 것이 있으면 그대로 쓴다.
    if (ready) return;
    if (!token) {
      setSvg("");
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then((m) =>
        // 오류 정정은 M(15%). 스티커가 조금 구겨지거나 가려져도 읽힌다. 둘레 여백 4칸은 규격이 정한 최소다.
        m.default.toString(passUrl(window.location.origin, token), { type: "svg", errorCorrectionLevel: "M", margin: 4 }),
      )
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [token, ready]);
  return svg;
}

/**
 * 화면에 보여주는 패스. QR 과 번호.
 * svg 를 주면 그 그림을 바로 쓴다. 여객 휴대전화의 패스 화면은 서버가 QR 을 미리 그려 보내서, 느린 휴대전화에서도 열자마자 QR 이 보인다.
 */
export function PassQr({ token, passNo, label, svg: ready }: { token: string; passNo: string; label: string; svg?: string }) {
  const svg = usePassQr(token, ready);
  return (
    <div className="pass-qr" aria-label={`${label} ${passNo.split("").join(" ")}`}>
      <div className="pass-qr-code" role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="pass-qr-label">{label}</span>
      <span className="pass-qr-no num" aria-hidden="true">
        {formatPassNo(passNo)}
      </span>
    </div>
  );
}

/**
 * 스티커로 인쇄되는 부분. 화면에는 보이지 않고 인쇄할 때만 나온다.
 * 제안서대로 QR 과 번호만 찍는다. 항공편이나 고른 항목은 찍지 않는다.
 * 문서의 맨 바깥(body 바로 아래)에 둔다. 인쇄할 때는 이것만 남기고 나머지를 통째로 감추면 되므로,
 * 어느 화면에서 뽑든 그 화면의 배치에 영향을 받지 않고 늘 한 쪽에 같은 모양으로 나온다.
 */
export function Sticker({ token, passNo }: { token: string; passNo: string }) {
  const svg = usePassQr(token);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="sticker" aria-hidden="true">
      <div className="sticker-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="sticker-no">{formatPassNo(passNo)}</div>
    </div>,
    document.body,
  );
}
