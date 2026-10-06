"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CaseDto } from "@/lib/api/dto";
import { PollBar, type PollInfo } from "../components/PollBar";

interface ListData {
  zoneLabel: string;
  isDesk: boolean;
  poll: PollInfo;
  assigned: CaseDto[];
  gateUnknown: CaseDto[];
}

export function StaffList({ refreshSec }: { refreshSec: number }) {
  const router = useRouter();
  const [data, setData] = useState<ListData | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/list", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (!res.ok) throw new Error();
      setData(await res.json());
      setOffline(false);
    } catch {
      // 통신이 끊기면 오래된 정보로 안내하지 않도록 목록을 지운다.
      setData(null);
      setOffline(true);
    }
  }, [router]);

  useEffect(() => {
    load();
    const timer = setInterval(load, refreshSec * 1000);
    return () => clearInterval(timer);
  }, [load, refreshSec]);

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST" }).catch(() => {});
    router.replace("/staff/login");
  }

  if (offline) {
    return (
      <div>
        <p className="error" role="alert">
          연결할 수 없습니다. 구두로 확인해 주세요.
        </p>
        <button className="btn" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!data) return <p className="muted">불러오는 중…</p>;

  return (
    <div>
      <header className="staff-head">
        <div>
          <h1>{data.zoneLabel}</h1>
          <PollBar poll={data.poll} />
        </div>
        <button className="link-btn" onClick={logout}>
          로그아웃
        </button>
      </header>

      {data.assigned.length === 0 && data.gateUnknown.length === 0 && (
        <p className="notice">지금 이 구역으로 오는 등록 여객이 없습니다.</p>
      )}

      <ul className="case-list">
        {data.assigned.map((c) => (
          <CaseRow key={c.registrationId} c={c} />
        ))}
      </ul>

      {data.gateUnknown.length > 0 && (
        <>
          <h2>탑승구 미정</h2>
          <ul className="case-list">
            {data.gateUnknown.map((c) => (
              <CaseRow key={c.registrationId} c={c} />
            ))}
          </ul>
        </>
      )}

    </div>
  );
}

function CaseRow({ c }: { c: CaseDto }) {
  return (
    <li>
      <Link href={`/staff/case/${c.registrationId}`} className={`case-row ${c.urgent ? "case-urgent" : ""}`}>
        <span className="case-gate">
          <span className="case-gate-label">탑승구</span>
          {c.gate ?? "미정"}
        </span>
        <span className="case-main">
          <strong>{c.name}</strong> · {c.flightNo}
          <br />
          <span className={c.urgent ? "case-close-urgent" : "muted"}>
            {c.closeLabel}
            {c.status && !c.cancelled && c.status !== "탑승마감" && ` · ${c.status}`}
          </span>
          {c.comm.length > 0 && (
            <>
              <br />
              <span className="small">{c.comm.join(" · ")}</span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}
