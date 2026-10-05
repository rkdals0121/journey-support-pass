"use client";

import { useRef, useState } from "react";
import { GROUP_LABEL, itemsOf, NEED_GROUPS } from "@/lib/catalog";

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

interface FlightOption {
  flightDate: string;
  flightNo: string;
  label: string;
}

interface Props {
  /** 모의 데이터 모드면 실제 이름을 넣지 말라는 안내를 띄운다. */
  mock: boolean;
  /** 직원이 대신 입력할 때는 문구를 여객에게 묻는 말투로 바꾼다. */
  byStaff?: boolean;
  /** 오류 문구를 돌려주면 그 자리에 표시한다. 성공하면 null. */
  onSubmit: (payload: RegistrationPayload) => Promise<string | null>;
}

const STEPS = ["동의", "교통약자 구분", "필요한 도움", "이름과 편명"];

// 여객 등록 화면과 안내데스크 대신 입력 화면이 함께 쓴다.
// 종이 체크리스트와 문구·순서가 같아야 하므로 질문은 여기 한 곳에만 둔다.
export function RegistrationSteps({ mock, byStaff = false, onSubmit }: Props) {
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
  const [flight, setFlight] = useState<FlightOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const back = () => {
    revisiting.current = true;
    setError(null);
    setStep((s) => s - 1);
  };

  const next = () => {
    revisiting.current = false;
    setError(null);
    setStep((s) => s + 1);
  };

  async function search() {
    setError(null);
    setFlight(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/flights/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setOptions(data.flights ?? []);
    } catch {
      setError("연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!flight) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit({
      name,
      flightDate: flight.flightDate,
      flightNo: flight.flightNo,
      categories,
      needs,
      consent: true,
      startedAt: startedAt.current,
      editCount,
    });
    setBusy(false);
    if (message) setError(message);
  }

  if (declined) {
    return (
      <div className="notice" role="status">
        <p>기존 안내와 지원을 그대로 받으실 수 있습니다.</p>
        <button className="btn" onClick={() => setDeclined(false)}>
          처음으로
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="step-count" aria-live="polite">
        {step + 1} / {STEPS.length} · {STEPS[step]}
      </p>

      {step === 0 && (
        <section>
          <h1>{byStaff ? "여객께 동의를 받아 주세요" : "등록 전에 확인해 주세요"}</h1>
          <div className="notice">
            <p>
              <strong>무엇을 받나요</strong>
              <br />
              이름, 항공편, 교통약자 구분, 필요한 도움. 연락처와 진단명은 받지 않습니다.
            </p>
            <p>
              <strong>누가 보나요</strong>
              <br />
              인천공항운영서비스 직원이 패스의 QR을 스캔했을 때만 봅니다.
            </p>
            <p>
              <strong>언제 지우나요</strong>
              <br />
              이름, 항공편, 필요한 도움은 항공편 출발 후 삭제합니다.
            </p>
            <p>
              <strong>무엇이 남나요</strong>
              <br />
              교통약자 구분과 응대한 구역·시각은 서비스 개선을 위한 통계로 남습니다. 누구의 것인지는 알 수 없게
              남깁니다.
            </p>
            <p className="muted small">
              필요한 도움은 건강과 관련된 정보일 수 있어 따로 동의를 받습니다. 동의하지 않아도 기존 안내와 지원은 그대로
              받으실 수 있습니다.
            </p>
          </div>
          <button className="btn btn-primary" onClick={next}>
            동의합니다
          </button>
          <button className="btn" onClick={() => setDeclined(true)}>
            동의하지 않습니다
          </button>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1>해당하는 것을 모두 골라 주세요</h1>
          <div role="group" aria-label={GROUP_LABEL.category}>
            {itemsOf("category").map((i) => (
              <Choice
                key={i.code}
                label={i.label}
                checked={categories.includes(i.code)}
                onToggle={() => toggle(setCategories, i.code)}
              />
            ))}
          </div>
          <Nav onBack={back} onNext={next} nextDisabled={categories.length === 0} />
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>필요한 도움을 골라 주세요</h1>
          <p className="muted">해당하는 것이 없으면 고르지 않고 넘어가셔도 됩니다.</p>
          {NEED_GROUPS.map((g) => (
            <div key={g} role="group" aria-label={GROUP_LABEL[g]}>
              <h2>{GROUP_LABEL[g]}</h2>
              {itemsOf(g).map((i) => (
                <Choice
                  key={i.code}
                  label={i.label}
                  checked={needs.includes(i.code)}
                  onToggle={() => toggle(setNeeds, i.code)}
                />
              ))}
            </div>
          ))}
          <Nav onBack={back} onNext={next} />
        </section>
      )}

      {step === 3 && (
        <section>
          <h1>이름과 항공편을 알려 주세요</h1>
          <label htmlFor="reg-name">이름</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => {
              touched();
              setName(e.target.value);
            }}
          />
          {mock && <p className="muted small">시범 운영 중입니다. 실제 이름을 입력하지 마세요.</p>}

          <label htmlFor="reg-flight">편명</label>
          <div className="row">
            <input
              id="reg-flight"
              type="text"
              value={query}
              placeholder="예: KE123"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => {
                touched();
                setQuery(e.target.value);
                setOptions(null);
                setFlight(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && query.trim() && search()}
            />
            <button className="btn btn-inline" onClick={search} disabled={busy || !query.trim()}>
              찾기
            </button>
          </div>

          {options && options.length === 0 && (
            <p className="error" role="alert">
              편명을 다시 확인해 주세요. 찾기 어려우면 안내데스크에서 도와드립니다.
            </p>
          )}
          {options && options.length > 0 && (
            <div role="radiogroup" aria-label="항공편 선택">
              <p className="muted">맞는 항공편을 눌러 주세요.</p>
              {options.map((o) => (
                <button
                  key={`${o.flightDate}-${o.flightNo}`}
                  role="radio"
                  aria-checked={flight === o}
                  className={`choice ${flight === o ? "choice-on" : ""}`}
                  onClick={() => setFlight(o)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button className="btn" onClick={back} disabled={busy}>
              이전
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim() || !flight}>
              등록하기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Choice({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button role="checkbox" aria-checked={checked} className={`choice ${checked ? "choice-on" : ""}`} onClick={onToggle}>
      <span className="choice-mark" aria-hidden="true">
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function Nav({ onBack, onNext, nextDisabled = false }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="row">
      <button className="btn" onClick={onBack}>
        이전
      </button>
      <button className="btn btn-primary" onClick={onNext} disabled={nextDisabled}>
        다음
      </button>
    </div>
  );
}
