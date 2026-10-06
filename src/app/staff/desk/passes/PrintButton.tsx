"use client";

import { Printer } from "lucide-react";

/** A4 에 실제 패스 크기(QR 25mm)로 인쇄한다. */
export function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      <Printer size={20} aria-hidden="true" />
      A4로 인쇄
    </button>
  );
}
