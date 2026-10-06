"use client";

import { ArrowRight, Check, ChevronLeft, Eye, FileText, Plane, Search, Trash2, BarChart3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GROUP_LABEL, itemsOf, NEED_GROUPS } from "@/lib/catalog";
import { ErrorNote } from "./Alert";
import { GROUP_ICON, NeedIcon } from "./NeedIcon";

export interface RegistrationPayload {
  name: string;
  flightDate: string;
  flightNo: string;
  categories: string[];
  needs: string[];
  consent: true;
  startedAt: string;
  editCount: number;
}

export interface FlightOption {
  flightDate: string;
  flightNo: string;
  destName: string;
  label: string;
  day: string;
  time: string;
  cancelled: boolean;
}

interface Props {
  /** 모의 데이터 모드면 실제 이름을 넣지 말라는 안내를 띄운다. */
  mock: boolean;
  /** 직원이 대신 입력할 때는 문구를 여객에게 묻는 말투로 바꾼다. */
  byStaff?: boolean;
  /** 직원 화면처럼 아래에 고정 메뉴가 있으면 버튼을 그 위에 붙인다. */
  aboveNav?: boolean;
  /** 첫 단계에서 뒤로 가기를 눌렀을 때. */
  onExit: () => void;
  /** 오류 문구를 돌려주면 그 자리에 표시한다. 성공하면 null. */
  onSubmit: (payload: RegistrationPayload, flight: FlightOption) => Promise<string | null>;
}

const STEPS = ["동의", "교통약자 구분", "필요한 도움", "이름과 항공편", "확인"];
const SEARCH_DELAY_MS = 250;
const sameFlight = (a: FlightOption | null, b: FlightOption) =>
  a !== null && a.flightDate === b.flightDate && a.flightNo === b.flightNo;

// 여객 등록 화면과 안내데스크 대신 입력 화면이 함께 쓴다.
// 종이 체크리스트와 문구·순서가 같아야 하므로 질문은 여기 한 곳에만 둔다.
export function RegistrationSteps({ mock, byStaff = false, aboveNav = false, onExit, onSubmit }: Props) {
  const startedAt = useRef(new Date().toISOString());
  const revisiting = useRef(false);
  const [editCount, setEditCount] = useState(0);

  const [step, setStep] = useState(0);
  const [declined, setDeclined] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [needs, setNeeds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FlightOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [flight, setFlight] = useState<FlightOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단계가 바뀌면 새 질문의 제목으로 초점을 옮긴다. 화면 읽기 프로그램이 새 질문을 바로 읽고,
  // 화면이 길 때 맨 위에서 다시 시작한다. 첫 화면에서는 옮기지 않는다.
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = rootRef.current?.querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }, [step]);

  // 편명을 치는 동안 후보를 찾는다. 찾기 버튼을 따로 누르지 않아도 된다.
  // 고른 편이 있으면(검색 칸에 그 편명이 들어 있다) 다시 찾지 않는다.
  useEffect(() => {
    const q = query.trim();
    if (flight || q.length < 2) {
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/flights/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        setOptions(data.flights ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, flight]);

  // 이전 단계로 돌아가 값을 바꾼 횟수를 센다(오입력·재입력 지표).
  const touched = () => {
    if (revisiting.current) {
      revisiting.current = false;
      setEditCount((n) => n + 1);
    }
  };

  // 직전 값을 받아 바꾼다. 두 항목을 빠르게 연달아 눌러도 하나가 빠지지 않는다.
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, code: string) => {
    touched();
    set((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
  };

  const goTo = (target: number, revisit: boolean) => {
    revisiting.current = revisit;
    setError(null);
    setStep(target);
  };
  const back = () => (step === 0 ? onExit() : goTo(step - 1, true));
  const next = () => goTo(step + 1, false);

  async function submit() {
    if (!flight || busy) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit(
      {
        name: name.trim(),
        flightDate: flight.flightDate,
        flightNo: flight.flightNo,
        categories,
        needs,
        consent: true,
        startedAt: startedAt.current,
        editCount,
      },
      flight,
    );
    setBusy(false);
    if (message) setError(message);
  }

  if (declined) {
    return (
      <div className="empty" role="status">
        <span className="bubble">
          <Check size={26} aria-hidden="true" />
        </span>
        <strong>등록하지 않았습니다</strong>
        <p>기존 안내와 지원은 그대로 받으실 수 있습니다. 도움이 필요하면 가까운 안내데스크나 직원에게 말씀해 주세요.</p>
        <button className="btn" onClick={() => setDeclined(false)}>
          다시 살펴보기
        </button>
      </div>
    );
  }

  const canNext =
    step === 1 ? categories.length > 0 : step === 3 ? name.trim().length > 0 && flight !== null : true;

  return (
    <div ref={rootRef}>
      <div className="topbar">
        <button className="icon-btn" onClick={back} aria-label={step === 0 ? "나가기" : "이전 단계"}>
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <div className="progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <i key={s} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <span className="step-count" aria-live="polite" aria-label={`${STEPS.length}단계 중 ${step + 1}단계, ${STEPS[step]}`}>
          {step + 1}/{STEPS.length}
        </span>
      </div>

      {step === 0 && (
        <section>
          <p className="step-kicker">{STEPS[0]}</p>
          <h1>{byStaff ? "여객께 동의를 받아 주세요" : "등록 전에 확인해 주세요"}</h1>
          <div className="panel">
            <div className="info-row">
              <span className="bubble">
                <FileText size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>무엇을 받나요</strong>
                <span>이름, 항공편, 교통약자 구분, 필요한 도움. 연락처와 진단명은 받지 않습니다.</span>
              </div>
            </div>
            <div className="info-row">
              <span className="bubble">
                <Eye size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>누가 보나요</strong>
                <span>인천공항운영서비스 직원이 패스의 QR을 스캔했을 때만 봅니다.</span>
              </div>
            </div>
            <div className="info-row">
              <span className="bubble">
                <Trash2 size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>언제 지우나요</strong>
                <span>이름, 항공편, 필요한 도움은 항공편 출발 후 삭제합니다.</span>
              </div>
            </div>
            <div className="info-row">
              <span className="bubble">
                <BarChart3 size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>무엇이 남나요</strong>
                <span>
                  교통약자 구분과 응대한 구역·시각은 서비스 개선을 위한 통계로 남습니다. 누구의 것인지는 알 수 없게
                  남깁니다.
                </span>
              </div>
            </div>
          </div>
          <p className="muted small">
            필요한 도움은 건강과 관련된 정보일 수 있어 따로 동의를 받습니다. 동의하지 않아도 기존 안내와 지원은 그대로
            받으실 수 있습니다.
          </p>
          <button className="btn btn-ghost" onClick={() => setDeclined(true)}>
            동의하지 않습니다
          </button>
        </section>
      )}

      {step === 1 && (
        <section>
          <p className="step-kicker">{STEPS[1]}</p>
          <h1>해당하는 것을 모두 골라 주세요</h1>
          <p className="muted">여러 개를 고를 수 있습니다.</p>
          <div role="group" aria-label={GROUP_LABEL.category}>
            {itemsOf("category").map((i) => (
              <Choice
                key={i.code}
                code={i.code}
                label={i.label}
                checked={categories.includes(i.code)}
                onToggle={() => toggle(setCategories, i.code)}
              />
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <p className="step-kicker">{STEPS[2]}</p>
          <h1>필요한 도움을 골라 주세요</h1>
          <p className="muted">해당하는 것이 없으면 고르지 않고 넘어가셔도 됩니다.</p>
          {NEED_GROUPS.map((g) => {
            const GroupIcon = GROUP_ICON[g];
            return (
              <div key={g} role="group" aria-label={GROUP_LABEL[g]}>
                <h2 className="group-title">
                  <GroupIcon size={18} aria-hidden="true" />
                  {GROUP_LABEL[g]}
                </h2>
                {itemsOf(g).map((i) => (
                  <Choice
                    key={i.code}
                    code={i.code}
                    label={i.label}
                    checked={needs.includes(i.code)}
                    onToggle={() => toggle(setNeeds, i.code)}
                  />
                ))}
              </div>
            );
          })}
        </section>
      )}

      {step === 3 && (
        <section>
          <p className="step-kicker">{STEPS[3]}</p>
          <h1>이름과 항공편을 알려 주세요</h1>
          <label htmlFor="reg-name">이름</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            maxLength={40}
            autoComplete="off"
            placeholder="탑승권에 적힌 이름"
            onChange={(e) => {
              touched();
              setName(e.target.value);
            }}
          />
          {mock && <p className="hint">시범 운영 중입니다. 실제 이름을 입력하지 마세요.</p>}

          <label htmlFor="reg-flight">편명</label>
          <div className="input-wrap">
            <Search size={20} aria-hidden="true" />
            <input
              id="reg-flight"
              type="text"
              value={query}
              placeholder="예: KE123"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="flight-hint"
              onChange={(e) => {
                touched();
                setQuery(e.target.value.toUpperCase());
                setOptions(null);
                setFlight(null);
              }}
            />
          </div>
          <p className="hint" id="flight-hint" aria-live="polite">
            {flight
              ? "항공편을 골랐습니다. 바꾸려면 편명을 다시 입력하세요."
              : searching
                ? "찾는 중…"
                : options && options.length > 0
                  ? "맞는 항공편을 눌러 주세요."
                  : "탑승권이나 예약 확인서에 있는 편명을 두 글자 이상 입력하면 자동으로 찾습니다."}
          </p>

          {!flight && !searching && options && options.length === 0 && query.trim().length >= 2 && (
            <ErrorNote>
              오늘과 내일 출발하는 편 가운데 찾지 못했습니다. 편명을 다시 확인해 주세요. 찾기 어려우면 안내데스크에서
              도와드립니다.
            </ErrorNote>
          )}

          <div role="radiogroup" aria-label="항공편 선택">
            {(flight ? [flight] : (options ?? [])).map((o) => (
              <button
                key={`${o.flightDate}-${o.flightNo}`}
                role="radio"
                aria-checked={sameFlight(flight, o)}
                className={`flight-opt ${sameFlight(flight, o) ? "on" : ""} ${o.cancelled ? "cancelled" : ""}`}
                onClick={() => {
                  touched();
                  setFlight(o);
                  setQuery(o.flightNo);
                }}
              >
                <span className="flight-opt-no">{o.flightNo}</span>
                <span className="flight-opt-main">
                  <strong>{o.destName}</strong>
                  <span>
                    {o.day} {o.time} {o.cancelled ? "· 결항" : "출발"}
                  </span>
                </span>
                <span className="choice-mark" aria-hidden="true">
                  <Check size={16} strokeWidth={3} />
                </span>
              </button>
            ))}
          </div>
          {flight?.cancelled && <ErrorNote>결항으로 표시된 편입니다. 항공사에 먼저 확인해 주세요.</ErrorNote>}
        </section>
      )}

      {step === 4 && flight && (
        <section>
          <p className="step-kicker">{STEPS[4]}</p>
          <h1>{byStaff ? "여객과 함께 확인해 주세요" : "이대로 등록할까요?"}</h1>
          <div className="panel">
            <dl className="review">
              <dt>
                이름과 항공편
                <button className="review-edit" onClick={() => goTo(3, true)}>
                  고치기
                </button>
              </dt>
              <dd>{name.trim()}</dd>
              <dd>
                <Plane size={16} aria-hidden="true" /> {flight.flightNo} · {flight.destName} · {flight.day} {flight.time}
              </dd>
              <dt>
                교통약자 구분
                <button className="review-edit" onClick={() => goTo(1, true)}>
                  고치기
                </button>
              </dt>
              {itemsOf("category")
                .filter((i) => categories.includes(i.code))
                .map((i) => (
                  <dd key={i.code}>{i.label}</dd>
                ))}
              <dt>
                필요한 도움
                <button className="review-edit" onClick={() => goTo(2, true)}>
                  고치기
                </button>
              </dt>
              {needs.length === 0 && <dd className="muted">고르지 않음</dd>}
              {NEED_GROUPS.flatMap((g) => itemsOf(g))
                .filter((i) => needs.includes(i.code))
                .map((i) => (
                  <dd key={i.code}>{i.label}</dd>
                ))}
            </dl>
          </div>
          <p className="muted small">등록한 뒤에 고치려면 안내데스크에 말씀해 주세요.</p>
        </section>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className={`cta-bar ${aboveNav ? "above-nav" : ""}`}>
        <div className="cta-inner">
          {step === 4 ? (
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? "등록하는 중…" : "등록하기"}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={next} disabled={!canNext}>
              {step === 0 ? "동의하고 시작하기" : step === 2 && needs.length === 0 ? "해당 없음, 다음" : "다음"}
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Choice({
  code,
  label,
  checked,
  onToggle,
}: {
  code: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button role="checkbox" aria-checked={checked} className={`choice ${checked ? "choice-on" : ""}`} onClick={onToggle}>
      <span className="choice-icon">
        <NeedIcon code={code} />
      </span>
      <span className="choice-text">{label}</span>
      <span className="choice-mark" aria-hidden="true">
        <Check size={16} strokeWidth={3} />
      </span>
    </button>
  );
}
