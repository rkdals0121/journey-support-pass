"use client";

import { CircleCheck, ConciergeBell, ScanLine, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "../../components/Sunflower";
import { RECEIPT_KEY, type ReceiptInfo } from "../RegisterFlow";

function readReceipt(): ReceiptInfo | null {
  try {
    const info = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? "null");
    return info && typeof info.receiptNo === "string" ? info : null;
  } catch {
    return null;
  }
}

export default function RegisterDonePage() {
  const [info, setInfo] = useState<ReceiptInfo | null | undefined>(undefined);

  useEffect(() => {
    setInfo(readReceipt());
  }, []);

  if (info === undefined) return <main className="page" />;

  if (!info) {
    return (
      <main className="page">
        <Brand />
        <div className="empty">
          <strong>등록 내용을 찾을 수 없습니다</strong>
          <p>이 화면을 닫았다가 다시 여셨다면 안내데스크에서 이름과 편명으로 찾아 드립니다.</p>
        </div>
        <Link className="btn btn-primary" href="/register">
          다시 등록하기
        </Link>
      </main>
    );
  }

  return (
    <main className="page">
      <Brand />
      <p className="success-head" style={{ marginTop: 22 }}>
        <CircleCheck size={26} aria-hidden="true" />
        등록을 마쳤습니다
      </p>
      <h1>안내데스크에서 이 화면을 보여 주세요</h1>

      <div className="ticket">
        <div className="ticket-top" aria-label={`접수 번호 ${info.receiptNo.split("").join(" ")}`}>
          <span className="ticket-label">접수 번호</span>
          <span className="ticket-no" aria-hidden="true">
            {info.receiptNo}
          </span>
        </div>
        <div className="ticket-tear" />
        <div className="ticket-bottom">
          <div>
            <small>이름</small>
            <b>{info.name}</b>
          </div>
          <div>
            <small>편명</small>
            <b className="num">{info.flightNo}</b>
          </div>
          <div>
            <small>도착지</small>
            <b>{info.destName}</b>
          </div>
          <div>
            <small>출발</small>
            <b>{info.when}</b>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="info-row">
          <span className="bubble">
            <ConciergeBell size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>안내데스크에서 패스를 받으세요</strong>
            <span>접수 번호를 보여 주시면 직원이 패스를 드립니다.</span>
          </div>
        </div>
        <div className="info-row">
          <span className="bubble bubble-sun">
            <ScanLine size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>패스를 보이는 곳에 두세요</strong>
            <span>공항 직원이 패스를 보고 먼저 도와드립니다.</span>
          </div>
        </div>
        <div className="info-row">
          <span className="bubble">
            <Timer size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>패스를 받지 않으면 24시간 뒤 삭제</strong>
            <span>등록 내용은 자동으로 지워집니다.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
