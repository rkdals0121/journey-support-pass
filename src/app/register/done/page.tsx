"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RECEIPT_KEY } from "../RegisterFlow";

export default function RegisterDonePage() {
  const [receiptNo, setReceiptNo] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setReceiptNo(sessionStorage.getItem(RECEIPT_KEY));
  }, []);

  if (receiptNo === undefined) return <main className="page" />;

  if (!receiptNo) {
    return (
      <main className="page">
        <h1>등록 내용을 찾을 수 없습니다</h1>
        <p className="muted">이 화면을 닫았다가 다시 여셨다면 안내데스크에서 도와드립니다.</p>
        <Link className="btn btn-primary" href="/register">
          다시 등록하기
        </Link>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>등록을 마쳤습니다</h1>
      <p>안내데스크에서 이 화면을 보여 주세요.</p>
      <div className="receipt" aria-label={`접수 번호 ${receiptNo.split("").join(" ")}`}>
        <span className="receipt-label">접수 번호</span>
        <span className="receipt-no">{receiptNo}</span>
      </div>
      <p className="muted">안내데스크에서 패스를 받으시면 공항 직원이 패스를 보고 먼저 도와드립니다.</p>
      <p className="muted small">패스를 받지 않으면 등록 내용은 24시간 뒤에 삭제됩니다.</p>
    </main>
  );
}
