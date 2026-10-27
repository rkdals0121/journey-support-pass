"use client";

import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorNote } from "../../components/Alert";
import { Brand } from "../../components/Sunflower";

function LoginForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    // 답이 오지 않는 로그인은 10초에 끊는다. 끊지 않으면 「확인하는 중…」에 멈춰 새로 고침해야 한다.
    const ctrl = new AbortController();
    const limit = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "로그인하지 못했습니다");
        setCode("");
        return;
      }
      // 직원 화면의 다른 곳에서 로그인으로 넘어온 경우 그곳으로 돌아간다. 내부 경로만 받는다.
      const next = params.get("next");
      const safe = next && /^\/staff\//.test(next) ? next : null;
      // 쿠키가 바뀌었으므로 화면을 통째로 다시 받는다. 앞서 받아 둔 화면이 남지 않게 한다.
      if (data.needsZone)
        window.location.replace(
          safe ? `/staff/zone?next=${encodeURIComponent(safe)}` : "/staff/zone",
        );
      else window.location.replace(safe ?? "/staff/requests");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      clearTimeout(limit);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="staff-login-form">
      <p className="staff-login-eyebrow">지원 운영</p>
      <h1>직원 로그인</h1>
      <p className="muted">받은 접속 코드를 입력해 주세요.</p>
      <label htmlFor="code">접속 코드</label>
      <div className="staff-code-field">
        <input
          id="code"
          className="input-code"
          type={showCode ? "text" : "password"}
          autoComplete="off"
          maxLength={12}
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? "staff-code-error" : undefined}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          aria-controls="code"
          aria-pressed={showCode}
          aria-label={showCode ? "접속 코드 숨기기" : "접속 코드 보기"}
          onClick={() => setShowCode((v) => !v)}
        >
          {showCode ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <div id="staff-code-error">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <button className="btn btn-primary" disabled={busy || !code.trim()}>
        {busy ? "확인하는 중…" : "로그인"}
      </button>
      <details className="staff-login-help">
        <summary>접속 코드 안내</summary>
        <p className="hint">
          현장 직원은 공통 코드로 들어와 근무 구역을 고릅니다. 안내데스크는
          안내데스크 코드를 씁니다.
        </p>
      </details>
    </form>
  );
}

export default function StaffLoginPage() {
  return (
    <div className="staff-login-screen">
      <header className="staff-login-brand">
        <Brand />
      </header>
      <main className="staff-login-main">
        <Suspense>
          <LoginForm />
        </Suspense>
        <Link className="staff-login-return" href="/">
          <ChevronLeft size={16} aria-hidden="true" />
          여객 첫 화면으로
        </Link>
      </main>
    </div>
  );
}
