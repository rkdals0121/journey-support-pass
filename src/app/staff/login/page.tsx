"use client";

import { ChevronLeft } from "lucide-react";
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
        setCode("");
        return;
      }
      // 패스 QR 을 먼저 찍고 로그인한 경우 그 패스로 돌아간다. 내부 경로만 받는다.
      const next = params.get("next");
      const safe = next && /^\/(p|staff)\//.test(next) ? next : null;
      // 쿠키가 바뀌었으므로 화면을 통째로 다시 받는다. 앞서 받아 둔 화면이 남지 않게 한다.
      if (data.needsZone) window.location.replace(safe ? `/staff/zone?next=${encodeURIComponent(safe)}` : "/staff/zone");
      else window.location.replace(safe ?? "/staff");
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>직원 로그인</h1>
      <p className="muted">접속 코드 여섯 자리를 입력해 주세요.</p>
      <label htmlFor="code">접속 코드</label>
      <input
        id="code"
        className="input-code"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <button className="btn btn-primary" disabled={busy || !code.trim()}>
        {busy ? "확인하는 중…" : "로그인"}
      </button>
      <p className="hint" style={{ marginTop: 18 }}>
        현장 직원은 공통 코드로 들어와 근무 구역을 고릅니다. 안내데스크는 안내데스크 코드를 씁니다.
      </p>
    </form>
  );
}

export default function StaffLoginPage() {
  return (
    <div className="dark-screen">
      <main className="page">
        <Brand />
        <Suspense>
          <LoginForm />
        </Suspense>
        <Link className="home-staff" href="/">
          <ChevronLeft size={16} aria-hidden="true" />
          여객 등록 화면으로
        </Link>
      </main>
    </div>
  );
}
