"use client";

import { Printer } from "lucide-react";

/** 브라우저의 인쇄 창을 연다. 인쇄할 때는 실제 패스 크기(QR 25mm)로 찍힌다. */
export function PrintButton({ label = "A4로 인쇄", primary = false }: { label?: string; primary?: boolean }) {
  return (
    <button className={`btn ${primary ? "btn-primary" : ""}`} onClick={() => window.print()}>
      <Printer size={20} aria-hidden="true" />
      {label}
    </button>
  );
}
