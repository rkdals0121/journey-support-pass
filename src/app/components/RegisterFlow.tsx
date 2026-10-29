"use client";
import { Sunflower } from "./Sunflower";

import { ArrowRight, BarChart3, Check, FileCheck2, FileText, MapPin, Minus, MonitorSmartphone, Plane, Plus, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BRANCHES,
  labelOf,
  branchesOf,
  groupsOfBranch,
  GROUP_EN,
  GROUP_LABEL,
  isAdapted,
  itemsOf,
  NO_EXTRA,
  NOTE_MAX,
  PARTY_MAX,
  prefsOf,
  SINGLE,
  STROLLER_MAX,
  toggleChoice,
  type Branch,
  type Extra,
  type Group,
  type Item,
  type Prefs,
} from "@/lib/catalog";
import { airlineLabel } from "@/lib/airline-en";
import { destLabel } from "@/lib/dest-en";
import type { GuideDto } from "@/lib/guide";
import { textOf, type Lang } from "@/lib/i18n";
import { ErrorNote } from "./Alert";
import { bucketKey, bucketsOf, CityPicker, type Destination } from "./FlightFinder";
import { FlowShell } from "./FlowShell";
import { DocScan } from "./DocScan";
import { AlnumPad, Choice } from "./Inputs";
import type { Target } from "@/lib/docscan";
import type { BookingHandoff } from "@/lib/booking-model";
import { REGISTRATION_DRAFT, readRegistrationDraft, normalizeFlightQuery } from "@/lib/registration-draft";
import { TextSizeControl } from "./TextSizeControl";

export interface FlightOption {
  airline: string;
  flightDate: string;
  flightNo: string;
  destName: string;
  destCode: string;
  day: "today" | "tomorrow";
  time: string;
  cancelled: boolean;
  /** 먼 날짜에 미리 등록한 편. 운항 정보가 아직 없어 편명과 날짜만 있다. */
  later?: boolean;
}

export interface RegisterResult {
  token: string;
  passNo: string;
  lang: Lang;
  choices: string[];
}

interface Props {
  booking?: BookingHandoff;
  /**
   * 여객 휴대전화(web), 공항 키오스크(kiosk), 안내데스크 직원이 대신 입력(assisted),
   * 안내 키오스크에서 미리 등록한 내용을 고치기(edit). edit 는 항공편·동의·서류를 묻지 않는다.
   */
  mode: "web" | "kiosk" | "assisted" | "edit";
  initialLang: Lang;
  /** 첫 질문에서 「이전」이나 「처음으로」를 눌렀을 때. 등록 중에 고른 언어를 함께 준다. */
  onExit: (lang: Lang) => void;
  /** 첫 질문의 「이전」만 따로 받을 때. 주지 않으면 onExit 와 같다. 키오스크는 같은 여객이 처음 화면으로 돌아가는 것으로 다룬다. */
  onBackOut?: (lang: Lang) => void;
  onDone?: (result: RegisterResult) => void;
  /** 언어나 안내 방식이 바뀔 때마다 알린다. 키오스크가 「직원 부르기」 버튼의 말과 크기를 맞추는 데 쓴다. */
  onPrefs?: (lang: Lang, prefs: Prefs) => void;
  /** 들어온 접점. booking 이면 항공권 예매 완료 창의 링크로 들어왔다. 건수를 따로 세는 데만 쓴다. */
  via?: "booking" | "";
  /** edit: 고칠 등록. 키오스크가 탑승권으로 연 등록의 값과 지금 고른 것. */
  edit?: { token: string; choices: string[]; extra: Extra; onSaved: (guide: GuideDto) => void };
}

// 묻는 순서(팀 문서 「공항 이용 도움 체크리스트 (가지뻗기)」). 한 화면에 질문 하나.
//  1쪽 「어떤 점이 불편하세요?」 → 동의 → 2쪽 고른 불편의 가지만 하나씩 → 3쪽 세 가지(함께 가는 분, 도움 방식, 들를 곳)
//  → 항공편 → 마지막(서류, 더 하고 싶은 말씀) → 확인.
// 동의는 첫 질문 바로 뒤에 둔다. 첫 질문에서 무엇이 불편한지만 고르고, 자세한 답(건강과 관련될 수 있는 정보)은 동의한 뒤에 받는다.
// 서류는 휴대전화 등록에만 있다. 현장(키오스크, 안내데스크)에서는 지금처럼 체크인 카운터에서 확인받는다.
// 가지 수는 첫 질문에서 정해진다. 첫 질문을 넘긴 뒤에는 단계 수가 바뀌지 않는다.
type StepKind = "trouble" | "consent" | Branch | "companion" | "help" | "stops" | "flight" | "docs" | "note" | "review";

function orderOf(mode: Props["mode"], choices: string[]): StepKind[] {
  const middle: StepKind[] = [...branchesOf(choices), "companion", "help", "stops"];
  if (mode === "edit") return ["trouble", ...middle, "note", "review"];
  if (mode === "web") return ["trouble", "consent", ...middle, "flight", "docs", "note", "review"];
  return ["trouble", "consent", ...middle, "flight", "note", "review"];
}

const isBranch = (k: StepKind): k is Branch => BRANCHES.some((b) => b.branch === k);

/** 이 단계에서 고르는 묶음. */
function groupsOfStep(k: StepKind): Group[] {
  if (k === "trouble" || k === "companion" || k === "help" || k === "stops") return [k];
  return isBranch(k) ? groupsOfBranch(k) : [];
}

// 마지막 쪽의 서류. 고른 서류는 서버에 보내지 않는다(대상 유형은 민감정보라 공항이 갖지 않는 구조). 냈다는 사실만 보낸다.
type DocKey = "welfare" | "family" | "maternity" | "doctor";
const DOCS: { key: DocKey; target: Target }[] = [
  { key: "welfare", target: "disabled" },
  { key: "family", target: "family" },
  { key: "maternity", target: "pregnant" },
  { key: "doctor", target: "doctor" },
];

const SEARCH_DELAY_MS = 250;
// 편 찾기 한 번을 기다리는 가장 긴 시간. 약한 와이파이에서 답이 오지 않으면 「찾는 중…」이 끝없이 남고 「다시 찾기」도 나오지 않는다.
const SEARCH_TIMEOUT_MS = 10_000;
// 「등록하기」 한 번을 기다리는 가장 긴 시간. 답이 오지 않으면 「등록 중…」에 멈춘 채 다시 누를 수도 없다.
// 서버는 등록을 만들고 답만 늦을 수도 있어서 찾기보다 넉넉히 기다린다.
const SUBMIT_TIMEOUT_MS = 20_000;
// 안내데스크 직원의 로그인이 풀려 서버가 401 로 답하면 로그인 화면으로 보낸다.
const STAFF_LOGIN = "/staff/login";
// 키오스크 설치가 풀려 서버가 401 로 답하면 설치 화면으로 보낸다.
const KIOSK_SETUP = "/kiosk";
const sameFlight = (a: FlightOption | null, b: FlightOption) =>
  a !== null && a.flightDate === b.flightDate && a.flightNo === b.flightNo;

// 안내데스크 기기가 화면 글자판을 쓸 만큼 넓은지. 화면 글자판은 한 줄에 10칸이라, 이보다 좁으면 칸 하나가 손가락보다 좁아진다.
// 태블릿과 컴퓨터는 화면 글자판을 그대로 쓰고, 좁은 휴대전화는 기기의 자판을 쓴다.
const PAD_WIDE = "(min-width: 600px)";
function subscribePadWide(f: () => void) {
  const mq = window.matchMedia(PAD_WIDE);
  mq.addEventListener("change", f);
  return () => mq.removeEventListener("change", f);
}
const isPadWide = () => window.matchMedia(PAD_WIDE).matches;
// 서버에서 그릴 때는 화면 너비를 모른다. 예전처럼 글자판이 있는 쪽으로 그려 두고, 브라우저에서 곧바로 맞춘다.
const padWideOnServer = () => true;

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

/** 등록 질문. 휴대전화, 키오스크, 안내데스크가 같은 질문을 같은 순서로 쓴다. 안내 키오스크는 같은 질문으로 등록을 고친다. */
export function RegisterFlow({ mode, initialLang, onExit, onBackOut, onDone, onPrefs, via = "", edit, booking }: Props) {
  const kiosk = mode !== "web";
  // 편명을 화면 글자판으로 넣는지. 키오스크는 늘 쓰고, 안내데스크는 태블릿처럼 넓은 기기에서만 쓴다.
  // 좁은 휴대전화에 10칸 글자판을 띄우면 칸이 너무 좁아 잘못 누르기 쉬우므로 기기의 자판을 쓰게 한다.
  const padWide = useSyncExternalStore(subscribePadWide, isPadWide, padWideOnServer);
  const onScreenPad = mode === "kiosk" || (mode === "assisted" && padWide);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [choices, setChoices] = useState<string[]>(edit?.choices ?? []);
  const [extra, setExtra] = useState<Extra>(edit?.extra ?? NO_EXTRA);
  const prefs = prefsOf(choices);
  const t = textOf(lang, prefs.easy);

  const startedAt = useRef(new Date().toISOString());
  const startAdapted = useRef<boolean | null>(null);
  const revisiting = useRef(false);
  const [editCount, setEditCount] = useState(0);

  const [step, setStep] = useState(0);
  const [declined, setDeclined] = useState(false);
  const [query, setQuery] = useState("");
  const composing = useRef(false);
  const [isComposing, setIsComposing] = useState(false);
  const [draftReady, setDraftReady] = useState(mode !== "web");
  const draftFinished = useRef(false);
  const [options, setOptions] = useState<FlightOption[] | null>(null);
  // 편명을 모르는 여객은 도착 도시를 눌러 고른다. 편이 많으면 출발 시간대로 좁힌다.
  const [cityOpen, setCityOpen] = useState(false);
  const [cityPick, setCityPick] = useState<Destination | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [airline, setAirline] = useState<string | null>(null);
  // 먼 날짜 편을 미리 등록하는 칸(휴대전화 등록만). 항공권은 몇 달 전에 예매하므로 예매 직후에 등록할 수 있어야 한다.
  const [later, setLater] = useState(false);
  const [laterDate, setLaterDate] = useState("");
  const [laterNo, setLaterNo] = useState("");
  const [laterBad, setLaterBad] = useState(false);
  // 찾다가 연결이 끊겼을 때 「다시 찾기」로 한 번 더 찾게 한다.
  const [retry, setRetry] = useState(0);
  const [searching, setSearching] = useState(false);
  const [flight, setFlight] = useState<FlightOption | null>(mode === "web" ? booking?.flight ?? null : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 등록하지 못한 횟수. 확인 화면에서 실패할 때마다 늘려, 같은 화면에 새로 나타난 오류 글을 소리로 읽게 한다.
  const [failSeq, setFailSeq] = useState(0);
  // 고른 서류와 서류마다 인식되었는지. 서류는 이 기기 안에서 읽고(DocScan) 서버에는 "확인됨"만 간다.
  const [docs, setDocs] = useState<DocKey[]>([]);
  const [noDocs, setNoDocs] = useState(false);
  const [proofOk, setProofOk] = useState<Partial<Record<DocKey, boolean>>>({});
  const proofSent = docs.length > 0 && docs.every((x) => proofOk[x]);

  // Keep drafts on this browser history entry only; never save shared-kiosk answers.
  useEffect(() => {
    if (mode !== "web") return;
    const d = readRegistrationDraft(window.history.state?.[REGISTRATION_DRAFT], booking?.context ?? "");
    if (d) {
      setLang(d.lang); setChoices(d.choices); setExtra(d.extra);
      setStep(Math.min(d.step, orderOf(mode, d.choices).length - 1));
      setQuery(d.query); setLater(d.later); setLaterDate(d.laterDate); setLaterNo(d.laterNo);
      setFlight(d.flight ?? booking?.flight ?? null);
      setDocs(d.docs); setNoDocs(d.noDocs); setProofOk(d.proofOk);
    }
    setDraftReady(true);
  }, [mode, booking?.context, booking?.flight]);
  useEffect(() => {
    if (mode !== "web" || !draftReady || draftFinished.current) return;
    try {
      window.history.replaceState({ ...window.history.state, [REGISTRATION_DRAFT]: { at: Date.now(), context: booking?.context ?? "", lang, choices, extra, step, query, later, laterDate, laterNo, flight, docs, noDocs, proofOk } }, "");
    } catch { /* Registration still works if browser history storage is unavailable. */ }
  }, [mode, draftReady, booking?.context, lang, choices, extra, step, query, later, laterDate, laterNo, flight, docs, noDocs, proofOk]);

  const ORDER = orderOf(mode, choices);
  const kind: StepKind = ORDER[Math.min(step, ORDER.length - 1)];
  const itemLabel = (i: Item) => (lang === "en" ? i.en : i.label);
  const groupLabel = (g: Group) => (lang === "en" ? GROUP_EN[g] : GROUP_LABEL[g]);
  // 운항 정보의 도착지 이름은 한국어뿐이다. 영어 화면에서는 공항 코드로 영어 도시 이름을 찾아 쓴다.
  const destOf = (f: FlightOption) => destLabel(lang, f);
  const whenOf = (f: FlightOption) => (f.later ? t.dateLabel(f.flightDate) : `${f.day === "today" ? t.today : t.tomorrow} ${f.time}`);

  const onPrefsRef = useRef(onPrefs);
  onPrefsRef.current = onPrefs;
  useEffect(() => {
    onPrefsRef.current?.(lang, prefsOf(choices));
  }, [lang, choices]);

  // 편명을 넣는 동안 후보를 찾는다. 찾기 버튼을 따로 누르지 않아도 된다.
  const offline = t.offline;
  useEffect(() => {
    const q = query.trim();
    // 편 단계에서만 찾는다. 다른 단계로 가면 찾던 것을 끊고(늦은 오류가 다른 질문에 뜨지 않게), 돌아오면 다시 찾는다
    // (전에는 이전·다음으로 돌아오면 넣은 글자만 있고 목록도 「다시 찾기」도 없는 빈 화면이 됐다).
    // 도시에서 고른 경우는 글자 수와 상관없이 그 도시로 찾는다(괌처럼 한 글자인 도시도 있다).
    if (kind !== "flight" || isComposing || /[ㆍᆞ]/.test(q) || flight || (!cityPick && q.length < 2)) {
      setSearching(false);
      return;
    }
    let cancelled = false;
    // 답이 오지 않는 찾기는 끊는다. 끊긴 것은 catch 로 가서 연결 오류가 되고 「다시 찾기」가 나온다.
    // 글자를 더 넣거나 화면을 떠나 이 찾기가 쓸모없어져도 끊는다. 그때는 cancelled 라 오류로 알리지 않는다.
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const limit = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
      try {
        const res = await fetch(cityPick ? `/api/flights/search?city=${encodeURIComponent(cityPick.city)}` : `/api/flights/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setOptions(data.flights ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError(offline);
      } finally {
        clearTimeout(limit);
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [kind, query, cityPick, flight, offline, retry, isComposing]);

  // 이전 질문으로 돌아가 값을 바꾼 횟수를 센다(잘못 넣어 고친 횟수).
  const touched = () => {
    if (revisiting.current) {
      revisiting.current = false;
      setEditCount((n) => n + 1);
    }
  };

  // 직전 값을 받아 바꾼다. 두 항목을 빠르게 연달아 눌러도 하나가 빠지지 않는다.
  // 함께 고를 수 없는 것(「지금은 없어요」, 전동차 셋 가운데 하나 등)은 풀고, 첫 질문에서 푼 불편의 가지 답도 지운다.
  const toggle = (code: string) => {
    touched();
    setChoices((list) => toggleChoice(list, code));
    // 혼자 간다고 하면 모두 1명, 함께 간다고 하면 적어도 2명으로 맞춘다. 여객이 고친 수는 그대로 둔다.
    if (code === "cmp_alone") setExtra((x) => ({ ...x, party: 1 }));
    if (code === "cmp_with" || code === "cmp_more") setExtra((x) => ({ ...x, party: Math.max(2, x.party ?? 2) }));
  };

  // 편명 입력란에 넣었던 글(예: 703, 도쿄). 목록에서 편을 고르면 입력란이 그 편명으로 바뀌는데,
  // 「다른 편 고르기」를 누르면 이 글로 되돌려 아까의 목록이 다시 나오게 한다(고른 편 하나만 남지 않게).
  const pickedFrom = useRef("");

  const typeFlight = (value: string, inComposition = false) => {
    touched();
    pickedFrom.current = "";
    // 편명(KE123) 말고 도착 도시(도쿄, tokyo)나 편명의 숫자만 넣어도 찾는다. 그래서 한글과 띄어쓰기도 받는다.
    setQuery(inComposition ? value : normalizeFlightQuery(value));
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
  const toggleDoc = (x: DocKey) => {
    touched();
    setNoDocs(false);
    setDocs((list) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]));
  };
  const pickNoDocs = () => {
    touched();
    setNoDocs((v) => !v);
    setDocs([]);
  };
  const setProof = (x: DocKey, ok: boolean) => setProofOk((m) => (m[x] === ok ? m : { ...m, [x]: ok }));
  const back = () => (step === 0 ? (onBackOut ?? onExit)(lang) : goTo(step - 1, true));
  const next = () => {
    // 첫 질문을 넘기면 "등록을 시작했다"고 센다. 맞춤 화면을 켰는지와 함께 남겨, 켰을 때와 껐을 때의 완료 비율을 견준다.
    // 직원이 대신 넣는 등록과 키오스크에서 고치는 것은 세지 않는다.
    if (step === 0 && startAdapted.current === null) {
      startAdapted.current = isAdapted(choices);
      if (mode !== "assisted" && mode !== "edit") {
        fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "reg_start", adapted: startAdapted.current, via }),
          keepalive: true,
        }).catch(() => {});
      }
    }
    goTo(step + 1, false);
  };

  // 「등록하기」를 아주 빠르게 두 번 눌러도 한 번만 보낸다. busy 는 화면이 다시 그려진 뒤에야 바뀌어 같은 순간의 두 번째 누름을 막지 못한다.
  const sending = useRef(false);
  // 이 화면이 아직 떠 있는지와 보내는 중인 등록 요청. 「등록 중…」 사이에 「처음으로」나 자동 종료로 화면이 사라지면 요청을 끊고,
  // 늦게 온 답도 쓰지 않는다. 쓰면 떠난 여객의 패스가 다음 사람 앞에 열린다. 끊긴 것을 오류로 알리지도 않는다.
  // (개발 모드의 StrictMode 는 붙였다 떼었다 다시 붙이므로, 붙을 때마다 alive 를 다시 켠다.)
  const alive = useRef(true);
  const submitCtrl = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      submitCtrl.current?.abort();
    };
  }, []);
  async function submit() {
    if ((!flight && !edit) || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    // 실패했을 때만 다시 누를 수 있게 푼다. 등록이 되면 패스 화면으로 넘어갈 때까지 「등록 중…」으로 둔다.
    // 패스 화면을 불러오는 동안 버튼이 다시 살아나면, 안 된 줄 알고 또 눌러 등록이 하나 더 생기기 때문이다.
    const fail = (message: string) => {
      sending.current = false;
      setBusy(false);
      setError(message);
      setFailSeq((n) => n + 1);
    };
    // 답이 오지 않으면 끊는다. 끊긴 것은 catch 로 가서 연결 오류가 되고 다시 누를 수 있다.
    // 서버가 등록은 만들고 답만 늦었을 수도 있다. 그때 다시 누르면 등록이 하나 더 생기지만, 앞의 것은 출발 뒤 지워진다.
    const ctrl = new AbortController();
    submitCtrl.current = ctrl;
    const limit = setTimeout(() => ctrl.abort(), SUBMIT_TIMEOUT_MS);
    try {
      if (edit) {
        const res = await fetch("/api/kiosk/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: edit.token, choices, party: extra.party, strollers: extra.strollers, note: extra.note }),
          signal: ctrl.signal,
        });
        if (!alive.current) return;
        if (res.status === 401) return window.location.replace(KIOSK_SETUP);
        const data = await res.json();
        if (!alive.current) return;
        if (!res.ok) return fail(lang === "en" ? t.editFailed : (data.error ?? t.editFailed));
        edit.onSaved(data.guide);
        return;
      }
      if (!flight) return;
      const res = await fetch(mode === "assisted" ? "/api/desk/register" : "/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flightDate: flight.flightDate,
          flightNo: flight.flightNo,
          ...(mode === "web" && booking && sameFlight(flight, booking.flight) ? { bookingContext: booking.context } : {}),
          choices,
          party: extra.party,
          strollers: extra.strollers,
          note: extra.note,
          lang,
          consent: true,
          startedAt: startedAt.current,
          editCount,
          startAdapted: startAdapted.current ?? isAdapted(choices),
          // 증빙서류는 보내지 않는다. 냈다는 사실만 보낸다(시연에서는 이것으로 확인된 것으로 둔다).
          proof: mode === "web" && proofSent,
          via,
        }),
        signal: ctrl.signal,
      });
      if (!alive.current) return;
      // 안내데스크에서 직원 로그인이 풀렸으면 로그인 화면으로 보낸다. "등록하지 못했습니다"만으로는 다시 눌러도 계속 실패한다.
      if (mode === "assisted" && res.status === 401) return window.location.replace(STAFF_LOGIN);
      const data = await res.json();
      if (!alive.current) return;
      // 서버의 오류 문구는 한국어다. 영어 화면에서는 서버가 함께 주는 오류 종류(code)에 맞는 영어 안내를 보여준다.
      // 예를 들어 이미 출발한 편이면 "다시 해 주세요"만으로는 같은 오류를 되풀이하므로, 편을 다시 고르라고 알려야 한다.
      // 종류를 모르는 오류는 한 가지 안내로 바꿔 보여준다.
      if (!res.ok) {
        const code: unknown = data.code;
        const en =
          code === "booking_context" || code === "booking_conflict"
            ? "Demo booking lookup expired or changed. Use Search again to reload your flight."
            : code === "departed"
            ? t.regErrDeparted
            : code === "date"
              ? t.regErrDate
              : code === "flight"
                ? t.regErrFlight
                : code === "rate" || res.status === 429
                  ? t.regErrRate
                  : t.failed;
        fail(lang === "en" ? en : (data.error ?? t.failed));
        return;
      }
      if (mode === "web") {
        draftFinished.current = true;
        try {
          const state = { ...window.history.state };
          delete state[REGISTRATION_DRAFT];
          window.history.replaceState(state, "");
        } catch { /* A successful registration must still proceed if history is unavailable. */ }
      }
      onDone?.({ token: data.token, passNo: data.passNo, lang, choices });
    } catch {
      // 화면이 사라지며 끊은 것이면 아무것도 하지 않는다. 시간이 넘어 끊은 것은 연결 오류로 알린다.
      if (alive.current) fail(t.offline);
    } finally {
      clearTimeout(limit);
      if (submitCtrl.current === ctrl) submitCtrl.current = null;
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
  const stepGroups = groupsOfStep(kind);
  const stepName = (k: StepKind) => t.steps[k];
  const titleOf = (k: StepKind): string =>
    k === "trouble"
      ? t.troubleTitle
      : k === "consent"
        ? t.consentTitle
        : isBranch(k)
          ? t.branchTitle(stepName(k))
          : k === "companion"
            ? t.companionTitle
            : k === "help"
              ? t.helpTitle
              : k === "stops"
                ? t.stopsTitle
                : k === "flight"
                  ? t.flightTitle
                  : k === "docs"
                    ? t.docsTitle
                    : k === "note"
                      ? t.noteTitle
                      : edit
                        ? t.editReviewTitle
                        : t.reviewTitle;
  // Every registration step uses the same informational heading pattern.
  const kickerOf: Partial<Record<StepKind, string>> = lang === "en" ? {
    trouble: "Airport support preferences",
    consent: "Privacy and consent",
    companion: "Travel party",
    help: "Assistance preferences",
    stops: "Facilities along your route",
    flight: "Flight information",
    docs: "Supporting documents",
    note: "Additional support needs",
    review: "Registration summary",
  } : {
    trouble: "공항 이용 도움 안내",
    consent: "개인정보 수집·이용 안내",
    companion: "동반 인원 안내",
    help: "지원 방식 안내",
    stops: "공항 편의시설 안내",
    flight: "탑승 항공편 안내",
    docs: "증빙서류 안내",
    note: "추가 지원사항 안내",
    review: "등록 내용 확인",
  };
  const kicker = isBranch(kind)
    ? (lang === "en" ? `${stepName(kind)} · Support preferences` : `${stepName(kind)} 지원 안내`)
    : kickerOf[kind];
  const multipleSelectionStep = kind === "trouble" || kind === "stops" || kind === "help";
  const hint: string | undefined =
    kind === "trouble"
      ? t.troubleHint
      : isBranch(kind)
        ? t.branchHint
        : kind === "help"
          ? t.helpHint
          : kind === "stops"
            ? t.stopsHint
            : kind === "docs"
              ? t.docsHint
              : kind === "note"
                ? t.noteHint
                : kind === "flight"
                  ? cityMode
                    ? undefined
                    : onScreenPad
                      ? t.flightHintKiosk
                      : t.flightHint
                  : undefined;

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
  // 확인 화면에서 등록하지 못하면 화면은 그대로인 채 오류 글만 나타난다. 화면이 바뀔 때만 읽으므로 그 글은 저절로 읽히지 않는다.
  // 그래서 실패할 때마다 이 값을 바꿔 틀(FlowShell)이 다시 읽게 한다. 따로 읽으면 위쪽 「소리로 듣기」 버튼이 읽는 중인 줄 몰라,
  // 눌러도 멈추지 않고 처음부터 다시 읽는다. 다시 「등록하기」를 눌러 오류가 지워질 때는 값이 그대로라 읽지 않는다.
  const speakKey = kind === "flight" ? flightSpeak.join("|") : kind === "review" ? `fail-${failSeq}` : "";

  // 확인 화면에 보여 줄 묶음. 단계마다 그 단계에서 고른 것.
  const reviewSteps = ORDER.filter((k) => k !== "consent" && k !== "review");
  const answersOf = (k: StepKind): string[] => {
    // 먼 날짜에 미리 등록한 편은 도착지를 아직 모른다. 빈 칸은 빼고 잇는다.
    if (k === "flight") return flight ? [[flight.flightNo, destOf(flight), whenOf(flight)].filter(Boolean).join(" · ")] : [];
    if (k === "docs") {
      if (docs.length === 0) return noDocs ? [t.docs.none] : [];
      return [...docs.map((x) => t.docs[x]), proofSent ? t.proofSent(docs.length) : t.proofNotSent];
    }
    if (k === "note") return extra.note ? [extra.note] : [];
    const items = groupsOfStep(k).flatMap((g) => pickedIn(g).map(itemLabel));
    // 언어는 불편한 점이 아니므로 「언어 · 한국어」로 따로 밝혀 맨 뒤에 둔다.
    if (k === "trouble") return [...items, `${t.language} · ${lang === "en" ? "English" : "한국어"}`];
    if (k === "companion") {
      return [
        ...items,
        ...(extra.party !== null ? [t.partyOf(extra.party)] : []),
        ...(extra.strollers ? [t.strollersOf(extra.strollers)] : []),
      ];
    }
    return items;
  };

  // 소리로 읽어 줄 글. 제목, 설명, 고를 것들.
  const speakText = declined
    ? `${t.declinedTitle}. ${t.declinedBody}`
    : [
        // 확인 화면에서 등록하지 못했으면 그 까닭을 맨 먼저 읽는다.
        ...(kind === "review" && error ? [error] : []),
        // 항공편 화면에서 내용이 바뀐 뒤에는 제목과 설명을 되풀이하지 않고 바뀐 내용만 읽는다.
        ...(kind === "flight" && flightSpeak.length > 0 ? flightSpeak : [kicker ?? "", titleOf(kind), multipleSelectionStep ? (lang === "en" ? "Multiple selections allowed" : "중복 선택 가능") : hint ?? ""]),
        ...(kind === "trouble" ? [t.troubleRead] : []),
        ...stepGroups.flatMap((g) => [...(g === "buggy" ? [t.buggyAsk] : []), ...itemsOf(g).map(itemLabel)]),
        ...(kind === "trouble" ? [t.troubleProxy] : []),
        ...(kind === "companion" ? [t.partyLabel] : []),
        ...(kind === "docs" ? [...DOCS.map((d) => t.docs[d.key]), t.docs.none, t.docsUpload, t.docsKeep] : []),
        ...(kind === "note" ? [t.noteExample] : []),
        ...(kind === "consent"
          ? [t.whatTitle, t.whatBody, t.useTitle, t.useBody, t.whenTitle, t.whenBody, t.keepTitle, t.keepBody, t.consentNote]
          : []),
        ...(kind === "review" ? reviewSteps.flatMap((k) => answersOf(k)) : []),
      ]
        .filter(Boolean)
        .join(". ");

  if (declined) {
    return (
      <FlowShell lang={lang} prefs={prefs} kiosk={kiosk} screenKey="declined" speakText={speakText} onBack={() => setDeclined(false)} onHome={() => onExit(lang)}>
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
  const emptyStep =
    (stepGroups.length > 0 && stepGroups.every((g) => pickedIn(g).length === 0)) ||
    (kind === "docs" && docs.length === 0 && !noDocs) ||
    (kind === "note" && extra.note.trim() === "");

  const cta =
    kind === "review" ? (
      <button className="btn btn-primary" onClick={submit} disabled={busy}>
        {edit ? (busy ? t.editSaving : t.editSave) : busy ? t.submitting : t.submit}
      </button>
    ) : kind === "consent" ? (
      <>
        <div className="consent-decline"><button className="btn btn-ghost" onClick={() => setDeclined(true)}>{t.decline}</button></div>
        <button className="btn btn-primary" onClick={next}>
          {t.agree}
          <ArrowRight size={22} aria-hidden="true" />
        </button>
      </>
    ) : (
      <button className="btn btn-primary" onClick={next} disabled={!canNext}>
        {kind === "docs" && docs.length > 0 && !proofSent ? t.proofSkip : emptyStep ? t.skip : t.next}
        <ArrowRight size={22} aria-hidden="true" />
      </button>
    );

  const groupChoices = (g: Group) => {
    const single = SINGLE.includes(g);
    return (
      <div key={g} role={single ? "radiogroup" : "group"} aria-label={groupLabel(g)} className="choices" onKeyDown={single ? radioKeys : undefined}>
        {itemsOf(g).map((i) => (
          <Choice
            key={i.code}
            code={i.code}
            label={itemLabel(i)}
            note={i.code === "mov_wheelchair_need" ? t.wheelchairNote : undefined}
            single={single}
            checked={choices.includes(i.code)}
            onToggle={() => toggle(i.code)}
          />
        ))}
      </div>
    );
  };

  return (
    <FlowShell
      lang={lang}
      prefs={prefs}
      kiosk={kiosk}
      screenKey={kind}
      speakText={speakText}
      speakKey={speakKey}
      onBack={back}
      onHome={() => onExit(lang)}
      headerRightTools={
        <>
        {mode === "web" && <TextSizeControl en={lang === "en"} />}
        <label className="registration-language">
          <span>Language</span>
          <select aria-label={lang === "en" ? "Language" : "언어 설정"} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        </>
      }
      progress={{ n: step + 1, total: ORDER.length, name: stepName(kind) }}
      onStepSelect={index => { if (index < step) goTo(index, true); }}
      desktopSteps={
        mode === "web"
          ? ORDER.map((k, i) => ({
              label: stepName(k),
              current: i === step,
              done: i < step,
            }))
          : undefined
      }
      desktopSummary={
        mode === "web" ? (
          <>
            <span className="public-eyebrow">
              {lang === "en" ? "YOUR SAVED NEEDS" : "지금까지 선택한 내용"}
            </span>
            <h2>{lang === "en" ? "Registration summary" : "작성 내용 요약"}</h2>
            {choices.length ? (
              <ul>
                {choices.map((c) => (
                  <li key={c}>{labelOf(c, lang)}</li>
                ))}
              </ul>
            ) : (
              <p>
                {lang === "en"
                  ? "Your selections will appear here."
                  : "선택한 필요 정보가 여기에 표시돼요."}
              </p>
            )}

          </>
        ) : undefined
      }
      // 키오스크의 항공편 화면에서는 편을 고를 때까지 「다음」을 치워 둔다. 화면 글자판과 도시 목록이 버튼에 가려지지 않는다.
      cta={kiosk && kind === "flight" && !flight ? undefined : cta}
    >
      <div className="registration-page-heading">
      {kicker && <p className="kicker">{kicker}</p>}
      {mode === "web" && booking && sameFlight(flight, booking.flight) && <p className="booking-provenance" role="note">{lang === "en" ? "Demo booking · fictional flight. " : "시연 예약에서 불러온 가상 항공편입니다. "}<a href={"/prepare/booking" + (lang === "en" ? "?lang=en" : "")}>{lang === "en" ? "Search again (restarts registration)" : "다시 조회 (등록 처음부터)"}</a></p>}
      <div className="registration-question-heading">
        <h1>{titleOf(kind)}</h1>
        {multipleSelectionStep && <p className="multi-select-note"><Sunflower />{lang === "en" ? "Multiple selections" : "중복 선택 가능"}</p>}
      </div>
      {kind === "flight" && <p className="flight-search-note">{lang === "en" ? "Search by flight number or destination city." : "편명 또는 도착지로 항공편을 검색할 수 있습니다."}</p>}
      {hint && !multipleSelectionStep && kind !== "flight" && kind !== "note" && <p className="lead">{hint}</p>}
      </div>

      {kind === "walk" ? (
        <>
          {groupChoices("walk")}
          <h2>{t.buggyAsk}</h2>
          {groupChoices("buggy")}
        </>
      ) : (
        stepGroups.map(groupChoices)
      )}

      {kind === "trouble" && (
        <>
          <p className="fine">{t.troubleProxy}</p>
        </>
      )}

      {kind === "companion" && (
        <div className="steppers">
          <Stepper
            label={t.partyLabel}
            unit={t.partyUnit}
            value={extra.party}
            min={1}
            max={PARTY_MAX}
            t={t}
            onChange={(v) => {
              touched();
              setExtra((x) => ({ ...x, party: v }));
            }}
          />
          <Stepper
            label={t.strollerLabel}
            unit={t.strollerUnit}
            value={extra.strollers}
            min={0}
            max={STROLLER_MAX}
            t={t}
            onChange={(v) => {
              touched();
              setExtra((x) => ({ ...x, strollers: v }));
            }}
          />
        </div>
      )}

      {kind === "docs" && (
        <>
          <div role="group" aria-label={t.steps.docs} className="choices">
            {DOCS.map((d) => (
              <Choice key={d.key} code={`dc_${d.key}`} label={t.docs[d.key]} checked={docs.includes(d.key)} onToggle={() => toggleDoc(d.key)} />
            ))}
            <Choice code="dc_none" label={t.docs.none} checked={noDocs} onToggle={pickNoDocs} />
          </div>
          {docs.length > 0 && (
            <>
              <div className="info-row quiet">
                <span className="bubble">
                  <ShieldCheck size={22} aria-hidden="true" />
                </span>
                <div>
                  <strong>{t.docsUpload}</strong>
                  <span>{t.docsKeep}</span>
                </div>
              </div>
              <ul className="proof-list">
                {DOCS.filter((d) => docs.includes(d.key)).map((d) => (
                  <li key={d.key} className={proofOk[d.key] ? "proof-item on" : "proof-item"}>
                    <div className="proof-head">
                      <span className="bubble">{proofOk[d.key] ? <FileCheck2 size={22} aria-hidden="true" /> : <FileText size={22} aria-hidden="true" />}</span>
                      <div>
                        <strong>{t.docs[d.key]}</strong>
                      </div>
                    </div>
                    {/* 서류 사진은 이 기기 안에서 읽는다. 어디에도 올리지 않는다. */}
                    <DocScan target={d.target} t={t} mode={kiosk ? "kiosk" : "phone"} confirmed={proofOk[d.key] === true} onResult={(ok) => setProof(d.key, ok)} />
                  </li>
                ))}
              </ul>
              <p className="fine">{t.proofDemo}</p>
              {!proofSent && <p className="fine">{t.proofNoneNote}</p>}
            </>
          )}
        </>
      )}

      {kind === "note" && (
        <div className="note-field">
          <label htmlFor="reg-note" className="sr-only">
            {t.noteLabel}
          </label>
          <textarea
            id="reg-note"
            rows={4}
            maxLength={NOTE_MAX}
            value={extra.note}
            placeholder={t.noteExample}
            aria-describedby="reg-note-count"
            onChange={(e) => {
              touched();
              const note = e.target.value.slice(0, NOTE_MAX);
              setExtra((x) => ({ ...x, note }));
            }}
          />
          <p className="fine num" id="reg-note-count" aria-live="polite">
            {t.noteCount(extra.note.length, NOTE_MAX)}
          </p>
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
            {later ? (
              <LaterPanel
                t={t}
                date={laterDate}
                no={laterNo}
                bad={laterBad}
                picked={flight?.later ? flight : null}
                onDate={(v) => {
                  touched();
                  setLaterDate(v);
                  setLaterBad(false);
                  setFlight(null);
                }}
                onNo={(v) => {
                  touched();
                  setLaterNo(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7));
                  setLaterBad(false);
                  setFlight(null);
                }}
                onUse={() => {
                  // 모레부터 1년 안의 날짜, 편명 모양(KE123, 7C1105)만 본다. 운항 정보가 아직 없어 그 편이 있는지는 알 수 없다.
                  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
                  const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
                  const ok = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(laterNo) && laterDate >= plus(2) && laterDate <= plus(365);
                  if (!ok) return setLaterBad(true);
                  setFlight({ airline: "", flightDate: laterDate, flightNo: laterNo, destName: "", destCode: "", day: "tomorrow", time: "", cancelled: false, later: true });
                }}
                onClose={() => {
                  setLater(false);
                  setFlight(null);
                  flightZone.current?.focus({ preventScroll: true });
                }}
              />
            ) : (
              <>
            {!cityMode && (
              <>
                <label htmlFor="reg-flight">{onScreenPad ? t.flightLabelKiosk : t.flightLabel}</label>
                <div className="input-wrap">
                  <Search size={22} aria-hidden="true" />
                  <input
                    id="reg-flight"
                    type="text"
                    value={query}
                    placeholder={onScreenPad ? t.flightPlaceholderKiosk : t.flightPlaceholder}
                    // 화면 글자판을 쓰는 곳에서는 기기의 자판이 올라와 화면을 가리지 않게 한다.
                    inputMode={onScreenPad ? "none" : "text"}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="flight-state"
                    onCompositionStart={() => { composing.current = true; setIsComposing(true); }}
                    onCompositionEnd={(e) => { composing.current = false; setIsComposing(false); typeFlight(e.currentTarget.value); }}
                    onChange={(e) => typeFlight(e.target.value, composing.current || (e.nativeEvent as InputEvent).isComposing)}
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
                  <button
                    className="link-btn"
                    onClick={() => {
                      setFlight(null);
                      // 누른 버튼이 사라진다. 초점을 항공편 칸에 두어 키보드와 화면 읽기 프로그램이 제자리를 잃지 않게 한다.
                      flightZone.current?.focus({ preventScroll: true });
                    }}
                  >
                    {t.flightReselect}
                  </button>
                )}
              </p>
            )}

            {!flight && !searching && !cityOpen && options && options.length === 0 && (cityPick !== null || query.trim().length >= 2) && (
              <ErrorNote>{t.flightNotFound}</ErrorNote>
            )}

            {/* 편을 찾다가 연결이 끊기거나 답이 너무 늦어 끊었으면 다시 찾을 길을 준다. 편명을 넣어 찾을 때도 같다.
                없으면 키오스크에서는 글자를 지웠다 다시 넣어야 하고, 도시로 찾을 때는 도시를 다시 골라야 한다. */}
            {(cityPick !== null || query.trim().length >= 2) && !flight && !searching && !cityOpen && options === null && error && (
              <button
                className="btn"
                onClick={() => {
                  setError(null);
                  setRetry((n) => n + 1);
                  // 오류가 지워지면 이 버튼도 사라진다. 초점을 항공편 칸으로 옮겨 둔다.
                  flightZone.current?.focus({ preventScroll: true });
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
                      if (!cityPick) {
                        // 이미 고른 편을 한 번 더 누른 때는 입력란이 벌써 편명이다. 그때는 아까 넣은 글을 그대로 둔다.
                        if (!flight) pickedFrom.current = query;
                        setQuery(o.flightNo);
                      }
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
              <button
                className="link-btn"
                onClick={() => {
                  setFlight(null);
                  if (pickedFrom.current) setQuery(pickedFrom.current);
                  // 누른 버튼이 사라진다. 초점을 항공편 칸에 두어 키보드와 화면 읽기 프로그램이 제자리를 잃지 않게 한다.
                  flightZone.current?.focus({ preventScroll: true });
                }}
              >
                {t.flightReselect}
              </button>
            )}
            {/* 오늘·내일 편이 아니면 날짜를 골라 미리 등록한다(휴대전화 등록만). */}
            {mode === "web" && !flight && !cityOpen && !cityPick && (
              <button
                className="btn btn-ghost later-open"
                onClick={() => {
                  setLater(true);
                  setFlight(null);
                }}
              >
                {t.laterOpen}
              </button>
            )}
              </>
            )}
          </div>

          {/* 가로로 놓인 키오스크에서는 글자판이 입력란 옆에 온다. 글자판이 「다음」 버튼 밑으로 내려가지 않는다. */}
          {onScreenPad && !later && !flight && !cityOpen && !cityPick && (
            <AlnumPad onKey={(k) => typeFlight(query + k)} onErase={() => typeFlight(query.slice(0, -1))} eraseLabel={t.erase} />
          )}
        </div>
      )}

      {kind === "review" && (
        <div className="panel">
          <dl className="review">
            {reviewSteps.map((k) => (
              <ReviewGroup
                key={k}
                title={stepName(k)}
                icon={k === "flight" ? <Plane size={18} aria-hidden="true" /> : undefined}
                edit={t.edit}
                onEdit={() => goTo(ORDER.indexOf(k), true)}
                items={answersOf(k)}
                empty={k === "note" ? t.noteNone : t.notPicked}
              />
            ))}
          </dl>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
    </FlowShell>
  );
}

/** 먼 날짜 편을 미리 등록하는 칸. 날짜와 편명만 받는다. */
function LaterPanel({
  t,
  date,
  no,
  bad,
  picked,
  onDate,
  onNo,
  onUse,
  onClose,
}: {
  t: ReturnType<typeof textOf>;
  date: string;
  no: string;
  bad: boolean;
  picked: FlightOption | null;
  onDate: (v: string) => void;
  onNo: (v: string) => void;
  onUse: () => void;
  onClose: () => void;
}) {
  return (
    <div className="later">
      <h2>{t.laterTitle}</h2>
      <p className="hint">{t.laterHint}</p>
      <label htmlFor="later-date">{t.laterDate}</label>
      <input id="later-date" type="date" value={date} onChange={(e) => onDate(e.target.value)} />
      <label htmlFor="later-no">{t.laterNo}</label>
      <input
        id="later-no"
        type="text"
        value={no}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onNo(e.target.value)}
      />
      {bad && <ErrorNote>{t.laterBad}</ErrorNote>}
      {picked ? (
        <p className="later-picked" role="status">
          <Check size={20} aria-hidden="true" /> {t.laterPicked(picked.flightNo, t.dateLabel(picked.flightDate))}
        </p>
      ) : (
        <button className="btn" onClick={onUse} disabled={!date || no.length < 3}>
          {t.laterUse}
        </button>
      )}
      <button className="link-btn" onClick={onClose}>
        {t.laterClose}
      </button>
    </div>
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

/** 사람 수와 유모차 수. 모르는 값(null)은 「–」로 보이고, 가장 작은 수에서 한 번 더 줄이면 모르는 값으로 돌아간다. */
function Stepper({
  label,
  unit,
  value,
  min,
  max,
  t,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | null;
  min: number;
  max: number;
  t: { less: string; more: string };
  onChange: (v: number | null) => void;
}) {
  const shown = value ?? (min === 0 ? 0 : null);
  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="stepper-label">{label}</span>
      <button type="button" className="stepper-btn" aria-label={`${label} ${t.less}`} disabled={value === null} onClick={() => onChange(value === null || value <= min ? null : value - 1)}>
        <Minus size={22} aria-hidden="true" />
      </button>
      <output className="stepper-value num" aria-live="polite">
        {shown ?? "–"}
        {unit && <small> {unit}</small>}
      </output>
      <button type="button" className="stepper-btn" aria-label={`${label} ${t.more}`} disabled={value !== null && value >= max} onClick={() => onChange(value === null ? Math.max(min, 1) : value + 1)}>
        <Plus size={22} aria-hidden="true" />
      </button>
    </div>
  );
}

function ReviewGroup({
  title,
  icon,
  edit,
  onEdit,
  items,
  empty,
}: {
  title: string;
  icon?: React.ReactNode;
  edit: string;
  onEdit: () => void;
  items: string[];
  empty: string;
}) {
  return (
    <div className="registration-review-group">
      <dt>
        {title}
        <button className="review-edit" onClick={onEdit} aria-label={`${title} ${edit}`}>
          <Pencil size={15} aria-hidden="true" />
          {edit}
        </button>
      </dt>
      {items.length === 0 ? (
        <dd className="muted">{empty}</dd>
      ) : (
        items.map((i) => (
          <dd key={i}>
            {icon}
            {icon ? " " : ""}
            {i}
          </dd>
        ))
      )}
    </div>
  );
}
