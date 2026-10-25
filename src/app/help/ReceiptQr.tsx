"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
export function ReceiptQr({ receipt, en }: { receipt: string; en: boolean }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const url = new URL(`/help/receipt/${receipt}`, window.location.origin)
      .href;
    void QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((data) => {
        if (active) setSrc(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [receipt]);
  return (
    <section className="dx-receipt">
      <h3>
        {en
          ? "Follow this request on your phone"
          : "휴대전화에서 요청 상태 확인"}
      </h3>
      <p>
        {en
          ? "Scan this QR before leaving the shared screen. Do not share it with others."
          : "공용 화면을 떠나기 전에 QR을 찍어 주세요. 이 QR을 가진 사람은 요청을 볼 수 있으므로 다른 사람에게 공유하지 마세요."}
      </p>
      {src /* A locally generated data URL, no remote image request. */ && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          width={220}
          height={220}
          alt={
            en
              ? "QR to open this request on your phone"
              : "이 요청을 휴대전화에서 여는 QR"
          }
        />
      )}
      {error && (
        <p role="alert">
          {en
            ? "QR could not be displayed. Ask staff to check the request."
            : "QR을 표시하지 못했습니다. 직원에게 요청 확인을 부탁해 주세요."}
        </p>
      )}
    </section>
  );
}
