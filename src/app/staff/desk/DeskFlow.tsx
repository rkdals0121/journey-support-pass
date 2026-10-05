"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RegistrationSteps, type RegistrationPayload } from "../../components/RegistrationSteps";
import { Scanner } from "../../components/Scanner";

interface Summary {
  registrationId: string;
  name: string;
  flightNo: string;
  destName: string;
  timeLabel: string;
  categories: string[];
  needs: string[];
}

type Tab = "link" | "new" | "reissue";
type Target = { summary: Summary; mode: "link" | "reissue" };

const TABS: { id: Tab; label: string }[] = [
  { id: "link", label: "패스 연결" },
  { id: "new", label: "새로 등록" },
  { id: "reissue", label: "재발급" },
];

export function DeskFlow({ mock, scannedToken }: { mock: boolean; scannedToken: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("link");
  const [target, setTarget] = useState<Target | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [receiptNo, setReceiptNo] = useState("");
  const [route, setRoute] = useState<"paper" | "assisted" | null>(null);
  const [name, setName] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [candidates, setCandidates] = useState<Summary[] | null>(null);
  // 미연결 패스를 기본 카메라로 찍어 들어온 경우, 그 패스를 바로 쓴다.
  const [pendingToken, setPendingToken] = useState(scannedToken);

  async function post(action: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/desk/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/staff/login");
        return null;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "처리하지 못했습니다");
        return null;
      }
      return data as Record<string, unknown>;
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function reset(next: Tab = tab) {
    setTab(next);
    setTarget(null);
    setDone(null);
    setError(null);
    setReceiptNo("");
    setRoute(null);
    setName("");
    setFlightNo("");
    setCandidates(null);
  }

  async function attach(pass: { scanned: string } | { passNo: string }) {
    if (!target || busy) return;
    const data = await post(target.mode, { registrationId: target.summary.registrationId, ...pass });
    setPendingToken(null);
    if (data) {
      setDone(
        target.mode === "link"
          ? `연결했습니다. 패스 번호 ${data.passNo}`
          : `재발급했습니다. 새 패스 번호 ${data.passNo}. 이전 패스는 쓸 수 없습니다.`,
      );
    }
  }

  async function lookupReceipt(e: React.FormEvent) {
    e.preventDefault();
    const data = await post("receipt", { receiptNo });
    if (data) setTarget({ summary: data as unknown as Summary, mode: "link" });
  }

  async function registerForPassenger(payload: RegistrationPayload): Promise<string | null> {
    try {
      const res = await fetch("/api/desk/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, route }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "등록하지 못했습니다";
      setTarget({ summary: data, mode: "link" });
      return null;
    } catch {
      return "연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  async function findForReissue(e: React.FormEvent) {
    e.preventDefault();
    const data = await post("reissue", { name, flightNo });
    if (data) setCandidates(data.candidates as Summary[]);
  }

  if (done) {
    return (
      <div>
        <p className="notice done" role="status">
          {done}
        </p>
        <button className="btn btn-primary" onClick={() => reset()}>
          다음 여객
        </button>
        <Link className="btn" href="/staff">
          목록으로
        </Link>
      </div>
    );
  }

  if (target) {
    const s = target.summary;
    return (
      <div>
        <h1>{target.mode === "link" ? "패스를 스캔해 연결하세요" : "새 패스를 스캔하세요"}</h1>
        <div className="notice">
          <p>
            <strong>{s.name}</strong> · {s.flightNo} {s.destName} {s.timeLabel}
          </p>
          <p className="small">{[...s.categories, ...s.needs].join(" / ")}</p>
          {target.mode === "link" && <p className="muted small">여객 화면과 같은지 확인하세요.</p>}
        </div>
        {pendingToken ? (
          <button className="btn btn-primary" onClick={() => attach({ scanned: pendingToken })} disabled={busy}>
            방금 찍은 패스로 연결
          </button>
        ) : (
          <Scanner onScan={(scanned) => attach({ scanned })} onNumber={(passNo) => attach({ passNo })} paused={busy} />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" onClick={() => reset()}>
          취소
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "tab-on" : ""}`}
            onClick={() => reset(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pendingToken && <p className="notice">방금 찍은 패스는 아직 연결되지 않았습니다. 연결할 등록을 찾아 주세요.</p>}

      {tab === "link" && (
        <form onSubmit={lookupReceipt}>
          <h1>접수 번호를 입력하세요</h1>
          <p className="muted">여객의 등록 완료 화면에 있는 네 자리 번호입니다.</p>
          <label htmlFor="receipt">접수 번호</label>
          <input
            id="receipt"
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn btn-primary" disabled={busy || receiptNo.length !== 4}>
            찾기
          </button>
        </form>
      )}

      {tab === "new" && !route && (
        <div>
          <h1>어떻게 등록하나요</h1>
          <button className="btn" onClick={() => setRoute("paper")}>
            종이 체크리스트를 옮겨 적기
          </button>
          <button className="btn" onClick={() => setRoute("assisted")}>
            여객에게 물어보며 대신 입력
          </button>
          <p className="muted small">종이 체크리스트는 입력을 마치면 바로 파기합니다.</p>
        </div>
      )}
      {tab === "new" && route && <RegistrationSteps mock={mock} byStaff onSubmit={registerForPassenger} />}

      {tab === "reissue" && (
        <div>
          <form onSubmit={findForReissue}>
            <h1>패스를 잃어버린 여객 찾기</h1>
            <label htmlFor="r-name">이름</label>
            <input id="r-name" type="text" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
            <label htmlFor="r-flight">편명</label>
            <input
              id="r-flight"
              type="text"
              value={flightNo}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => setFlightNo(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy || !name.trim() || !flightNo.trim()}>
              찾기
            </button>
          </form>
          {candidates && candidates.length === 0 && <p className="notice">패스가 연결된 등록을 찾지 못했습니다.</p>}
          {candidates && candidates.length > 1 && (
            <p className="notice">같은 이름의 여객이 여럿입니다. 등록 내용을 여객에게 확인하고 고르세요.</p>
          )}
          {candidates?.map((s) => (
            <button
              key={s.registrationId}
              className="choice choice-stack"
              onClick={() => setTarget({ summary: s, mode: "reissue" })}
            >
              <span>
                {s.name} · {s.flightNo} {s.destName} {s.timeLabel}
              </span>
              {/* 같은 편에 이름이 같은 여객이 있을 때 구분할 수 있게 등록 내용을 함께 보여준다. */}
              <span className="small muted">{[...s.categories, ...s.needs].join(" / ")}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Link className="btn" href="/staff/desk/passes">
        미사용 패스 보기·인쇄
      </Link>
      <Link className="btn" href="/staff">
        목록으로
      </Link>
    </div>
  );
}
