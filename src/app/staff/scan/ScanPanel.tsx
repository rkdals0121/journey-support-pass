"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Scanner } from "../../components/Scanner";

const MESSAGES: Record<string, string> = {
  idle: "연결되지 않은 패스입니다",
  unusable: "사용할 수 없는 패스입니다",
  unknown: "패스 QR이 아닙니다",
};

export function ScanPanel({ isDesk }: { isDesk: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve(body: { scanned: string } | { passNo: string }) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/staff/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "확인하지 못했습니다");
      } else if (data.kind === "active") {
        router.push(`/staff/case/${data.registrationId}`);
        return;
      } else if ("passNo" in body) {
        setMessage("패스 번호를 찾을 수 없습니다");
      } else {
        setMessage(MESSAGES[data.kind] ?? MESSAGES.unknown);
      }
    } catch {
      setMessage("연결할 수 없습니다. 구두로 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>패스 스캔</h1>
      <p className="muted">패스 뒷면의 QR을 화면 안에 맞춰 주세요.</p>
      <Scanner onScan={(text) => resolve({ scanned: text })} onNumber={(passNo) => resolve({ passNo })} paused={busy} />
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {isDesk && message === MESSAGES.idle && (
        <Link className="btn" href="/staff/desk">
          패스 연결하러 가기
        </Link>
      )}
      <Link className="btn" href="/staff">
        목록으로
      </Link>
    </div>
  );
}
