"use client";

import { CircleCheck, ConciergeBell, ScanLine, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { langOf, TEXT } from "@/lib/i18n";
import { Banner } from "../../components/Alert";
import { Brand } from "../../components/Sunflower";
import { RECEIPT_KEY, type ReceiptInfo } from "../RegisterFlow";

function readReceipt(): ReceiptInfo | null {
  try {
    const info = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? "null");
    return info && typeof info.receiptNo === "string" ? { ...info, lang: langOf(info.lang) } : null;
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
    const t = TEXT.ko;
    return (
      <main className="page">
        <Brand />
        <div className="empty">
          <strong>{t.lostTitle}</strong>
          <p>{t.lostBody}</p>
        </div>
        <Link className="btn btn-primary" href="/register">
          {t.again}
        </Link>
      </main>
    );
  }

  const t = TEXT[info.lang];
  return (
    <main className="page" lang={info.lang}>
      <Brand />
      <p className="success-head" style={{ marginTop: 22 }}>
        <CircleCheck size={26} aria-hidden="true" />
        {t.doneHead}
      </p>
      <h1>{t.doneTitle}</h1>

      <div className="ticket">
        <div className="ticket-top" aria-label={`${t.receipt} ${info.receiptNo.split("").join(" ")}`}>
          <span className="ticket-label">{t.receipt}</span>
          <span className="ticket-no" aria-hidden="true">
            {info.receiptNo}
          </span>
        </div>
        <div className="ticket-tear" />
        <div className="ticket-bottom">
          <div>
            <small>{t.name}</small>
            <b>{info.name}</b>
          </div>
          <div>
            <small>{t.flight}</small>
            <b className="num">{info.flightNo}</b>
          </div>
          <div>
            <small>{t.dest}</small>
            <b>{info.destName}</b>
          </div>
          <div>
            <small>{t.departs}</small>
            <b>{info.when}</b>
          </div>
        </div>
      </div>

      <Banner>{t.doneNote}</Banner>

      <div className="panel">
        <div className="info-row">
          <span className="bubble">
            <ConciergeBell size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.doneDesk}</strong>
            <span>{t.doneDeskBody}</span>
          </div>
        </div>
        <div className="info-row">
          <span className="bubble bubble-sun">
            <ScanLine size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.donePass}</strong>
            <span>{t.donePassBody}</span>
          </div>
        </div>
        <div className="info-row">
          <span className="bubble">
            <Timer size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t.doneExpire}</strong>
            <span>{t.doneExpireBody}</span>
          </div>
        </div>
      </div>

      <Link className="btn btn-ghost" href={info.lang === "en" ? "/register?lang=en" : "/register"}>
        {t.another}
      </Link>
    </main>
  );
}
