"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "../../../components/Alert";

const COUNT = 10;

/** 미사용 패스가 모자랄 때 더 만든다. 패스는 일회용이라 쓸수록 줄어든다. */
export function MorePasses() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/desk/passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: COUNT }),
      });
      const data = await res.json();
      setMessage(res.ok ? `${data.made}장을 새로 만들었습니다.` : (data.error ?? "만들지 못했습니다"));
      if (res.ok) router.refresh();
    } catch {
      setMessage("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={add} disabled={busy}>
        <Plus size={20} aria-hidden="true" />
        {COUNT}장 더 만들기
      </button>
      {message && <Banner role="status">{message}</Banner>}
    </>
  );
}
