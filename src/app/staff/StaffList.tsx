"use client";

import { ArrowLeftRight, ChevronRight, Clock, HandHelping, LogOut, Search, SearchX, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CaseDto } from "@/lib/api/dto";
import { groupOf, shortOf } from "@/lib/catalog";
import { ErrorNote } from "../components/Alert";
import { NeedIcon } from "../components/NeedIcon";
import { PollBar, type PollInfo } from "../components/PollBar";

interface ListData {
  zoneLabel: string;
  isDesk: boolean;
  canSwitch: boolean;
  poll: PollInfo;
  assigned: CaseDto[];
  gateUnknown: CaseDto[];
  otherCount: number;
  others: CaseDto[];
}

type Scope = "zone" | "all";

// "KE 123" 처럼 띄어 쓰거나 소문자로 써도 찾는다.
const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
const matches = (c: CaseDto, q: string) => norm(c.name).includes(q) || norm(c.flightNo).includes(q);

export function StaffList({ refreshSec }: { refreshSec: number }) {
  const router = useRouter();
  const [data, setData] = useState<ListData | null>(null);
  const [offline, setOffline] = useState(false);
  const [scope, setScope] = useState<Scope>("zone");
  const [query, setQuery] = useState("");

  const q = norm(query);
  // 찾을 때는 다른 구역의 여객까지 본다. 여객은 탑승구와 다른 곳에서 도움을 청할 수 있다.
  const wantAll = scope === "all" || q.length > 0;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/list${wantAll ? "?scope=all" : ""}`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (res.status === 409) {
        router.replace("/staff/zone");
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
  }, [router, wantAll]);

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
        <ErrorNote>연결할 수 없습니다. 여객에게 구두로 확인해 주세요.</ErrorNote>
        <button className="btn" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div aria-busy="true">
        <p className="sr-only">불러오는 중…</p>
        <div className="skel skel-head" />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
      </div>
    );
  }

  const mineCount = data.assigned.length + data.gateUnknown.length;
  const total = mineCount + data.otherCount;
  const assigned = q ? data.assigned.filter((c) => matches(c, q)) : data.assigned;
  const gateUnknown = q ? data.gateUnknown.filter((c) => matches(c, q)) : data.gateUnknown;
  const others = wantAll ? (q ? data.others.filter((c) => matches(c, q)) : data.others) : [];
  // 다른 구역 여객을 아직 받아오는 중인지. 그동안은 "없습니다"라고 하지 않는다.
  const loadingOthers = wantAll && data.otherCount > 0 && data.others.length === 0;
  const shown = assigned.length + gateUnknown.length + others.length;

  return (
    <div>
      <header className="staff-head">
        <div className="staff-head-row">
          <h1>
            <span className="kicker">{data.isDesk ? "안내데스크" : "내 근무 구역"}</span>
            {data.zoneLabel}
          </h1>
          <button className="icon-btn" onClick={logout} aria-label="로그아웃">
            <LogOut size={22} aria-hidden="true" />
          </button>
        </div>
        {data.canSwitch && (
          <Link className="zone-switch" href="/staff/zone">
            <ArrowLeftRight size={15} aria-hidden="true" />
            구역 바꾸기
          </Link>
        )}
        <PollBar poll={data.poll} />
      </header>

      <div className="toolbar">
        <div className="input-wrap">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="이름이나 편명으로 찾기"
            aria-label="이름이나 편명으로 찾기"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-btn input-clear" onClick={() => setQuery("")} aria-label="검색어 지우기">
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        {!data.isDesk && !q && (
          <div className="seg" role="group" aria-label="보는 범위">
            <button aria-pressed={scope === "zone"} onClick={() => setScope("zone")}>
              내 구역 <span className="count">{mineCount}</span>
            </button>
            <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>
              전체 <span className="count">{total}</span>
            </button>
          </div>
        )}
      </div>

      {q && (
        <p className="section-title" role="status">
          전체 구역에서 찾은 여객 {loadingOthers ? "…" : `${shown}명`}
        </p>
      )}

      {shown === 0 && !loadingOthers && (
        <div className="empty">
          <span className="bubble">
            {q ? <SearchX size={26} aria-hidden="true" /> : <Users size={26} aria-hidden="true" />}
          </span>
          <strong>{q ? "찾는 여객이 없습니다" : "지금은 등록 여객이 없습니다"}</strong>
          <p>
            {q
              ? "이름이나 편명을 다시 확인해 주세요. 패스가 있으면 스캔으로 바로 열 수 있습니다."
              : data.otherCount > 0 && scope === "zone"
                ? `다른 구역에 ${data.otherCount}명이 있습니다. 전체를 눌러 볼 수 있습니다.`
                : "패스를 받은 여객이 생기면 여기에 나타납니다."}
          </p>
        </div>
      )}

      <ul className="case-list">
        {assigned.map((c) => (
          <CaseRow key={c.registrationId} c={c} />
        ))}
      </ul>

      {gateUnknown.length > 0 && (
        <>
          <h2 className="section-title">탑승구 미정 {gateUnknown.length}명</h2>
          <ul className="case-list">
            {gateUnknown.map((c) => (
              <CaseRow key={c.registrationId} c={c} />
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <h2 className="section-title">다른 구역 {others.length}명</h2>
          <ul className="case-list">
            {others.map((c) => (
              <CaseRow key={c.registrationId} c={c} showZone />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const SHOWN_TAGS = 4;

function CaseRow({ c, showZone = false }: { c: CaseDto; showZone?: boolean }) {
  // 소통 방식을 맨 앞에 둔다. 직원이 말을 걸기 전에 알아야 하는 것이다.
  const comm = c.codes.filter((code) => groupOf(code) === "comm");
  const rest = c.codes.filter((code) => groupOf(code) !== "comm" && groupOf(code) !== "category");
  const tags = [...comm, ...rest];
  const extra = tags.length - SHOWN_TAGS;
  const place = c.zoneLabel ?? c.terminalLabel;

  return (
    <li>
      <Link href={`/staff/case/${c.registrationId}`} className="case-row">
        <span className={`plate ${c.gate === null ? "unknown" : ""} ${c.urgent ? "urgent" : ""}`}>
          <small>탑승구</small>
          {c.gate ?? "미정"}
        </span>
        <span className="case-main">
          <span className="case-top">
            <span className="case-name">{c.name}</span>
            <span className="case-flight">
              <span className="num">{c.flightNo}</span> {c.destName}
            </span>
          </span>
          <span className={`case-time ${c.urgent ? "urgent" : ""}`}>
            <Clock size={15} aria-hidden="true" />
            {c.closeLabel}
            {c.status && !c.cancelled && c.status !== "탑승마감" && ` · ${c.status}`}
          </span>
          {(c.service || c.prevGate !== null) && (
            <span className="chips">
              {c.prevGate !== null && <span className="chip chip-red">탑승구 변경 · 이전 {c.prevGate}</span>}
              {c.service && (
                <span className={`chip ${c.service.endTime ? "chip-mint" : "chip-sun"}`}>
                  <HandHelping size={14} aria-hidden="true" />
                  {c.service.endTime
                    ? `${c.service.zone} 응대 완료 ${c.service.endTime}`
                    : `${c.service.zone} 응대 중`}
                </span>
              )}
            </span>
          )}
          {tags.length > 0 && (
            <span className="chips">
              {tags.slice(0, SHOWN_TAGS).map((code) => (
                <span key={code} className={`chip ${groupOf(code) === "comm" ? "chip-comm" : ""}`}>
                  <NeedIcon code={code} size={14} />
                  {shortOf(code)}
                </span>
              ))}
              {extra > 0 && <span className="chip">+{extra}</span>}
            </span>
          )}
          {showZone && place && <span className="case-zone">{place}</span>}
        </span>
        <ChevronRight className="case-chev" size={20} aria-hidden="true" />
      </Link>
    </li>
  );
}
