"use client";

import { ArrowRight, BarChart3, Check, FileText, MapPin, MonitorSmartphone, Plane, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GROUP_EN, GROUP_LABEL, GROUPS, isAdapted, itemsOf, prefsOf, type Group, type Item, type Prefs } from "@/lib/catalog";
import { airlineLabel } from "@/lib/airline-en";
import { destLabel } from "@/lib/dest-en";
import { textOf, type Lang } from "@/lib/i18n";
import { ErrorNote } from "./Alert";
import { bucketKey, bucketsOf, CityPicker, type Destination } from "./FlightFinder";
import { FlowShell } from "./FlowShell";
import { AlnumPad, Choice } from "./Inputs";

export interface FlightOption {
  airline: string;
  flightDate: string;
  flightNo: string;
  destName: string;
  destCode: string;
  day: "today" | "tomorrow";
  time: string;
  cancelled: boolean;
}

export interface RegisterResult {
  token: string;
  passNo: string;
  lang: Lang;
  choices: string[];
}

interface Props {
  /** 여객 휴대전화(web), 공항 키오스크(kiosk), 안내데스크 직원이 대신 입력(assisted). */
  mode: "web" | "kiosk" | "assisted";
  initialLang: Lang;
  /** 첫 질문에서 「이전」이나 「처음으로」를 눌렀을 때. */
  onExit: () => void;
  onDone: (result: RegisterResult) => void;
  /** 언어나 안내 방식이 바뀔 때마다 알린다. 키오스크가 「직원 부르기」 버튼의 말과 크기를 맞추는 데 쓴다. */
  onPrefs?: (lang: Lang, prefs: Prefs) => void;
}

// 묻는 순서. 한 화면에 질문 하나.
// 안내받는 방식을 맨 먼저 묻는다. 큰 글씨를 고른 여객이 바로 다음 질문부터, 동의 글까지 큰 글씨로 보게 하기 위해서다.
const ORDER = ["guide", "consent", "move", "facility", "staff", "flight", "review"] as const;
type StepKind = (typeof ORDER)[number];

const SEARCH_DELAY_MS = 250;
const sameFlight = (a: FlightOption | null, b: FlightOption) =>
  a !== null && a.flightDate === b.flightDate && a.flightNo === b.flightNo;

/** 하나만 고르는 묶음에서는 화살표 키로 옆 항목으로 옮겨 가며 고른다. 키보드와 화면 읽기 프로그램이 기대하는 동작이다. */
function radioKeys(e: React.KeyboardEvent<HTMLElement>) {
  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0 || radios.length < 2) return;
  e.preventDefault();
  const next = radios[(at + step + radios.length) % radios.length];
  next.focus();
  // 편 목록처럼 고르면 목록이 접히는 묶음(data-browse)에서는 옮겨 가기만 한다. 고르는 것은 Space 나 Enter 로 한다.
  // 그 밖의 묶음에서는 옮겨 간 항목을 고른다. 이미 고른 항목은 다시 누르지 않는다(누르면 풀린다).
  if (e.currentTarget.hasAttribute("data-browse") || next.getAttribute("aria-checked") === "true") return;
  next.click();
}

/** 등록 질문. 휴대전화, 키오스크, 안내데스크가 같은 질문을 같은 순서로 쓴다. */
export function RegisterFlow({ mode, initialLang, onExit, onDone, onPrefs }: Props) {
  const kiosk = mode !== "web";
  const [lang, setLang] = useState<Lang>(initialLang);
  const [choices, setChoices] = useState<string[]>([]);
  const prefs = prefsOf(choices);
  const t = textOf(lang, prefs.easy);

  const startedAt = useRef(new Date().toISOString());
  const startAdapted = useRef<boolean | null>(null);
  const revisiting = useRef(false);
  const [editCount, setEditCount] = useState(0);

  const [step, setStep] = useState(0);
  const [declined, setDeclined] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FlightOption[] | null>(null);
  // 편명을 모르는 여객은 도착 도시를 눌러 고른다. 편이 많으면 출발 시간대로 좁힌다.
  const [cityOpen, setCityOpen] = useState(false);
  const [cityPick, setCityPick] = useState<Destination | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [airline, setAirline] = useState<string | null>(null);
  // 찾다가 연결이 끊겼을 때 「다시 찾기」로 한 번 더 찾게 한다.
  const [retry, setRetry] = useState(0);
  const [searching, setSearching] = useState(false);
  const [flight, setFlight] = useState<FlightOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind: StepKind = ORDER[step];
  const itemLabel = (i: Item) => (lang === "en" ? i.en : i.label);
  const groupLabel = (g: Group) => (lang === "en" ? GROUP_EN[g] : GROUP_LABEL[g]);
  // 운항 정보의 도착지 이름은 한국어뿐이다. 영어 화면에서는 공항 코드로 영어 도시 이름을 찾아 쓴다.
  const destOf = (f: FlightOption) => destLabel(lang, f);
  const whenOf = (f: FlightOption) => `${f.day === "today" ? t.today : t.tomorrow} ${f.time}`;

  const onPrefsRef = useRef(onPrefs);
  onPrefsRef.current = onPrefs;
  useEffect(() => {
    onPrefsRef.current?.(lang, prefsOf(choices));
  }, [lang, choices]);

  // 편명을 넣는 동안 후보를 찾는다. 찾기 버튼을 따로 누르지 않아도 된다.
  const offline = t.offline;
  useEffect(() => {
    const q = query.trim();
    // 도시에서 고른 경우는 글자 수와 상관없이 그 도시로 찾는다(괌처럼 한 글자인 도시도 있다).
    if (flight || (!cityPick && q.length < 2)) {
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(cityPick ? `/api/flights/search?city=${encodeURIComponent(cityPick.city)}` : `/api/flights/search?q=${encodeURIComponent(q)}`);
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
  }, [query, cityPick, flight, offline, retry]);

  // 이전 질문으로 돌아가 값을 바꾼 횟수를 센다(잘못 넣어 고친 횟수).
  const touched = () => {
    if (revisiting.current) {
      revisiting.current = false;
      setEditCount((n) => n + 1);
    }
  };

  // 직전 값을 받아 바꾼다. 두 항목을 빠르게 연달아 눌러도 하나가 빠지지 않는다.
  const toggle = (code: string, group: Group, single: boolean) => {
    touched();
    setChoices((list) => {
      if (list.includes(code)) return list.filter((c) => c !== code);
      const rest = single ? list.filter((c) => !itemsOf(group).some((i) => i.code === c)) : list;
      return [...rest, code];
    });
  };

  const typeFlight = (value: string) => {
    touched();
    // 편명(KE123) 말고 도착 도시(도쿄, tokyo)나 편명의 숫자만 넣어도 찾는다. 그래서 한글과 띄어쓰기도 받는다.
    setQuery(value.toUpperCase().replace(/[^A-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ ]/g, "").replace(/^ +/, "").slice(0, 16));
    setOptions(null);
    setFlight(null);
    setCityPick(null);
    setCityOpen(false);
    setBucket(null);
    setAirline(null);
  };
  // 도시를 고르거나 도시 고르기를 닫으면 초점을 항공편 칸으로 돌려준다. (도시 고르기가 사라지면서 초점이 화면 밖으로 빠지지 않게)
  const flightZone = useRef<HTMLDivElement>(null);
  const cityState = `${cityOpen}-${cityPick?.city ?? ""}`;
  const lastCityState = useRef(cityState);
  useEffect(() => {
    if (lastCityState.current === cityState) return;
    lastCityState.current = cityState;
    if (!cityOpen) flightZone.current?.focus({ preventScroll: true });
  }, [cityState, cityOpen]);

  const pickCity = (d: Destination) => {
    touched();
    setQuery("");
    setOptions(null);
    setFlight(null);
    setBucket(null);
    setAirline(null);
    setCityPick(d);
    setCityOpen(false);
  };

  const goTo = (target: number, revisit: boolean) => {
    revisiting.current = revisit;
    setError(null);
    setStep(target);
  };
  const back = () => (step === 0 ? onExit() : goTo(step - 1, true));
  const next = () => {
    // 첫 질문을 넘기면 "등록을 시작했다"고 센다. 안내 방식을 켰는지와 함께 남겨, 켰을 때와 껐을 때의 완료 비율을 견준다.
    // 직원이 대신 넣는 등록은 세지 않는다.
    if (step === 0 && startAdapted.current === null) {
      startAdapted.current = isAdapted(choices);
      if (mode !== "assisted") {
        fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "reg_start", adapted: startAdapted.current }),
          keepalive: true,
        }).catch(() => {});
      }
    }
    goTo(step + 1, false);
  };

  async function submit() {
    if (!flight || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "assisted" ? "/api/desk/register" : "/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flightDate: flight.flightDate,
          flightNo: flight.flightNo,
          choices,
          lang,
          consent: true,
          startedAt: startedAt.current,
          editCount,
          startAdapted: startAdapted.current ?? isAdapted(choices),
        }),
      });
      const data = await res.json();
      // 서버의 오류 문구는 한국어다. 영어 화면에서는 한 가지 안내로 바꿔 보여준다.
      if (!res.ok) {
        setError(lang === "en" ? t.failed : (data.error ?? t.failed));
        return;
      }
      onDone({ token: data.token, passNo: data.passNo, lang, choices });
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  // 후보가 많을 때만 출발 시간대 단추를 보여 준다. 몇 편 안 되면 그대로 고르는 편이 빠르다.
  const MANY = 8;
  const buckets = options && options.length > MANY ? bucketsOf(options, t) : [];
  // 시간대 단추가 나왔으면 하나를 누르기 전에는 목록을 펼치지 않는다. 수십 편이 한꺼번에 쏟아지지 않게 한다.
  // 고른 뒤에 시간이 지나 그 시간대의 편이 모두 떠났으면, 고르지 않은 것으로 되돌린다.
  const bucketNow = bucket !== null && (bucket === "all" || buckets.some((b) => b.key === bucket)) ? bucket : null;
  const inBucket = buckets.length <= 1 ? (options ?? []) : bucketNow === null ? [] : (options ?? []).filter((o) => bucketNow === "all" || bucketKey(o) === bucketNow);
  // 시간대를 골라도 편이 많으면(도쿄는 한 시간대에 마흔 편) 항공사를 한 번 더 묻는다.
  const airlines = inBucket.length > MANY ? [...new Set(inBucket.map((o) => o.airline).filter(Boolean))].sort((x, y) => x.localeCompare(y, "ko")) : [];
  const askAirline = airlines.length > 1;
  const airlineName = (name: string) => {
    const sample = inBucket.find((o) => o.airline === name);
    return sample ? airlineLabel(lang, sample) : name;
  };
  const airlineNow = airline !== null && (airline === "all" || airlines.includes(airline)) ? airline : null;
  const shownOptions = !askAirline ? inBucket : airlineNow === null ? [] : inBucket.filter((o) => airlineNow === "all" || o.airline === airlineNow);
  // 도착 도시에서 고르는 동안에는 편명 입력란을 치우고 그 자리에 도시와 편 목록을 보여 준다.
  const cityMode = cityOpen || cityPick !== null;

  const pickedIn = (g: Group) => itemsOf(g).filter((i) => choices.includes(i.code));
  const groupOfStep: Group | null = kind === "guide" || kind === "move" || kind === "facility" || kind === "staff" ? kind : null;
  const titleOf: Record<StepKind, string> = {
    guide: t.guideTitle,
    consent: t.consentTitle,
    move: t.moveTitle,
    facility: t.facilityTitle,
    staff: t.staffTitle,
    flight: t.flightTitle,
    review: t.reviewTitle,
  };
  const hintOf: Partial<Record<StepKind, string>> = {
    guide: t.guideHint,
    move: t.moveHint,
    facility: t.facilityHint,
    staff: t.staffHint,
    flight: cityMode ? undefined : kiosk ? t.flightHintKiosk : t.flightHint,
  };

  // 항공편 화면은 한 화면 안에서 내용이 여러 번 바뀐다(도시 고르기, 시간대, 항공사, 편 목록). 바뀔 때마다 그 내용을 읽어 준다.
  const flightLine = (o: FlightOption) => `${o.flightNo.split("").join(" ")}, ${destOf(o)}, ${whenOf(o)}${o.airline ? `, ${airlineLabel(lang, o)}` : ""}`;
  const READ_MAX = 6;
  const flightSpeak: string[] = flight
    ? [cityPick ? t.flightPickedCity : t.flightPicked, flightLine(flight)]
    : cityOpen
      ? [t.cityTitle, t.cityPopular]
      : options === null
        ? searching
          ? [t.searching]
          : error
            ? [error]
            : []
        : options.length === 0
          ? [t.flightNotFound]
          : buckets.length > 1 && bucketNow === null
            ? [cityPick ? (lang === "en" ? cityPick.en : cityPick.city) : "", t.whenAsk, ...buckets.map((x) => x.label), t.allTimes]
            : askAirline && airlineNow === null
              ? [t.airlineAsk, ...airlines.map(airlineName), t.allTimes]
              : [t.pickFlight, ...shownOptions.slice(0, READ_MAX).map(flightLine)];
  const flightKey = kind === "flight" ? flightSpeak.join("|") : "";

  // 소리로 읽어 줄 글. 제목, 설명, 고를 것들.
  const speakText = declined
    ? `${t.declinedTitle}. ${t.declinedBody}`
    : [
        // 항공편 화면에서 내용이 바뀐 뒤에는 제목과 설명을 되풀이하지 않고 바뀐 내용만 읽는다.
        ...(kind === "flight" && flightSpeak.length > 0 ? flightSpeak : [titleOf[kind], hintOf[kind] ?? ""]),
        ...(groupOfStep ? itemsOf(groupOfStep).map(itemLabel) : []),
        ...(kind === "consent"
          ? [t.whatTitle, t.whatBody, t.useTitle, t.useBody, t.whenTitle, t.whenBody, t.keepTitle, t.keepBody, t.consentNote]
          : []),
        ...(kind === "review" && flight
          ? [`${flight.flightNo}, ${destOf(flight)}, ${whenOf(flight)}`, ...GROUPS.flatMap((g) => pickedIn(g).map(itemLabel))]
          : []),
      ]
        .filter(Boolean)
        .join(". ");

  if (declined) {
    return (
      <FlowShell lang={lang} prefs={prefs} kiosk={kiosk} screenKey="declined" speakText={speakText} onBack={() => setDeclined(false)} onHome={onExit}>
        <div className="empty" role="status">
          <span className="bubble">
            <Check size={28} aria-hidden="true" />
          </span>
          <h1>{t.declinedTitle}</h1>
          <p>{t.declinedBody}</p>
          <button className="btn" onClick={() => setDeclined(false)}>
            {t.declinedBack}
          </button>
        </div>
      </FlowShell>
    );
  }

  const canNext = kind === "flight" ? flight !== null : true;
  const emptyStep = groupOfStep !== null && groupOfStep !== "guide" && pickedIn(groupOfStep).length === 0;

  const cta =
    kind === "review" ? (
      <button className="btn btn-primary" onClick={submit} disabled={busy}>
        {busy ? t.submitting : t.submit}
      </button>
    ) : kind === "consent" ? (
      <>
        <button className="btn btn-primary" onClick={next}>
          {t.agree}
          <ArrowRight size={22} aria-hidden="true" />
        </button>
        <button className="btn btn-ghost" onClick={() => setDeclined(true)}>
          {t.decline}
        </button>
      </>
    ) : (
      <button className="btn btn-primary" onClick={next} disabled={!canNext}>
        {emptyStep ? t.skip : t.next}
        <ArrowRight size={22} aria-hidden="true" />
      </button>
    );

  return (
    <FlowShell
      lang={lang}
      prefs={prefs}
      kiosk={kiosk}
      screenKey={kind}
      speakText={speakText}
      speakKey={flightKey}
      onBack={back}
      onHome={onExit}
      progress={{ n: step + 1, total: ORDER.length, name: t.steps[kind] }}
      // 키오스크의 항공편 화면에서는 편을 고를 때까지 「다음」을 치워 둔다. 화면 글자판과 도시 목록이 버튼에 가려지지 않는다.
      cta={kiosk && kind === "flight" && !flight ? undefined : cta}
      ctaAfterContent={kind === "consent"}
    >
      <h1>{titleOf[kind]}</h1>
      {hintOf[kind] && <p className="lead">{hintOf[kind]}</p>}

      {kind === "guide" && (
        <div className="lang-pick" role="radiogroup" aria-label={t.language} onKeyDown={radioKeys}>
          <span className="lang-pick-label">{t.language} · Language</span>
          {(["ko", "en"] as const).map((l) => (
            <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)} lang={l}>
              {l === "ko" ? "한국어" : "English"}
            </button>
          ))}
        </div>
      )}

      {groupOfStep && (
        <div
          role={groupOfStep === "staff" ? "radiogroup" : "group"}
          aria-label={groupLabel(groupOfStep)}
          className="choices"
          onKeyDown={groupOfStep === "staff" ? radioKeys : undefined}
        >
          {itemsOf(groupOfStep).map((i) => (
            <Choice
              key={i.code}
              code={i.code}
              label={itemLabel(i)}
              note={i.code === "mov_wheelchair_need" ? t.wheelchairNote : undefined}
              single={groupOfStep === "staff"}
              checked={choices.includes(i.code)}
              onToggle={() => toggle(i.code, groupOfStep, groupOfStep === "staff")}
            />
          ))}
        </div>
      )}

      {kind === "consent" && (
        <>
          <div className="panel">
            <InfoRow icon={<FileText size={22} aria-hidden="true" />} title={t.whatTitle} body={t.whatBody} />
            <InfoRow icon={<MonitorSmartphone size={22} aria-hidden="true" />} title={t.useTitle} body={t.useBody} />
            <InfoRow icon={<Trash2 size={22} aria-hidden="true" />} title={t.whenTitle} body={t.whenBody} />
            <InfoRow icon={<BarChart3 size={22} aria-hidden="true" />} title={t.keepTitle} body={t.keepBody} />
          </div>
          <p className="fine">{t.consentNote}</p>
        </>
      )}

      {kind === "flight" && (
        <div className="flight-layout">
          <div ref={flightZone} tabIndex={-1} className="flight-zone">
            {!cityMode && (
              <>
                <label htmlFor="reg-flight">{kiosk ? t.flightLabelKiosk : t.flightLabel}</label>
                <div className="input-wrap">
                  <Search size={22} aria-hidden="true" />
                  <input
                    id="reg-flight"
                    type="text"
                    value={query}
                    placeholder={kiosk ? t.flightPlaceholderKiosk : t.flightPlaceholder}
                    // 키오스크에서는 화면의 글자판을 쓴다. 기기의 자판이 올라와 화면을 가리지 않게 한다.
                    inputMode={kiosk ? "none" : "text"}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="flight-state"
                    onChange={(e) => typeFlight(e.target.value)}
                  />
                </div>
              </>
            )}
            <p className="hint" id="flight-state" aria-live="polite">
              {flight
                ? cityPick
                  ? t.flightPickedCity
                  : t.flightPicked
                : cityOpen
                  ? ""
                  : searching && options === null
                    ? t.searching
                    : options && options.length > 0
                      ? buckets.length > 1 && bucketNow === null
                        ? t.whenFirst
                        : askAirline && airlineNow === null
                          ? t.airlineFirst
                          : t.pickFlight
                      : ""}
            </p>

            {cityPick && (
              <p className="picked-city">
                <MapPin size={20} aria-hidden="true" />
                <strong>{lang === "en" ? cityPick.en : cityPick.city}</strong>
                <button
                  className="link-btn"
                  onClick={() => {
                    setFlight(null);
                    setOptions(null);
                    setBucket(null);
    setAirline(null);
                    setCityPick(null);
                    setCityOpen(true);
                  }}
                >
                  {t.cityChange}
                </button>
                {flight && (
                  <button className="link-btn" onClick={() => setFlight(null)}>
                    {t.flightReselect}
                  </button>
                )}
              </p>
            )}

            {!flight && !searching && !cityOpen && options && options.length === 0 && (cityPick !== null || query.trim().length >= 2) && (
              <ErrorNote>{t.flightNotFound}</ErrorNote>
            )}

            {/* 도시에서 고른 편을 찾다가 연결이 끊기면 다시 찾을 길을 준다. */}
            {cityPick && !flight && !searching && options === null && error && (
              <button
                className="btn"
                onClick={() => {
                  setError(null);
                  setRetry((n) => n + 1);
                }}
              >
                {t.searchAgain}
              </button>
            )}

            {/* 편명을 모르면 도착 도시를 눌러 고른다. 글자를 치지 않아도 된다. */}
            {!flight && !cityOpen && !cityPick && (
              <button className="btn city-open" onClick={() => setCityOpen(true)}>
                <MapPin size={20} aria-hidden="true" />
                {t.cityOpen}
              </button>
            )}
            {!flight && cityOpen && <CityPicker lang={lang} t={t} onPick={pickCity} onClose={() => setCityOpen(false)} />}

            {/* 같은 곳으로 가는 편이 많으면 출발 시간대를 먼저 고르게 한다. */}
            {!flight && !cityOpen && buckets.length > 1 && (
              <div className="pick-row" role="group" aria-label={t.whenAsk}>
                <span className="pick-label">{t.whenAsk}</span>
                {buckets.map((b) => (
                  <button
                    key={b.key}
                    className={`pick ${bucketNow === b.key ? "on" : ""}`}
                    aria-pressed={bucketNow === b.key}
                    onClick={() => {
                      setBucket(b.key);
                      setAirline(null);
                    }}
                  >
                    {b.label}
                  </button>
                ))}
                <button
                  className={`pick ${bucketNow === "all" ? "on" : ""}`}
                  aria-pressed={bucketNow === "all"}
                  onClick={() => {
                    setBucket("all");
                    setAirline(null);
                  }}
                >
                  {t.allTimes}
                </button>
              </div>
            )}
            {!flight && !cityOpen && askAirline && (
              <div className="pick-row" role="group" aria-label={t.airlineAsk}>
                <span className="pick-label">{t.airlineAsk}</span>
                {airlines.map((name) => (
                  <button key={name} className={`pick ${airlineNow === name ? "on" : ""}`} aria-pressed={airlineNow === name} onClick={() => setAirline(name)}>
                    {airlineName(name)}
                  </button>
                ))}
                <button className={`pick ${airlineNow === "all" ? "on" : ""}`} aria-pressed={airlineNow === "all"} onClick={() => setAirline("all")}>
                  {t.allTimes}
                </button>
              </div>
            )}

            {!cityOpen && (
              <div role="radiogroup" aria-label={t.flightChoice} className="choices" onKeyDown={radioKeys} data-browse="">
                {(flight ? [flight] : shownOptions).map((o) => (
                  <button
                    key={`${o.flightDate}-${o.flightNo}`}
                    role="radio"
                    aria-checked={sameFlight(flight, o)}
                    className={`flight-opt ${sameFlight(flight, o) ? "on" : ""} ${o.cancelled ? "cancelled" : ""}`}
                    onClick={() => {
                      touched();
                      setFlight(o);
                      // 도시에서 고른 경우에는 입력란을 비워 둔다. 「다른 편 고르기」로 목록에 돌아갈 수 있다.
                      if (!cityPick) setQuery(o.flightNo);
                    }}
                  >
                    <span className="flight-opt-no num">{o.flightNo}</span>
                    <span className="flight-opt-main">
                      <strong>{destOf(o)}</strong>
                      <span>
                        {whenOf(o)} {o.cancelled ? `· ${t.cancelled}` : t.departs}
                      </span>
                      {o.airline && <span>{airlineLabel(lang, o)}</span>}
                    </span>
                    <span className="choice-mark" aria-hidden="true">
                      <Check size={18} strokeWidth={3} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {flight?.cancelled && <ErrorNote>{t.cancelledNote}</ErrorNote>}
            {/* 편명으로 찾아 고른 편도 눌러서 바꿀 수 있게 한다. 키오스크는 편을 고르면 글자판이 사라지므로 이 버튼이 있어야 바꿀 수 있다. */}
            {flight && !cityPick && (
              <button className="link-btn" onClick={() => setFlight(null)}>
                {t.flightReselect}
              </button>
            )}
          </div>

          {/* 가로로 놓인 키오스크에서는 글자판이 입력란 옆에 온다. 글자판이 「다음」 버튼 밑으로 내려가지 않는다. */}
          {kiosk && !flight && !cityOpen && !cityPick && (
            <AlnumPad onKey={(k) => typeFlight(query + k)} onErase={() => typeFlight(query.slice(0, -1))} eraseLabel={t.erase} />
          )}
        </div>
      )}

      {kind === "review" && flight && (
        <div className="panel">
          <dl className="review">
            <dt>
              {t.steps.flight}
              <button className="review-edit" onClick={() => goTo(ORDER.indexOf("flight"), true)}>
                {t.edit}
              </button>
            </dt>
            <dd>
              <Plane size={18} aria-hidden="true" /> <b className="num">{flight.flightNo}</b>
              {/* 줄이 넘어가도 가운뎃점이 줄 맨 앞에 오지 않게 한 덩어리로 둔다. */}
              <span>
                {destOf(flight)} · {whenOf(flight)}
              </span>
            </dd>
            {GROUPS.map((g) => (
              <ReviewGroup
                key={g}
                title={t.steps[g]}
                edit={t.edit}
                onEdit={() => goTo(ORDER.indexOf(g), true)}
                items={[...(g === "guide" ? [lang === "en" ? "English" : "한국어"] : []), ...pickedIn(g).map(itemLabel)]}
                empty={t.notPicked}
              />
            ))}
          </dl>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
    </FlowShell>
  );
}

function InfoRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="info-row">
      <span className="bubble">{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}

function ReviewGroup({ title, edit, onEdit, items, empty }: { title: string; edit: string; onEdit: () => void; items: string[]; empty: string }) {
  return (
    <>
      <dt>
        {title}
        <button className="review-edit" onClick={onEdit} aria-label={`${title} ${edit}`}>
          {edit}
        </button>
      </dt>
      {items.length === 0 ? <dd className="muted">{empty}</dd> : items.map((i) => <dd key={i}>{i}</dd>)}
    </>
  );
}
