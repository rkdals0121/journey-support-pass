"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "로그인하지 못했습니다");
        return;
      }
      // 패스 QR 을 먼저 찍고 로그인한 경우 그 패스로 돌아간다. 내부 경로만 받는다.
      const next = params.get("next");
      router.replace(next && /^\/(p|staff)\//.test(next) ? next : "/staff");
      router.refresh();
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>직원 로그인</h1>
      <p className="muted">근무 구역의 접속 코드를 입력해 주세요.</p>
      <label htmlFor="code">구역 접속 코드</label>
      <input
        id="code"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy || !code.trim()}>
        로그인
      </button>
    </form>
  );
}

export default function StaffLoginPage() {
  return (
    <main className="page">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
