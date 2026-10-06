"use client";

import {
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardPen,
  Inbox,
  MessagesSquare,
  PenLine,
  Search,
  Ticket,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Banner, ErrorNote } from "../../components/Alert";
import { ConfirmSheet } from "../../components/ConfirmSheet";
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
  flightDate: string;
  categoryCodes: string[];
  needCodes: string[];
}

interface ListItem extends Summary {
  receiptNo: string | null;
  passNo: string | null;
  submittedLabel: string;
}

interface DeskList {
  idlePasses: number;
  pending: ListItem[];
  active: ListItem[];
}

type Tab = "link" | "new" | "reissue";
type Target = { summary: Summary; mode: "link" | "reissue" };
type Done = { mode: "link" | "reissue" | "cancel"; passNo?: string; name: string };

const LIST_REFRESH_MS = 30_000;
const LOW_PASSES = 5;

const TABS: { id: Tab; label: string }[] = [
  { id: "link", label: "패스 연결" },
  { id: "new", label: "대신 등록" },
  { id: "reissue", label: "재발급" },
];

const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

export function DeskFlow({ mock, scannedToken }: { mock: boolean; scannedToken: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("link");
  const [target, setTarget] = useState<Target | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [receiptNo, setReceiptNo] = useState("");
  const [route, setRoute] = useState<"paper" | "assisted" | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // 미연결 패스를 기본 카메라로 찍어 들어온 경우, 그 패스를 바로 쓴다.
  const [pendingToken, setPendingToken] = useState(scannedToken);
  const [list, setList] = useState<DeskList | null>(null);

  // 접수 번호를 몰라도 등록을 찾을 수 있게 목록을 함께 보여준다.
  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/desk/list", { method: "POST" });
      if (res.ok) setList(await res.json());
    } catch {
      // 목록을 못 받아도 접수 번호 입력은 그대로 쓸 수 있다.
    }
  }, []);

  // 여객이 방금 등록한 건이 새로고침 없이 목록에 뜨도록 주기적으로 다시 읽는다.
  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadList]);

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
    setFilter("");
    setEditing(false);
    setConfirming(false);
    loadList();
    window.scrollTo(0, 0);
  }

  // 방금 처리한 등록을 목록에서 바로 뺀다. 다시 읽어 올 때까지 옛 줄이 남아 있지 않게 한다.
  function forget(registrationId: string, mode: "link" | "cancel") {
    const keep = (r: ListItem) => r.registrationId !== registrationId;
    setList((l) => l && { ...l, pending: l.pending.filter(keep), active: mode === "cancel" ? l.active.filter(keep) : l.active });
  }

  async function attach(pass: { scanned: string } | { passNo: string } | { auto: true }) {
    if (!target || busy) return;
    const data = await post(target.mode, { registrationId: target.summary.registrationId, ...pass });
    setPendingToken(null);
    if (data) {
      if (target.mode === "link") forget(target.summary.registrationId, "link");
      setDone({ mode: target.mode, passNo: String(data.passNo), name: target.summary.name });
      window.scrollTo(0, 0);
    }
  }

  async function cancelRegistration() {
    if (!target) return;
    const s = target.summary;
    setConfirming(false);
    const data = await post("cancel", { registrationId: s.registrationId });
    if (data) {
      forget(s.registrationId, "cancel");
      setDone({ mode: "cancel", name: s.name });
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
      window.scrollTo(0, 0);
      return null;
    } catch {
      return "연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  async function saveEdit(payload: RegistrationPayload): Promise<string | null> {
    if (!target) return "등록을 먼저 선택해 주세요";
    try {
      const res = await fetch("/api/desk/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, registrationId: target.summary.registrationId }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "고치지 못했습니다";
      setTarget({ summary: data, mode: target.mode });
      setEditing(false);
      loadList();
      window.scrollTo(0, 0);
      return null;
    } catch {
      return "연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  if (target && editing) {
    const s = target.summary;
    return (
      <div style={{ paddingBottom: "var(--cta-h)" }}>
        <RegistrationSteps
          mock={mock}
          byStaff
          aboveNav
          initial={{
            name: s.name,
            categories: s.categoryCodes,
            needs: s.needCodes,
            flight: {
              flightDate: s.flightDate,
              flightNo: s.flightNo,
              destName: s.destName,
              label: "",
              day: "",
              time: s.timeLabel,
              cancelled: false,
            },
          }}
          onExit={() => setEditing(false)}
          onSubmit={saveEdit}
        />
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <p className="success-head">
          <CircleCheck size={26} aria-hidden="true" />
          {done.mode === "link" ? "연결했습니다" : done.mode === "reissue" ? "재발급했습니다" : "등록을 취소했습니다"}
        </p>
        {done.passNo ? (
          <>
            <h1>{done.name} 님께 이 번호의 패스를 드리세요</h1>
            <div className="pass-big" role="status" aria-label={`패스 번호 ${done.passNo.split("").join(" ")}`}>
              <small>패스 번호</small>
              <b aria-hidden="true">{done.passNo}</b>
              <span>패스 뒷면 QR 아래의 번호와 같은지 확인하세요</span>
            </div>
            {done.mode === "reissue" && <Banner>이전 패스는 이제 쓸 수 없습니다. 찾으면 폐기해 주세요.</Banner>}
          </>
        ) : (
          <p className="muted" role="status">
            {done.name} 님의 이름, 항공편, 필요한 도움을 지웠습니다. 연결된 패스가 있었다면 더는 쓸 수 없습니다.
          </p>
        )}
        <button className="btn btn-primary" onClick={() => reset("link")}>
          다음 여객
        </button>
        <Link className="btn" href="/staff">
          여객 목록 보기
        </Link>
      </div>
    );
  }

  if (target) {
    const s = target.summary;
    const noPasses = list !== null && list.idlePasses === 0;
    return (
      <div>
        <div className="topbar">
          <button className="icon-btn" onClick={() => reset()} aria-label="뒤로">
            <ChevronLeft size={26} aria-hidden="true" />
          </button>
          <span className="topbar-title">{target.mode === "link" ? "패스 연결" : "패스 재발급"}</span>
        </div>
        <h1>{target.mode === "link" ? "이 여객에게 줄 패스를 스캔하세요" : "새로 줄 패스를 스캔하세요"}</h1>
        <div className="panel">
          <p style={{ marginBottom: 6 }}>
            <strong style={{ fontSize: 20 }}>{s.name}</strong>
          </p>
          <p className="muted" style={{ marginBottom: 10 }}>
            <span className="num" style={{ fontSize: 20, color: "var(--text)" }}>
              {s.flightNo}
            </span>{" "}
            {s.destName} {s.timeLabel && `· ${s.timeLabel} 출발`}
          </p>
          <div className="chips" style={{ whiteSpace: "normal" }}>
            {s.categories.map((t) => (
              <span key={t} className="chip chip-mint">
                {t}
              </span>
            ))}
          </div>
          {s.needs.length > 0 && (
            <ul className="lines small" style={{ marginTop: 10, fontWeight: 500 }}>
              {s.needs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
        {target.mode === "link" && <p className="hint">여객 화면의 이름·편명과 같은지 확인하세요.</p>}

        {noPasses && <ErrorNote>미사용 패스가 없습니다. 아래에서 패스를 먼저 만들어 주세요.</ErrorNote>}
        {error && <ErrorNote>{error}</ErrorNote>}

        <div style={{ marginTop: 18 }}>
          {pendingToken ? (
            <button className="btn btn-primary" onClick={() => attach({ scanned: pendingToken })} disabled={busy}>
              방금 찍은 패스로 연결
            </button>
          ) : (
            <Scanner
              onScan={(scanned) => attach({ scanned })}
              onNumber={(passNo) => attach({ passNo })}
              numberLabel="연결"
              paused={busy}
            />
          )}
        </div>

        <p className="or-line">실물 패스를 번호 순으로 쌓아 두었다면</p>
        <button className="btn" onClick={() => attach({ auto: true })} disabled={busy || noPasses}>
          <WandSparkles size={20} aria-hidden="true" />
          가장 앞 번호 패스로 자동 배정
        </button>
        <p className="hint">번호가 가장 작은 미사용 패스를 연결하고, 그 번호를 크게 보여줍니다.</p>

        {/* 새 창으로 연다. 이 화면을 벗어나면 조회해 둔 등록이 사라진다. */}
        <a className="btn btn-ghost" href="/staff/desk/passes" target="_blank" rel="noopener">
          미사용 패스 번호 보기 (새 창)
        </a>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)} disabled={busy}>
            <PenLine size={18} aria-hidden="true" />
            등록 내용 고치기
          </button>
          <button className="btn link-danger" onClick={() => setConfirming(true)} disabled={busy}>
            이 등록 취소하기
          </button>
        </div>
        {confirming && (
          <ConfirmSheet
            title="이 등록을 취소할까요?"
            body={`${s.name} · ${s.flightNo} 등록의 이름, 항공편, 필요한 도움을 지웁니다. 연결된 패스는 더 쓸 수 없게 됩니다. 되돌릴 수 없습니다.`}
            confirmLabel="등록 취소"
            busy={busy}
            onConfirm={cancelRegistration}
            onCancel={() => setConfirming(false)}
          />
        )}
      </div>
    );
  }

  if (tab === "new" && route) {
    return (
      <div style={{ paddingBottom: "var(--cta-h)" }}>
        <RegistrationSteps mock={mock} byStaff aboveNav onExit={() => setRoute(null)} onSubmit={registerForPassenger} />
      </div>
    );
  }

  const q = norm(filter);
  const hit = (r: ListItem) => !q || norm(r.name).includes(q) || norm(r.flightNo).includes(q);
  const pending = list?.pending.filter(hit) ?? [];
  const active = list?.active.filter(hit) ?? [];

  const searchBox = (
    <div className="input-wrap" style={{ marginTop: 6 }}>
      <Search size={20} aria-hidden="true" />
      <input
        type="search"
        value={filter}
        placeholder="이름이나 편명으로 찾기"
        aria-label="이름이나 편명으로 찾기"
        autoComplete="off"
        style={{ minHeight: 48, fontSize: 16.5, fontWeight: 500 }}
        onChange={(e) => setFilter(e.target.value)}
      />
      {filter && (
        <button className="icon-btn input-clear" onClick={() => setFilter("")} aria-label="검색어 지우기">
          <X size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <div>
      <header className="staff-head">
        <div className="staff-head-row">
          <h1>
            <span className="kicker">안내데스크</span>
            패스 연결과 등록
          </h1>
          <Link className="icon-btn" href="/staff/desk/stats" aria-label="오늘 현황">
            <ChartNoAxesColumn size={22} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="seg" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => reset(t.id)}>
            {t.label}
            {t.id === "link" && list && list.pending.length > 0 && <span className="count">{list.pending.length}</span>}
          </button>
        ))}
      </div>

      {list && (
        <Link className={`desk-stat ${list.idlePasses <= LOW_PASSES ? "low" : ""}`} href="/staff/desk/passes">
          <span>
            <Ticket size={16} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> 미사용 패스{" "}
            <b>{list.idlePasses}</b>장{list.idlePasses <= LOW_PASSES && " · 더 만들어 주세요"}
          </span>
          <span>
            보기·인쇄 <ChevronRight size={16} aria-hidden="true" style={{ verticalAlign: "-3px" }} />
          </span>
        </Link>
      )}

      {pendingToken && <Banner>방금 찍은 패스는 아직 연결되지 않았습니다. 연결할 등록을 골라 주세요.</Banner>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {tab === "link" && (
        <>
          <form onSubmit={lookupReceipt}>
            <label htmlFor="receipt">여객 화면의 접수 번호 네 자리</label>
            <div className="row">
              <input
                id="receipt"
                className="input-code"
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                placeholder="0000"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value.replace(/\D/g, ""))}
              />
              <button className="btn btn-primary btn-inline" disabled={busy || receiptNo.length !== 4}>
                찾기
              </button>
            </div>
          </form>

          <h2 className="section-title">패스를 기다리는 등록 {list ? `${list.pending.length}건` : ""}</h2>
          {list && list.pending.length > 4 && searchBox}
          {list && pending.length === 0 && (
            <div className="empty">
              <span className="bubble">
                <Inbox size={26} aria-hidden="true" />
              </span>
              <strong>{q ? "찾는 등록이 없습니다" : "기다리는 등록이 없습니다"}</strong>
              <p>{q ? "이름이나 편명을 다시 확인해 주세요." : "여객이 등록을 마치면 여기에 바로 나타납니다."}</p>
            </div>
          )}
          {pending.map((r) => (
            <RegRow key={r.registrationId} r={r} kind="receipt" onPick={() => setTarget({ summary: r, mode: "link" })} />
          ))}
        </>
      )}

      {tab === "new" && (
        <div>
          <h2 className="section-title">휴대전화 등록이 어려운 여객</h2>
          <button className="choice" onClick={() => setRoute("assisted")}>
            <span className="choice-icon">
              <MessagesSquare size={20} aria-hidden="true" />
            </span>
            <span className="choice-text">
              <strong>여객에게 물어보며 입력</strong>
              <br />
              <span className="small muted">질문을 읽어 드리고 답을 대신 고릅니다</span>
            </span>
            <ChevronRight className="case-chev" size={20} aria-hidden="true" />
          </button>
          <button className="choice" onClick={() => setRoute("paper")}>
            <span className="choice-icon">
              <ClipboardPen size={20} aria-hidden="true" />
            </span>
            <span className="choice-text">
              <strong>종이 체크리스트 옮겨 적기</strong>
              <br />
              <span className="small muted">입력을 마치면 종이는 바로 파기합니다</span>
            </span>
            <ChevronRight className="case-chev" size={20} aria-hidden="true" />
          </button>
        </div>
      )}

      {tab === "reissue" && (
        <>
          <h2 className="section-title">패스를 잃어버린 여객을 골라 주세요</h2>
          {searchBox}
          {list && active.length === 0 && (
            <div className="empty">
              <span className="bubble">
                <Inbox size={26} aria-hidden="true" />
              </span>
              <strong>{q ? "찾는 등록이 없습니다" : "패스가 연결된 등록이 없습니다"}</strong>
              <p>{q ? "이름이나 편명을 다시 확인해 주세요." : "패스를 연결한 여객이 여기에 나타납니다."}</p>
            </div>
          )}
          {q && active.length > 1 && (
            <Banner>같은 조건의 여객이 여럿입니다. 등록 내용을 여객에게 확인하고 고르세요.</Banner>
          )}
          {active.map((r) => (
            <RegRow key={r.registrationId} r={r} kind="pass" onPick={() => setTarget({ summary: r, mode: "reissue" })} />
          ))}
        </>
      )}
    </div>
  );
}

function RegRow({ r, kind, onPick }: { r: ListItem; kind: "receipt" | "pass"; onPick: () => void }) {
  const tags = [...r.categories, ...r.needs];
  return (
    <button className="reg-row" onClick={onPick}>
      <span className={`reg-no ${kind === "pass" ? "pass" : ""}`}>
        <small>{kind === "pass" ? "패스" : "접수"}</small>
        {(kind === "pass" ? r.passNo : r.receiptNo) ?? "-"}
      </span>
      <span className="case-main">
        <span className="case-top">
          <span className="case-name">{r.name}</span>
          <span className="case-flight">
            <span className="num">{r.flightNo}</span> {r.destName}
          </span>
        </span>
        <span className="case-time">
          {r.timeLabel ? `${r.timeLabel} 출발` : "운항 정보 없음"} · {r.submittedLabel} 등록
        </span>
        {/* 같은 편에 이름이 같은 여객이 있을 때 구분할 수 있게 등록 내용을 함께 보여준다. */}
        <span className="case-zone" style={{ whiteSpace: "normal" }}>
          {tags.slice(0, 2).join(" / ")}
          {tags.length > 2 && ` 외 ${tags.length - 2}`}
        </span>
      </span>
      <ChevronRight className="case-chev" size={20} aria-hidden="true" />
    </button>
  );
}
