"use client";
import Link from "next/link";
import { useState } from "react";
export function StaffSessionControls({ canSwitch }: { canSwitch: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/logout", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      window.location.replace("/staff/login");
    } catch {
      setError("로그아웃을 확인하지 못했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
  }
  return (
    <>
      <div className="dx-actions">
        {canSwitch && (
          <Link
            className="sign-btn dx-session-btn"
            href="/staff/zone?next=%2Fstaff%2Frequests"
          >
            구역 바꾸기
          </Link>
        )}
        <button
          type="button"
          className="sign-btn dx-session-btn"
          disabled={busy}
          onClick={() => void logout()}
        >
          {busy ? "나가는 중…" : "나가기"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
    </>
  );
}
