"use client";

import { ArrowRight, BarChart3, Check, ChevronLeft, Eye, FileText, Plane, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GROUP_LABEL, itemsOf, NEED_GROUPS, type Group, type Item } from "@/lib/catalog";
import { GROUP_EN, ITEM_EN, TEXT, type Lang } from "@/lib/i18n";
import { Banner, ErrorNote } from "./Alert";
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
  destCode?: string;
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
  /** 여객 화면의 언어. 직원이 대신 입력할 때는 한국어만 쓴다. */
  lang?: Lang;
  /** 이미 받은 등록을 고칠 때. 동의 단계를 건너뛰고 값을 채워서 시작한다. */
  initial?: { name: string; categories: string[]; needs: string[]; flight: FlightOption };
  /** 첫 단계에서 뒤로 가기를 눌렀을 때. */
  onExit: () => void;
  /** 오류 문구를 돌려주면 그 자리에 표시한다. 성공하면 null. */
  onSubmit: (payload: RegistrationPayload, flight: FlightOption) => Promise<string | null>;
}

// 묻는 순서. 필요한 도움을 먼저 묻고 교통약자 구분은 그 뒤에 묻는다.
// 직원이 안내할 때 쓰는 것은 필요한 도움이고, 구분은 주로 통계에 쓰이기 때문이다.
// 종이 체크리스트와 프로포절 1단계 2)의 표도 같은 순서여야 한다.
const ORDER = ["consent", "needs", "category", "name", "review"] as const;
const stepOf = (kind: (typeof ORDER)[number]) => ORDER.indexOf(kind);

const SEARCH_DELAY_MS = 250;
const sameFlight = (a: FlightOption | null, b: FlightOption) =>
  a !== null && a.flightDate === b.flightDate && a.flightNo === b.flightNo;

// 여객 등록 화면과 안내데스크 대신 입력 화면이 함께 쓴다.
// 종이 체크리스트와 문구·순서가 같아야 하므로 질문은 여기 한 곳에만 둔다.
export function RegistrationSteps({
  mock,
  byStaff = false,
  aboveNav = false,
  lang = "ko",
  initial,
  onExit,
  onSubmit,
}: Props) {
  const t = TEXT[lang];
  const itemLabel = (i: Item) => (lang === "en" ? (ITEM_EN[i.code] ?? i.label) : i.label);
  const groupLabel = (g: Group) => (lang === "en" ? GROUP_EN[g] : GROUP_LABEL[g]);
  // 운항 정보의 도착지 이름은 한국어뿐이다. 영어 화면에서는 공항 코드를 쓴다.
  const destOf = (f: FlightOption) => (lang === "en" && f.destCode ? f.destCode : f.destName);
  const whenOf = (f: FlightOption) =>
    [f.day === "오늘" ? t.today : f.day === "내일" ? t.tomorrow : f.day, f.time].filter(Boolean).join(" ");

  const editing = initial !== undefined;
  const firstStep = editing ? 1 : 0;
  const steps = t.steps;

  const startedAt = useRef(new Date().toISOString());
  const revisiting = useRef(false);
  const [editCount, setEditCount] = useState(0);

  const [step, setStep] = useState(firstStep);
  const [declined, setDeclined] = useState(false);
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [needs, setNeeds] = useState<string[]>(initial?.needs ?? []);
  const [name, setName] = useState(initial?.name ?? "");
  const [query, setQuery] = useState(initial?.flight.flightNo ?? "");
  const [options, setOptions] = useState<FlightOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [flight, setFlight] = useState<FlightOption | null>(initial?.flight ?? null);
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
  const offline = t.offline;
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
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setOptions(data.flights ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError(offline);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, flight, offline]);

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
  const back = () => (step === firstStep ? onExit() : goTo(step - 1, true));
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

  const kind = ORDER[step];

  if (declined) {
    return (
      <div className="empty" role="status">
        <span className="bubble">
          <Check size={26} aria-hidden="true" />
        </span>
        <strong>{t.declinedTitle}</strong>
        <p>{t.declinedBody}</p>
        <button className="btn" onClick={() => setDeclined(false)}>
          {t.declinedBack}
        </button>
      </div>
    );
  }

  const canNext =
    kind === "category" ? categories.length > 0 : kind === "name" ? name.trim().length > 0 && flight !== null : true;
  const stepNo = step + 1 - firstStep;
  const stepTotal = steps.length - firstStep;

  return (
    <div ref={rootRef}>
      <div className="topbar">
        <button className="icon-btn" onClick={back} aria-label={step === firstStep ? t.exit : t.prevStep}>
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <div className="progress" aria-hidden="true">
          {steps.slice(firstStep).map((s, i) => (
            <i key={s} className={i + firstStep <= step ? "on" : ""} />
          ))}
        </div>
        <span
          className="step-count"
          aria-live="polite"
          aria-label={
            lang === "en"
              ? `Step ${stepNo} of ${stepTotal}, ${steps[step]}`
              : `${stepTotal}단계 중 ${stepNo}단계, ${steps[step]}`
          }
        >
          {stepNo}/{stepTotal}
        </span>
      </div>

      {step === 0 && (
        <section>
          <p className="step-kicker">{steps[0]}</p>
          <h1>{byStaff ? "여객께 동의를 받아 주세요" : t.consentTitle}</h1>
          <div className="panel">
            <div className="info-row">
              <span className="bubble">
                <FileText size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>{t.whatTitle}</strong>
                <span>{t.whatBody}</span>
              </div>
            </div>
            <div className="info-row">
              <span className="bubble">
                <Eye size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>{t.whoTitle}</strong>
                <span>{t.whoBody}</span>
              </div>
            </div>
            <div className="info-row">
              <span className="bubble">
                <Trash2 size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>{t.whenTitle}</strong>
                <span>{t.whenBody}</span>
              </div>
            </div>
            <div className="info-row">
              <span className="bubble">
                <BarChart3 size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>{t.keepTitle}</strong>
                <span>{t.keepBody}</span>
              </div>
            </div>
          </div>
          <p className="muted small">{t.consentNote}</p>
          <button className="btn btn-ghost" onClick={() => setDeclined(true)}>
            {t.decline}
          </button>
        </section>
      )}

      {kind === "category" && (
        <section>
          <p className="step-kicker">{steps[step]}</p>
          <h1>{t.categoryTitle}</h1>
          <p className="muted">{t.multi}</p>
          <Banner>{t.categoryPurpose}</Banner>
          <div role="group" aria-label={groupLabel("category")}>
            {itemsOf("category").map((i) => (
              <Choice
                key={i.code}
                code={i.code}
                label={itemLabel(i)}
                checked={categories.includes(i.code)}
                onToggle={() => toggle(setCategories, i.code)}
              />
            ))}
          </div>
        </section>
      )}

      {kind === "needs" && (
        <section>
          <p className="step-kicker">{steps[step]}</p>
          <h1>{t.needsTitle}</h1>
          <p className="muted">{t.needsHint}</p>
          <Banner>{t.needsNotice}</Banner>
          {NEED_GROUPS.map((g) => {
            const GroupIcon = GROUP_ICON[g];
            return (
              <div key={g} role="group" aria-label={groupLabel(g)}>
                <h2 className="group-title">
                  <GroupIcon size={18} aria-hidden="true" />
                  {groupLabel(g)}
                </h2>
                {itemsOf(g).map((i) => (
                  <Choice
                    key={i.code}
                    code={i.code}
                    label={itemLabel(i)}
                    note={i.request ? t.onSite : undefined}
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
          <p className="step-kicker">{steps[3]}</p>
          <h1>{t.nameTitle}</h1>
          <label htmlFor="reg-name">{t.name}</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            maxLength={40}
            autoComplete="off"
            placeholder={t.namePlaceholder}
            onChange={(e) => {
              touched();
              setName(e.target.value);
            }}
          />
          {mock && <p className="hint">{t.mockName}</p>}

          <label htmlFor="reg-flight">{t.flight}</label>
          <div className="input-wrap">
            <Search size={20} aria-hidden="true" />
            <input
              id="reg-flight"
              type="text"
              value={query}
              placeholder={t.flightPlaceholder}
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
              ? t.flightPicked
              : searching
                ? t.searching
                : options && options.length > 0
                  ? t.pickFlight
                  : t.flightHint}
          </p>

          {!flight && !searching && options && options.length === 0 && query.trim().length >= 2 && (
            <ErrorNote>{t.flightNotFound}</ErrorNote>
          )}

          <div role="radiogroup" aria-label={t.flightChoice}>
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
                  <strong>{destOf(o)}</strong>
                  <span>
                    {whenOf(o)} {o.cancelled ? `· ${t.cancelled}` : t.departs}
                  </span>
                </span>
                <span className="choice-mark" aria-hidden="true">
                  <Check size={16} strokeWidth={3} />
                </span>
              </button>
            ))}
          </div>
          {flight?.cancelled && <ErrorNote>{t.cancelledNote}</ErrorNote>}
        </section>
      )}

      {step === 4 && flight && (
        <section>
          <p className="step-kicker">{steps[4]}</p>
          <h1>{editing ? "이렇게 고칠까요?" : byStaff ? "여객과 함께 확인해 주세요" : t.reviewTitle}</h1>
          <div className="panel">
            <dl className="review">
              <dt>
                {t.reviewNameFlight}
                <button className="review-edit" onClick={() => goTo(3, true)}>
                  {t.edit}
                </button>
              </dt>
              <dd>{name.trim()}</dd>
              <dd>
                <Plane size={16} aria-hidden="true" /> {flight.flightNo} · {destOf(flight)} · {whenOf(flight)}
              </dd>
              <dt>
                {t.reviewNeeds}
                <button className="review-edit" onClick={() => goTo(stepOf("needs"), true)}>
                  {t.edit}
                </button>
              </dt>
              {needs.length === 0 && <dd className="muted">{t.notPicked}</dd>}
              {NEED_GROUPS.flatMap((g) => itemsOf(g))
                .filter((i) => needs.includes(i.code))
                .map((i) => (
                  <dd key={i.code}>{itemLabel(i)}</dd>
                ))}
              <dt>
                {t.reviewCategory}
                <button className="review-edit" onClick={() => goTo(stepOf("category"), true)}>
                  {t.edit}
                </button>
              </dt>
              {itemsOf("category")
                .filter((i) => categories.includes(i.code))
                .map((i) => (
                  <dd key={i.code}>{itemLabel(i)}</dd>
                ))}
            </dl>
          </div>
          {!editing && <p className="muted small">{t.reviewNote}</p>}
        </section>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className={`cta-bar ${aboveNav ? "above-nav" : ""}`}>
        <div className="cta-inner">
          {step === 4 ? (
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {editing ? (busy ? "저장하는 중…" : "고친 내용 저장") : busy ? t.submitting : t.submit}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={next} disabled={!canNext}>
              {kind === "consent" ? t.agree : kind === "needs" && needs.length === 0 ? t.noneNext : t.next}
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
  note,
  checked,
  onToggle,
}: {
  code: string;
  label: string;
  /** 문구 아래에 작게 붙는 말. 예약이 아니라 현장 상황에 따라 제공되는 요청임을 알린다. */
  note?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button role="checkbox" aria-checked={checked} className={`choice ${checked ? "choice-on" : ""}`} onClick={onToggle}>
      <span className="choice-icon">
        <NeedIcon code={code} />
      </span>
      <span className="choice-text">
        {label}
        {note && <small className="choice-note">{note}</small>}
      </span>
      <span className="choice-mark" aria-hidden="true">
        <Check size={16} strokeWidth={3} />
      </span>
    </button>
  );
}
