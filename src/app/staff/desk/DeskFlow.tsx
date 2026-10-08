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
  Printer,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, ErrorNote } from "../../components/Alert";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { RegistrationSteps, type RegistrationPayload } from "../../components/RegistrationSteps";
import { Scanner } from "../../components/Scanner";

interface Summary {
  registrationId: string;
  /** 지금 연결된 패스의 번호. 예전 방식으로 등록만 하고 패스를 받지 않은 건은 null. */
  passNo: string | null;
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
  submittedLabel: string;
}

interface DeskList {
  pending: ListItem[];
  active: ListItem[];
}

type Tab = "find" | "new";
type Confirm = "cancel" | "reissue" | null;

const LIST_REFRESH_MS = 30_000;

const TABS: { id: Tab; label: string }[] = [
  { id: "find", label: "패스 찾기·인쇄" },
  { id: "new", label: "대신 등록" },
];

const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

// 안내데스크(또는 키오스크)의 일.
//  - 여객 휴대전화의 QR 을 찍어 등록 내용을 확인하고, 같은 QR 을 종이 패스로 인쇄해 건넨다.
//  - 휴대전화로 등록하기 어려운 여객은 대신 등록하고 바로 인쇄한다.
//  - 패스를 잃어버렸으면 새 패스를 만들고(옛 패스는 못 쓰게 된다), 잘못된 등록은 고치거나 취소한다.
export function DeskFlow({ mock }: { mock: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("find");
  const [target, setTarget] = useState<Summary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [route, setRoute] = useState<"paper" | "assisted" | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<Confirm>(null);
  const [list, setList] = useState<DeskList | null>(null);
  // 같은 QR 이 계속 비치는 동안에는 다시 묻지 않는다.
  const lastScanned = useRef("");

  // 여객이 QR 을 보여주지 못해도 이름이나 편명으로 찾을 수 있게 목록을 함께 보여준다.
  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/desk/list", { method: "POST" });
      if (res.ok) setList(await res.json());
    } catch {
      // 목록을 못 받아도 QR 스캔은 그대로 쓸 수 있다.
    }
  }, []);

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadList]);

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
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

  function reset(next: Tab = "find") {
    setTab(next);
    setTarget(null);
    setNotice(null);
    setCancelled(null);
    setError(null);
    setRoute(null);
    setFilter("");
    setEditing(false);
    setConfirming(null);
    lastScanned.current = "";
    loadList();
    window.scrollTo(0, 0);
  }

  // 등록 하나를 열어 내용을 띄운다.
  async function open(registrationId: string) {
    const data = await post("/api/desk/get", { registrationId });
    if (!data) return;
    let summary = data as unknown as Summary;
    // 예전 방식으로 등록만 하고 패스를 받지 않은 건은 여기서 패스를 만든다.
    if (summary.passNo === null) {
      const made = await post("/api/desk/link", { registrationId, auto: true });
      if (!made) return;
      summary = { ...summary, passNo: String(made.passNo) };
    }
    setNotice(null);
    setTarget(summary);
    window.scrollTo(0, 0);
  }

  // 여객 휴대전화의 QR 을 찍었거나 패스 번호를 넣었다.
  async function find(body: { scanned: string } | { passNo: string }) {
    if (busy) return;
    if ("scanned" in body) {
      if (body.scanned === lastScanned.current) return;
      lastScanned.current = body.scanned;
    }
    const data = await post("/api/staff/resolve", body);
    if (!data) {
      lastScanned.current = "";
      return;
    }
    if (data.kind === "active") {
      await open(String(data.registrationId));
      return;
    }
    setError(
      "passNo" in body
        ? "패스 번호를 찾을 수 없습니다. 여객 화면의 QR 아래에 있는 네 자리를 넣어 주세요."
        : data.kind === "unusable"
          ? "사용할 수 없는 패스입니다. 출발했거나 재발급으로 바뀐 패스입니다. 이름으로 찾아 주세요."
          : "여객 패스의 QR이 아닙니다. 여객의 등록 완료 화면에 있는 QR을 찍어 주세요.",
    );
  }

  async function reissuePass() {
    if (!target) return;
    setConfirming(null);
    const data = await post("/api/desk/reissue", { registrationId: target.registrationId, auto: true });
    if (data) {
      setTarget({ ...target, passNo: String(data.passNo) });
      setNotice("새 패스를 만들었습니다. 이전 패스는 이제 쓸 수 없습니다. 아래에서 새 패스를 인쇄해 주세요.");
      window.scrollTo(0, 0);
    }
  }

  async function cancelRegistration() {
    if (!target) return;
    setConfirming(null);
    const data = await post("/api/desk/cancel", { registrationId: target.registrationId });
    if (data) {
      const keep = (r: ListItem) => r.registrationId !== target.registrationId;
      setList((l) => l && { pending: l.pending.filter(keep), active: l.active.filter(keep) });
      setCancelled(target.name);
      setTarget(null);
    }
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
      setTarget(data);
      setNotice("등록했습니다. 패스를 인쇄해 여객께 드리세요.");
      setRoute(null);
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
        body: JSON.stringify({ ...payload, registrationId: target.registrationId }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "고치지 못했습니다";
      setTarget(data);
      setNotice("고친 내용을 저장했습니다. 패스는 그대로 쓸 수 있습니다.");
      setEditing(false);
      loadList();
      window.scrollTo(0, 0);
      return null;
    } catch {
      return "연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  if (target && editing) {
    return (
      <div style={{ paddingBottom: "var(--cta-h)" }}>
        <RegistrationSteps
          mock={mock}
          byStaff
          aboveNav
          initial={{
            name: target.name,
            categories: target.categoryCodes,
            needs: target.needCodes,
            flight: {
              flightDate: target.flightDate,
              flightNo: target.flightNo,
              destName: target.destName,
              label: "",
              day: "",
              time: target.timeLabel,
              cancelled: false,
            },
          }}
          onExit={() => setEditing(false)}
          onSubmit={saveEdit}
        />
      </div>
    );
  }

  if (cancelled) {
    return (
      <div>
        <p className="success-head">
          <CircleCheck size={26} aria-hidden="true" />
          등록을 취소했습니다
        </p>
        <p className="muted" role="status">
          {cancelled} 님의 이름, 항공편, 필요한 도움을 지웠습니다. 패스는 더 쓸 수 없습니다.
        </p>
        <button className="btn btn-primary" onClick={() => reset()}>
          다음 여객
        </button>
      </div>
    );
  }

  if (target) {
    const s = target;
    return (
      <div>
        <div className="topbar">
          <button className="icon-btn" onClick={() => reset()} aria-label="뒤로">
            <ChevronLeft size={26} aria-hidden="true" />
          </button>
          <span className="topbar-title">여객 패스</span>
        </div>
        {notice && <Banner role="status">{notice}</Banner>}
        {error && <ErrorNote>{error}</ErrorNote>}

        <h1>{s.name} 님의 패스</h1>
        <div className="pass-big" aria-label={`패스 번호 ${(s.passNo ?? "").split("").join(" ")}`}>
          <small>패스 번호</small>
          <b aria-hidden="true">{s.passNo}</b>
          <span>여객 화면의 QR 아래 번호와 같은지 확인하세요</span>
        </div>

        {/* 새 창으로 연다. 인쇄한 뒤 이 화면으로 돌아와 다음 일을 이어서 한다. */}
        <a className="btn btn-primary" href={`/staff/desk/print/${s.registrationId}`} target="_blank" rel="noopener">
          <Printer size={20} aria-hidden="true" />
          패스 인쇄 (같은 QR)
        </a>
        <p className="hint">
          여객 휴대전화에 뜬 것과 같은 QR이 종이에 찍힙니다. 휴대전화만 쓰겠다는 여객은 인쇄하지 않아도 됩니다.
        </p>

        <div className="panel" style={{ marginTop: 16 }}>
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

        <div className="row">
          <button className="btn" onClick={() => setEditing(true)} disabled={busy}>
            <PenLine size={18} aria-hidden="true" />
            내용 고치기
          </button>
          <button className="btn" onClick={() => setConfirming("reissue")} disabled={busy}>
            <RefreshCw size={18} aria-hidden="true" />
            분실 재발급
          </button>
        </div>
        <button className="btn btn-ghost link-danger" onClick={() => setConfirming("cancel")} disabled={busy}>
          이 등록 취소하기
        </button>
        <button className="btn" onClick={() => reset()}>
          다음 여객
        </button>

        {confirming === "cancel" && (
          <ConfirmSheet
            title="이 등록을 취소할까요?"
            body={`${s.name} · ${s.flightNo} 등록의 이름, 항공편, 필요한 도움을 지웁니다. 패스는 더 쓸 수 없게 됩니다. 되돌릴 수 없습니다.`}
            confirmLabel="등록 취소"
            busy={busy}
            onConfirm={cancelRegistration}
            onCancel={() => setConfirming(null)}
          />
        )}
        {confirming === "reissue" && (
          <ConfirmSheet
            title="패스를 새로 만들까요?"
            body={`${s.name} 님의 지금 패스(${s.passNo})는 바로 못 쓰게 됩니다. 여객 휴대전화에 저장해 둔 QR도 함께 못 쓰게 되므로, 새 패스를 인쇄해 드려야 합니다.`}
            confirmLabel="새 패스 만들기"
            busy={busy}
            onConfirm={reissuePass}
            onCancel={() => setConfirming(null)}
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
  const everyone = [...(list?.active ?? []), ...(list?.pending ?? [])];
  const shown = everyone.filter((r) => !q || norm(r.name).includes(q) || norm(r.flightNo).includes(q));

  return (
    <div>
      <header className="staff-head">
        <div className="staff-head-row">
          <h1>
            <span className="kicker">안내데스크</span>
            패스 찾기와 등록
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
          </button>
        ))}
      </div>

      {tab === "find" && (
        <>
          <h2 className="section-title">여객 휴대전화의 QR을 찍어 주세요</h2>
          <Scanner
            onScan={(scanned) => find({ scanned })}
            onNumber={(passNo) => find({ passNo })}
            numberLabel="찾기"
            paused={busy}
          />
          {error && <ErrorNote>{error}</ErrorNote>}

          <h2 className="section-title">QR이 없으면 이름이나 편명으로 찾기 {list ? `· 등록 ${everyone.length}건` : ""}</h2>
          <div className="input-wrap">
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
          {list && shown.length === 0 && (
            <div className="empty">
              <span className="bubble">
                <Inbox size={26} aria-hidden="true" />
              </span>
              <strong>{q ? "찾는 등록이 없습니다" : "아직 등록한 여객이 없습니다"}</strong>
              <p>{q ? "이름이나 편명을 다시 확인해 주세요." : "여객이 등록을 마치면 여기에 바로 나타납니다."}</p>
            </div>
          )}
          {q && shown.length > 1 && <Banner>같은 조건의 여객이 여럿입니다. 등록 내용을 여객에게 확인하고 고르세요.</Banner>}
          {shown.map((r) => (
            <button key={r.registrationId} className="reg-row" onClick={() => open(r.registrationId)} disabled={busy}>
              <span className="reg-no pass">
                <small>패스</small>
                {r.passNo ?? "없음"}
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
                  {[...r.categories, ...r.needs].slice(0, 2).join(" / ")}
                  {r.categories.length + r.needs.length > 2 && ` 외 ${r.categories.length + r.needs.length - 2}`}
                </span>
              </span>
              <ChevronRight className="case-chev" size={20} aria-hidden="true" />
            </button>
          ))}
        </>
      )}

      {tab === "new" && (
        <div>
          {error && <ErrorNote>{error}</ErrorNote>}
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
          <p className="hint">등록을 마치면 바로 패스가 만들어지고, 이어서 인쇄할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}
