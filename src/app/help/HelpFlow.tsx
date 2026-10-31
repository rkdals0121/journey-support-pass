"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLACES, NO_MEETING_PLACE } from "@/lib/airport";
import {
  requestPlaceOf as placeOf,
  reportLocationLabel,
  destinationPlaceOf,
} from "@/lib/service-locations";
import { labelOf } from "@/lib/catalog";
import {
  OPEN_REQUEST_STATES,
  SERVICE_LABEL,
  SERVICE_EN,
  requestStateLabel,
  type ServiceRequestView,
  type ServiceType,
} from "@/lib/service-request-model";
import { textOf } from "@/lib/i18n";
import { IdleGuard } from "../components/IdleGuard";
import { ReceiptQr } from "./ReceiptQr";
import { PickupChange } from "./PickupChange";
import { ReportLocationPicker } from "../components/ReportLocationPicker";
import { TrafficEntry } from "../components/TrafficEntry";
import { PlaceFinder } from "../components/PlaceFinder";
import { RequestStatusPanel } from "./RequestStatusPanel";
import { Robot } from "../components/Robot";
import { ServiceDetailsView } from "../components/ServiceDetailsView";
import {
  tasksFor,
  parseServiceDetails,
  type ServiceDetails,
} from "@/lib/service-tasks";
import { rememberRequestReceipt } from "@/lib/request-receipts";
import {
  ArrowRight,
  MapPin,
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Check,
  Volume2,
} from "lucide-react";
import { useSpeech } from "../components/useSpeech";
import { SERVICE_CATALOG, supportTopic } from "@/lib/service-catalog";
import { MobilityMapPlanner } from "../components/MobilityMapPlanner";

const STORAGE = "jsp-dx-receipt-v1";
// 작성 중인 요청(피드백: 뒤로 갔다 다시 들어와도 내용이 남아 있게). 접수하거나 30분이 지나면 지운다.
// 여러 사람이 쓰는 키오스크에서는 남기지 않는다. 다음 사람에게 앞사람의 내용이 보이면 안 된다.
const DRAFT = "jsp-dx-draft-v1";
const DRAFT_TTL_MS = 30 * 60_000;
interface Draft {
  at: number;
  topicId?: string;
  service: string;
  taskId: string;
  taskFields: Record<string, string>;
  placeId: string;
  destinationId: string;
  note: string;
  party: number;
  choices: string[];
  inputStep: number;
  trafficIntent: "choose" | "info" | "dispatch";
}
const STORAGE_SCOPE = "jsp-dx-receipt-registration-v1";
const supportCodes = [
  "mov_no_stairs",
  "mov_wheelchair_own",
  "gd_large",
  "gd_voice",
  "gd_easy",
  "hear_text",
];
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string = "",
    public alternatives?: { booking: string; staff: string },
  ) {
    super(message);
  }
}
async function post(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api/requests/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new RequestError(
      result.error ?? "요청을 처리하지 못했습니다 / Request failed",
      response.status,
      typeof result.code === "string" ? result.code : "",
      result.code === "support_unavailable" &&
      /^\/visits\?hub=[a-z0-9-]+$/.test(result.alternativeHref) &&
      /^\/help\?topic=guidance&place=[a-z0-9-]+&fresh=1$/.test(result.staffHref)
        ? { booking: result.alternativeHref, staff: result.staffHref }
        : undefined,
    );
  return result.request as ServiceRequestView;
}
export function HelpFlow({
  lang: initialLang,
  initialPlace = "",
  registrationToken,
  savedChoices = [],
  savedParty = 1,
  registrationError = false,
  sharedDevice = false,
  lockedPlace = false,
  assisted = false,
  initialReceipt,
  initialService = "guidance",
  initialTask = "",
  initialMobilityMode = "staff",
  mobilityHomeHref,
  initialNote = "",
  initialTopic,
  initialBusiness,
  returnTo,
  freshShared = false,
  checkExisting = false,
  embedded = false,
  freshPrivate = false,
}: {
  lang: "ko" | "en";
  initialPlace?: string;
  registrationToken?: string;
  savedChoices?: string[];
  savedParty?: number;
  registrationError?: boolean;
  sharedDevice?: boolean;
  lockedPlace?: boolean;
  assisted?: boolean;
  initialReceipt?: string;
  initialService?: ServiceType;
  initialTask?: string;
  initialMobilityMode?: "staff" | "robot";
  mobilityHomeHref?: string;
  initialNote?: string;
  initialTopic?: string;
  initialBusiness?: string;
  returnTo?: string;
  freshShared?: boolean;
  checkExisting?: boolean;
  embedded?: boolean;
  freshPrivate?: boolean;
}) {
  const [lang, setLang] = useState(initialLang);
  // The public header changes the URL locale without remounting this form.
  // Keep the form's language in sync while retaining its draft and receipt.
  useEffect(() => {
    if (embedded) setLang(initialLang);
  }, [embedded, initialLang]);
  const en = lang === "en";
  const [placeId, setPlaceId] = useState(
    initialTopic === "other"
      ? NO_MEETING_PLACE
      : (placeOf(initialPlace)?.id ?? ""),
  );
  const [service, setService] = useState<ServiceType>(initialService);
  const [choices, setChoices] = useState(savedChoices);
  const [party, setParty] = useState(savedParty);
  const [note, setNote] = useState(initialNote);
  const [topicId, setTopicId] = useState(initialTopic);
  const [businessId, setBusinessId] = useState(initialBusiness);
  const [destinationId, setDestinationId] = useState("");
  const [taskId, setTaskId] = useState(initialTask);
  const [taskFields, setTaskFields] = useState<Record<string, string>>({});
  const availableTasks = tasksFor(topicId ?? initialTopic ?? service);
  const task = availableTasks.find((t) => t.id === taskId) ?? availableTasks[0];
  const serviceDetails: ServiceDetails | undefined = task
    ? {
        task: task.id,
        fields: Object.fromEntries(
          task.fields
            .filter((f) => taskFields[f.id])
            .map((f) => [f.id, taskFields[f.id]]),
        ),
      }
    : undefined;
  const [consent, setConsent] = useState(false);
  const [review, setReview] = useState(false);
  const [inputStep, setInputStep] = useState(0);
  const [trafficIntent, setTrafficIntent] = useState<
    "choose" | "info" | "dispatch"
  >("choose");
  const [request, setRequest] = useState<ServiceRequestView | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<{
    booking: string;
    staff: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [large, setLarge] = useState(savedChoices.includes("gd_large"));
  const inFlight = useRef(false);
  const freshConsumed = useRef(false);
  const speech = useSpeech(lang);
  const tr = (ko: string, english: string) => (en ? english : ko);
  const registrationHome =
    registrationToken && !sharedDevice && !registrationError
      ? `/p/${registrationToken}`
      : undefined;
  const topic = supportTopic(topicId),
    referral = topic?.mode === "referral";
  const needsDetails = service === "robot" && !referral;
  const noMeeting = topic?.id === "other" && placeId === NO_MEETING_PLACE;
  const lastInputStep = noMeeting ? 0 : needsDetails ? 2 : 1;
  const lastPresentation = useRef(`${service}:${inputStep}:${review}`);
  useEffect(() => {
    const key = `${service}:${inputStep}:${review}`;
    if (lastPresentation.current === key) return;
    lastPresentation.current = key;
    if (service === "mobility" && !review) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      document.querySelector<HTMLElement>(review
        ? ".request-review-card h2"
        : `[data-request-step="${inputStep}"] h2`)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [service, inputStep, review]);
  const reviewIndex = noMeeting ? 1 : 2;
  // 작성 중인 내용 되살리기. 같은 서비스로 다시 들어왔을 때만, 키오스크가 아닐 때만, 새로 시작하기(fresh)가 아닐 때만.
  const draftReady = useRef(false);
  useEffect(() => {
    if (sharedDevice || freshPrivate || initialReceipt) {
      draftReady.current = true;
      return;
    }
    try {
      const d = JSON.parse(
        sessionStorage.getItem(DRAFT) ?? "null",
      ) as Draft | null;
      if (
        d &&
        Date.now() - d.at < DRAFT_TTL_MS &&
        (d.topicId ?? "") === (initialTopic ?? "")
      ) {
        setService(d.service as ServiceType);
        setTaskId(d.taskId);
        setTaskFields(d.taskFields);
        if (!initialPlace) setPlaceId(d.placeId);
        setDestinationId(d.destinationId);
        setNote(d.note);
        setParty(d.party);
        setChoices(d.choices);
        setInputStep(d.inputStep);
        setTrafficIntent(d.trafficIntent);
      } else if (d) sessionStorage.removeItem(DRAFT);
    } catch {}
    draftReady.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!draftReady.current || sharedDevice || request) return;
    const d: Draft = {
      at: Date.now(),
      topicId,
      service,
      taskId,
      taskFields,
      placeId,
      destinationId,
      note,
      party,
      choices,
      inputStep,
      trafficIntent,
    };
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify(d));
    } catch {}
  }, [
    sharedDevice,
    request,
    topicId,
    service,
    taskId,
    taskFields,
    placeId,
    destinationId,
    note,
    party,
    choices,
    inputStep,
    trafficIntent,
  ]);
  const applyRequest = useCallback(
    (r: ServiceRequestView) =>
      setRequest((old) =>
        !old || old.id !== r.id || r.version >= old.version ? r : old,
      ),
    [],
  );
  const forgetExpired = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE);
      sessionStorage.removeItem(STORAGE_SCOPE);
    } catch {}
    setReceipt(null);
    setRequest(null);
    setReview(false);
    setNote("");
    setChoices([]);
    setParty(1);
    setConsent(false);
    setError(
      "요청 보관 기간이 끝났습니다. 필요하면 새로 접수해 주세요 / This request has expired. You can make a new request.",
    );
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let saved: string | null = null;
    try {
      if (
        ((sharedDevice && freshShared) || freshPrivate) &&
        !freshConsumed.current
      ) {
        freshConsumed.current = true;
        sessionStorage.removeItem(DRAFT);
        if (freshPrivate) {
          const previous = sessionStorage.getItem(STORAGE);
          if (previous && /^[a-f0-9]{64}$/.test(previous))
            rememberRequestReceipt(previous);
        }
        if (
          !registrationToken ||
          sessionStorage.getItem(STORAGE_SCOPE) !== registrationToken
        ) {
          sessionStorage.removeItem(STORAGE);
          sessionStorage.removeItem(STORAGE_SCOPE);
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("fresh");
        window.history.replaceState(window.history.state, "", url);
      }
      if (
        sharedDevice &&
        registrationToken &&
        sessionStorage.getItem(STORAGE_SCOPE) !== registrationToken
      ) {
        sessionStorage.removeItem(STORAGE);
        sessionStorage.removeItem(STORAGE_SCOPE);
      }
      saved = initialReceipt ?? sessionStorage.getItem(STORAGE);
      if (initialReceipt) sessionStorage.setItem(STORAGE, initialReceipt);
    } catch {
      saved = initialReceipt ?? null;
    }
    if (!saved) {
      setRestoring(false);
      clearTimeout(timer);
      return;
    }
    setReceipt(saved);
    void post("status", { receipt: saved }, controller.signal)
      .then((r) => {
        if (active) applyRequest(r);
      })
      .catch((e: unknown) => {
        if (active && e instanceof RequestError && e.status === 410) {
          forgetExpired();
          return;
        }
        if (active)
          setError(
            "이전 요청을 불러오지 못했습니다. 다시 확인하거나 새 요청을 시작해 주세요 / Could not restore your request. Retry before starting another.",
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    initialReceipt,
    applyRequest,
    forgetExpired,
    sharedDevice,
    freshShared,
    freshPrivate,
    registrationToken,
  ]);
  useEffect(() => {
    if (!receipt || !request || !OPEN_REQUEST_STATES.includes(request.state))
      return;
    let active = true;
    let loading = false;
    let ctrl: AbortController | null = null;
    const load = async () => {
      if (loading) return;
      loading = true;
      ctrl = new AbortController();
      const limit = setTimeout(() => ctrl?.abort(), 10000);
      try {
        const r = await post("status", { receipt }, ctrl.signal);
        if (active) {
          applyRequest(r);
          setError("");
        }
      } catch (e) {
        if (
          active &&
          e instanceof RequestError &&
          [404, 410].includes(e.status)
        ) {
          forgetExpired();
          return;
        }
        if (active)
          setError(
            "연결이 끊겼습니다. 요청을 다시 보내지 말고 재연결을 기다려 주세요 / Connection lost. Your request may still be active.",
          );
      } finally {
        clearTimeout(limit);
        loading = false;
      }
    };
    const timer = setInterval(() => void load(), 5000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      ctrl?.abort();
      window.removeEventListener("focus", focus);
    };
  }, [receipt, request?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setAvailability(null);
    let key = receipt;
    try {
      if (!key) {
        key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
        setReceipt(key);
        try {
          sessionStorage.setItem(STORAGE, key);
          sessionStorage.setItem(STORAGE_SCOPE, registrationToken ?? "");
          sessionStorage.removeItem(DRAFT);
        } catch {}
      }
      const ctrl = new AbortController();
      const limit = setTimeout(() => ctrl.abort(), 15000);
      try {
        applyRequest(
          await post(
            "create",
            {
              receipt: key,
              placeId,
              service,
              // Linked assistance reuses registered needs without asking again.
              // Facility/business reports remain limited to their work-order details.
              choices: needsDetails
                ? choices
                : !referral && registrationToken
                  ? undefined
                  : [],
              party: referral ? 1 : party,
              note,
              ...(serviceDetails && (topicId || !businessId)
                ? { serviceDetails }
                : {}),
              lang,
              consent,
              registrationToken,
              assisted,
              // Generic and saved-registration entries still belong to the selected service's task.
              // Preserve explicit business-only legacy links rather than overwriting their owner.
              topicId: topicId ?? (!businessId ? service : undefined),
              ...(businessId ? { businessId } : {}),
              ...(destinationId ? { destinationId } : {}),
            },
            ctrl.signal,
          ),
        );
        if (!sharedDevice) rememberRequestReceipt(key);
      } finally {
        clearTimeout(limit);
      }
    } catch (e) {
      if (e instanceof RequestError && e.alternatives)
        setAvailability(e.alternatives);
      setError(
        en && e instanceof RequestError && e.code === "support_unavailable"
          ? "This service is unavailable now. Book another time or request staff guidance."
          : en && e instanceof RequestError && e.code === "duplicate_service"
            ? "A request for this service is already active for your registration. Ask staff to check the existing request."
            : e instanceof Error
              ? e.message
              : tr("연결을 확인해 주세요", "Check your connection"),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      applyRequest(await post("status", { receipt }));
      setError("");
    } catch (e) {
      if (e instanceof RequestError && e.status === 410) {
        forgetExpired();
        return;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (
      !receipt ||
      busy ||
      !window.confirm(tr("이 요청을 취소할까요?", "Cancel this request?"))
    )
      return;
    setBusy(true);
    try {
      applyRequest(await post("cancel", { receipt }));
      setError("");
    } catch (e) {
      if (e instanceof RequestError && e.status === 410) {
        forgetExpired();
        return;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function restart() {
    if (sharedDevice) {
      try {
        sessionStorage.removeItem(STORAGE);
        sessionStorage.removeItem(STORAGE_SCOPE);
      } catch {}
      window.location.assign(
        assisted ? "/staff/requests/new" : (returnTo ?? "/help"),
      );
      return;
    }
    try {
      sessionStorage.removeItem(STORAGE);
      sessionStorage.removeItem(STORAGE_SCOPE);
    } catch {}
    setReceipt(null);
    setRequest(null);
    setReview(false);
    setError("");
  }
  const basePlace = placeOf(placeId);
  const currentPlace =
    basePlace && topic?.id === "facility"
      ? {
          ...basePlace,
          label: reportLocationLabel(taskFields) || basePlace.label,
          labelEn: reportLocationLabel(taskFields, true) || basePlace.labelEn,
        }
      : basePlace;
  function advanceInput() {
    if (inputStep === 1 && !currentPlace) {
      setError(
        tr(
          topic?.id === "facility"
            ? "신고할 위치를 확인해 주세요."
            : "현재 위치 후보를 확인해 주세요.",
          "Confirm the location.",
        ),
      );
      document
        .getElementById(
          topic?.id === "facility" ? "report-area" : "dx-place-search",
        )
        ?.focus();
      return;
    }
    const controls = document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      `[data-request-step="${inputStep}"] input, [data-request-step="${inputStep}"] select, [data-request-step="${inputStep}"] textarea`,
    );
    for (const control of controls) if (!control.reportValidity()) return;
    setError("");
    setInputStep((v) => Math.min(lastInputStep, v + 1));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const readText = request
    ? `${requestStateLabel(request, lang)}. ${en ? request.placeEn : request.place}. ${request.reason}`
    : `${tr("지금 도움 요청하기", "Request help now")}. ${tr("현재 위치와 필요한 도움을 확인해 주세요. 사전등록은 서비스 예약 확정이 아닙니다.", "Confirm your pickup point and assistance. Pre-registration is not a confirmed service booking.")}`;
  function goBack() {
    setError("");
    if (review) return setReview(false);
    if (inputStep > 0) {
      setInputStep((v) => v - 1);
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (topic?.id === "traffic" && trafficIntent === "dispatch")
      return setTrafficIntent("choose");
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/services" + (en ? "?lang=en" : ""));
  }
  const requestDetails = (<section
                  className="request-section"
                  data-request-step="0"
                  onFocusCapture={() => setInputStep(0)}
                >
                  <h2 tabIndex={-1}>
                    <span>1</span>
                    {topic
                      ? tr("요청 내용", "Request details")
                      : tr("필요한 서비스", "Your service")}
                    {topic && (
                      <Link
                        className="request-change-service"
                        href={"/services" + (en ? "?lang=en" : "")}
                      >
                        {tr("서비스 변경", "Change service")}
                      </Link>
                    )}
                  </h2>
                  {!topic && (
                    <fieldset className="request-service-options">
                      <legend className="sr-only">
                        {tr("서비스 선택", "Choose service")}
                      </legend>
                      {SERVICE_CATALOG.filter(
                        (s) => s.id !== "other" && s.id !== "lost-property",
                      ).map((s) => (
                        <label
                          key={s.id}
                          className={
                            (topicId ?? service) === s.id ? "selected" : ""
                          }
                        >
                          <input
                            type="radio"
                            name="service"
                            value={s.id}
                            checked={(topicId ?? service) === s.id}
                            onChange={() => {
                              setService(s.service);
                              if (placeId === NO_MEETING_PLACE) setPlaceId("");
                              setTopicId(s.id);
                              setBusinessId(undefined);
                              setTaskId("");
                              setTaskFields({});
                              setDestinationId("");
                            }}
                          />
                          <span>{en ? s.en : s.label}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {topic?.id === "robot" && <RobotIntro en={en} />}
                  {task && (
                    <>
                      <fieldset className="request-task-options">
                        <legend className={topic ? "sr-only" : undefined}>
                          {tr("이용할 서비스", "Service option")}
                        </legend>
                        {availableTasks.map((t) => (
                          <label
                            key={t.id}
                            className={task.id === t.id ? "selected" : ""}
                          >
                            <input
                              type="radio"
                              name="service-task"
                              value={t.id}
                              checked={task.id === t.id}
                              onChange={() => {
                                setTaskId(t.id);
                                setTaskFields({});
                                setDestinationId("");
                              }}
                            />
                            {en ? t.en : t.label}
                          </label>
                        ))}
                      </fieldset>
                      {/* 피드백: 직접 적는 칸 바로 위에 눈에 띄는 개인정보 경고. */}
                      {task.fields.some(
                        (f) =>
                          !f.legacy &&
                          !f.options &&
                          f.type !== "datetime-local",
                      ) && <PrivacyWarning en={en} />}
                      <div className="service-task-fields">
                        {task.fields
                          .filter((f) => !f.legacy)
                          .map((f) => (
                            <div key={f.id}>
                              <label htmlFor={"task-" + f.id}>
                                {en ? f.en : f.label}
                                {f.required && (
                                  <span
                                    className="required-dot"
                                    aria-hidden="true"
                                  >
                                    {" "}
                                    *
                                  </span>
                                )}
                              </label>
                              {f.placeholder && (
                                <p className="service-field-example">
                                  {en ? f.placeholderEn : f.placeholder}
                                </p>
                              )}
                              {f.options ? (
                                <select
                                  id={"task-" + f.id}
                                  value={taskFields[f.id] ?? ""}
                                  required={f.required}
                                  onChange={(e) =>
                                    setTaskFields((v) => ({
                                      ...v,
                                      [f.id]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">
                                    {tr("선택해 주세요", "Choose an option")}
                                  </option>
                                  {f.options.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {en ? o.en : o.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  id={"task-" + f.id}
                                  type={f.type ?? "text"}
                                  placeholder={
                                    en ? f.placeholderEn : f.placeholder
                                  }
                                  maxLength={120}
                                  value={taskFields[f.id] ?? ""}
                                  required={f.required}
                                  onChange={(e) =>
                                    setTaskFields((v) => ({
                                      ...v,
                                      [f.id]: e.target.value,
                                    }))
                                  }
                                />
                              )}
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                  {topic?.id === "traffic" && (
                    <button
                      type="button"
                      className="booking-sample"
                      onClick={() => setTrafficIntent("info")}
                    >
                      {tr(
                        "현장 지원 대신 이용 안내 보기",
                        "View travel information instead",
                      )}
                    </button>
                  )}
                  {topic?.id === "other" && (
                    <label className="request-check">
                      <input
                        type="checkbox"
                        checked={placeId === NO_MEETING_PLACE}
                        onChange={(e) => {
                          setPlaceId(e.target.checked ? NO_MEETING_PLACE : "");
                          setInputStep(0);
                          setConsent(false);
                        }}
                      />
                      {tr(
                        "만나지 않음 · 온라인으로 내용 전달",
                        "No meeting · send the request online",
                      )}
                    </label>
                  )}
                </section>);
  const requestAdditional = <>{needsDetails && (
                  <section
                    className="request-section"
                    data-request-step="2"
                    onFocusCapture={() => setInputStep(2)}
                  >
                    <h2 tabIndex={-1}>
                      <span>3</span>
                      {tr("함께 전달할 내용", "Additional details")}
                    </h2>
                    {!referral && (
                      <>
                        <label htmlFor="dx-party">
                          {tr(
                            "함께 도움받을 인원",
                            "Number of people needing help",
                          )}
                        </label>
                        <input
                          id="dx-party"
                          type="number"
                          min={1}
                          max={20}
                          value={party}
                          required
                          onChange={(e) => setParty(Number(e.target.value))}
                        />
                        <details
                          className="request-needs"
                          open={savedChoices.length > 0 || undefined}
                        >
                          <summary>
                            {tr(
                              "안내 방식·필요한 도움",
                              "Communication & assistance needs",
                            )}
                          </summary>
                          <div className="request-needs-options">
                            {Array.from(
                              new Set([...savedChoices, ...supportCodes]),
                            ).map((code) => (
                              <label className="request-check" key={code}>
                                <input
                                  type="checkbox"
                                  checked={choices.includes(code)}
                                  onChange={() =>
                                    setChoices((v) =>
                                      v.includes(code)
                                        ? v.filter((c) => c !== code)
                                        : [...v, code],
                                    )
                                  }
                                />
                                {labelOf(code, lang)}
                              </label>
                            ))}
                          </div>
                        </details>
                      </>
                    )}
                    <PrivacyWarning en={en} />
                    <label htmlFor="dx-note">
                      {tr("추가 말씀 · 선택", "Additional message · optional")}
                    </label>
                    <textarea
                      id="dx-note"
                      maxLength={200}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={tr(
                        "필요한 내용을 200자 이내로 적어 주세요.",
                        "Up to 200 characters.",
                      )}
                    />
                    <p className="request-privacy-note">
                      {tr(
                        "접수 정보는 24시간 후 만료돼요.",
                        "Details expire after 24 hours.",
                      )}
                    </p>
                  </section>
                )}</>;
  const requestSummary = (<aside className="request-submit-card">
                <span className="service-kicker">
                  <ClipboardCheck aria-hidden="true" />
                  {tr("요청 요약", "YOUR REQUEST")}
                </span>
                <h2>
                  {en
                    ? (task?.en ?? topic?.en ?? SERVICE_EN[service])
                    : (task?.label ?? topic?.label ?? SERVICE_LABEL[service])}
                </h2>
                <p>
                  {!noMeeting && <MapPin aria-hidden="true" />}
                  {currentPlace
                    ? en
                      ? currentPlace.labelEn
                      : currentPlace.label
                    : tr("위치를 확인해 주세요", "Confirm your location")}
                </p>
                {registrationToken && (
                  <p className="request-linked-note">
                    {tr("사전등록 내용 연결됨", "Pre-registration linked")}
                  </p>
                )}
                <label className="request-check request-consent">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  {tr(
                    noMeeting
                      ? "요청 내용을 담당자에게 전달하는 데 동의합니다."
                      : "위치와 서비스 요청 내용을 담당자에게 전달하는 데 동의합니다.",
                    noMeeting
                      ? "I agree to share the request with the handling team."
                      : "I agree to share my location and service details with the handling team.",
                  )}
                </label>
                <button className="public-button" type="submit" disabled={busy}>
                  {tr("요청 내용 확인", "Review request")}
                  <ArrowRight aria-hidden="true" />
                </button>
              </aside>);
  if (!request && topic?.id === "traffic" && trafficIntent !== "dispatch")
    return (
      <TrafficEntry
        en={en}
        info={trafficIntent === "info"}
        onInfo={() => setTrafficIntent("info")}
        onDispatch={() => setTrafficIntent("dispatch")}
        onBack={() => setTrafficIntent("choose")}
      />
    );
  return (
    <main
      id="public-main"
      className={`request-experience ${sharedDevice ? "request-shared" : ""} ${large ? "dx-large" : ""}`}
      lang={lang}
      data-mobility-map={service === "mobility" ? "true" : undefined}
    >
      {!embedded && (
        <div className="request-local-tools">
          <Link href={returnTo ?? registrationHome ?? (en ? "/?lang=en" : "/")}>
            {returnTo
              ? tr("안내 화면으로", "Back to kiosk")
              : registrationHome
                ? tr("내 등록으로", "My registration")
                : tr("처음으로", "Home")}
          </Link>
          <button onClick={() => setLang(en ? "ko" : "en")}>
            {en ? "한국어" : "English"}
          </button>
          <button aria-pressed={large} onClick={() => setLarge(!large)}>
            {tr("큰 글씨", "Large text")}
          </button>
        </div>
      )}
      <IdleGuard
        t={textOf(lang)}
        enabled={sharedDevice && !busy && !restoring}
        askSec={90}
        answerSec={30}
        onTimeout={restart}
        say={choices.includes("gd_voice") ? speech.speak : undefined}
        hush={speech.stop}
      />
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      {availability && (
        <nav
          className="row"
          aria-label={tr("다른 지원 선택", "Alternative assistance")}
        >
          <a
            className="btn btn-primary"
            href={`${availability.booking}${en ? "&lang=en" : ""}`}
          >
            {tr("다른 시간 예약", "Book another time")}
          </a>
          <a
            className="btn"
            href={`${availability.staff}${en ? "&lang=en" : ""}`}
          >
            {tr("직원 안내 요청", "Request staff guidance")}
          </a>
        </nav>
      )}
      {restoring ? (
        <div className="request-loading" role="status">
          {tr("접수 내역을 확인하고 있어요…", "Checking your requests…")}
        </div>
      ) : request ? (
        <RequestStatusPanel
          sharedDevice={sharedDevice}
          request={request}
          en={en}
          busy={busy}
          onRefresh={() => void refresh()}
          onCancel={() => void cancel()}
          onRestart={restart}
        >
          {receipt &&
            request.placeId !== NO_MEETING_PLACE &&
            request.topicId !== "facility" && (
              <details
                className="request-location-tools"
                open={!!request.pendingPlaceId || undefined}
              >
                <summary>{tr("위치 변경 요청", "Change location")}</summary>
                <PickupChange
                  request={request}
                  receipt={receipt}
                  en={en}
                  sharedDevice={sharedDevice}
                  disabled={busy}
                  onChanged={applyRequest}
                  onRefresh={refresh}
                />
              </details>
            )}
          {sharedDevice && receipt && <ReceiptQr receipt={receipt} en={en} />}
          {sharedDevice && (
            <button
              className="public-button public-button-secondary"
              onClick={restart}
            >
              {tr(
                "접수는 유지하고 화면 비우기",
                "Clear screen, keep request active",
              )}
            </button>
          )}
        </RequestStatusPanel>
      ) : checkExisting && !receipt ? (
        <section className="request-empty-state">
          <ClipboardCheck aria-hidden="true" />
          <h1>{tr("이 탭에 접수 내역이 없어요", "No request in this tab")}</h1>
          <p>
            {tr(
              "저장한 접수 링크가 있다면 그 링크로 열어 주세요.",
              "If you saved a request link, open it to view progress.",
            )}
          </p>
          <Link
            href={"/requests" + (en ? "?lang=en" : "")}
            className="public-button"
          >
            {tr("내 요청 목록", "My requests")}
          </Link>
          <Link href={"/services" + (en ? "?lang=en" : "")}>
            {tr("서비스 이용하기", "Find a service")}
          </Link>
        </section>
      ) : (
        <>
          <header className="service-heading request-heading">
            {/* 피드백: 모든 화면 같은 자리에 「이전」. 확인 화면 → 입력, 입력 단계 → 앞 단계, 첫 단계 → 앞 화면. */}
            <button type="button" className="request-back" onClick={goBack}>
              <ArrowLeft aria-hidden="true" />
              {tr("이전", "Back")}
            </button>
            <span className="service-kicker">
              <MapPin aria-hidden="true" />
              {tr("공항 현장 서비스", "AIRPORT SERVICES")}
            </span>
            <div className="request-heading-row">
              <h1>
                {review
                  ? tr("이 내용으로 접수할까요?", "Ready to submit?")
                  : topic
                    ? en
                      ? topic.en
                      : topic.label
                    : tr("어떤 도움이 필요하세요?", "How can we help?")}
              </h1>
              {speech.supported && (
                <button
                  type="button"
                  className="request-speech"
                  onClick={() =>
                    speech.speaking ? speech.stop() : speech.speak(readText)
                  }
                  aria-label={tr("소리로 듣기", "Read aloud")}
                >
                  <Volume2 aria-hidden="true" />
                </button>
              )}
            </div>
            <p>
              {review
                ? tr(
                    "제출하면 담당 업무로 전달돼요.",
                    "Your request will be sent to the handling team.",
                  )
                : tr(
                    noMeeting
                      ? "전달할 요청 내용을 확인해 주세요."
                      : "필요한 내용과 위치를 확인해 주세요.",
                    noMeeting
                      ? "Review the request you want to send."
                      : "Confirm the service details and location.",
                  )}
            </p>
            <span className="service-demo-label">
              {tr(
                "공모전 시연 · 실제 출동 없음",
                "Contest demo · no real dispatch",
              )}
            </span>
          </header>
          <ol
            className="request-stepbar"
            aria-label={tr("접수 단계", "Request steps")}
          >
            {(noMeeting
              ? [tr("요청 내용", "Request"), tr("내용 확인", "Review")]
              : [
                  tr("서비스 선택", "Service"),
                  tr("위치 확인", "Location"),
                  tr("내용 확인", "Details"),
                ]
            ).map((label, i) => (
              <li
                key={label}
                aria-current={
                  (review ? reviewIndex : inputStep) === i ? "step" : undefined
                }
              >
                <span>
                  {(review ? reviewIndex : inputStep) > i ? (
                    <Check aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
          {registrationError && (
            <p role="status">
              {tr(
                "사전등록을 불러오지 못했어요. 새로 접수할 수 있어요.",
                "Pre-registration is unavailable. You can submit a new request.",
              )}
            </p>
          )}
          {receipt && (
            <section className="request-recovery">
              <p>
                {tr(
                  "이전에 보낸 요청이 있을 수 있어요. 먼저 상태를 확인해 주세요.",
                  "An earlier request may exist. Check its status first.",
                )}
              </p>
              <button
                className="public-button"
                disabled={busy}
                onClick={() => void refresh()}
              >
                {tr("이전 요청 확인", "Check previous request")}
              </button>
              <button type="button" onClick={restart}>
                {tr(
                  "확인값 지우고 새로 시작",
                  "Forget receipt and start again",
                )}
              </button>
            </section>
          )}
          {review ? (
            <div className="request-review-layout">
              <section className="request-review-card">
                <h2 tabIndex={-1}>{tr("접수 내용", "Your request")}</h2>
                <dl className="service-detail-list">
                  <div>
                    <dt>{tr("서비스", "Service")}</dt>
                    <dd>
                      {en
                        ? (topic?.en ?? SERVICE_EN[service])
                        : (topic?.label ?? SERVICE_LABEL[service])}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {noMeeting
                        ? tr("처리 방식", "Handling")
                        : topic?.id === "facility"
                          ? tr("신고 위치", "Report location")
                          : tr("만날 곳", "Meeting point")}
                    </dt>
                    <dd>{en ? currentPlace?.labelEn : currentPlace?.label}</dd>
                  </div>
                  {destinationId && (
                    <div>
                      <dt>{tr("목적지", "Destination")}</dt>
                      <dd>
                        {en
                          ? destinationPlaceOf(destinationId)?.labelEn
                          : destinationPlaceOf(destinationId)?.label}
                      </dd>
                    </div>
                  )}
                  {!referral && (
                    <div>
                      <dt>{tr("인원", "People")}</dt>
                      <dd>{party}</dd>
                    </div>
                  )}
                </dl>
                {serviceDetails && (
                  <ServiceDetailsView details={serviceDetails} en={en} />
                )}{" "}
                {needsDetails && choices.length > 0 && (
                  <ul>
                    {choices.map((c) => (
                      <li key={c}>{labelOf(c, lang)}</li>
                    ))}
                  </ul>
                )}
                {note && <p>{note}</p>}
                <div className="request-review-actions">
                  <button
                    className="public-button"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {busy
                      ? tr("접수 중…", "Submitting…")
                      : tr("이 내용으로 요청 접수", "Submit request")}
                    <ArrowRight aria-hidden="true" />
                  </button>
                  <button
                    className="public-button public-button-secondary"
                    disabled={busy}
                    onClick={() => setReview(false)}
                  >
                    {tr("내용 수정", "Edit details")}
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <form
              className="request-form"
              noValidate
              data-active-step={inputStep}
              data-short-flow={!needsDetails}
              data-last-step={lastInputStep}
              data-map-flow={service === "mobility"}
              data-final-step={service === "mobility" || inputStep === lastInputStep}
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  service !== "mobility" &&
                  inputStep < lastInputStep
                ) {
                  advanceInput();
                  return;
                }
                if (!placeOf(placeId)) {
                  setError(
                    tr(
                      "현재 계신 곳의 후보를 확인하고 선택해 주세요.",
                      "Confirm and select your current location.",
                    ),
                  );
                  document
                    .getElementById(
                      topic?.id === "facility"
                        ? "report-area"
                        : "dx-place-search",
                    )
                    ?.focus();
                  return;
                }
                if (!e.currentTarget.reportValidity()) return;
                if (serviceDetails) {
                  const parsed = parseServiceDetails(
                    serviceDetails,
                    topicId ?? service,
                    new Date(),
                  );
                  if (typeof parsed === "string") {
                    setError(parsed);
                    return;
                  }
                }
                setError("");
                setReview(true);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            >
              <div className="request-form-main">
                {service === "mobility" && (<MobilityMapPlanner initialSupportMode={initialMobilityMode} placeId={placeId} destinationId={destinationId} initialPlace={initialPlace}
                        en={en} disabled={busy} kiosk={sharedDevice} destinationEnabled={task?.id !== "mobility-wheelchair"}
                        requestContent={<>{requestDetails}{requestAdditional}{error && <p role="alert">{error}</p>}{requestSummary}</>}
                        backHref={mobilityHomeHref ?? returnTo ?? (en ? "/?lang=en" : "/")}
                        onChange={(nextPlace, nextDestination) => { setPlaceId(nextPlace); setDestinationId(nextDestination); setError(""); }} />)}
                {service !== "mobility" && requestDetails}
                {!noMeeting && service !== "mobility" && (
                  <section
                    className="request-section"
                    data-request-step="1"
                    hidden={noMeeting}
                    onFocusCapture={() => setInputStep(1)}
                  >
                    <h2 tabIndex={-1}>
                      <span>2</span>
                      {topic?.id === "facility" || topic?.id === "lost-property"
                          ? tr("신고할 위치", "Report location")
                          : tr("현재 위치", "Your location")}
                    </h2>

                    {topic?.id === "facility" ? (
                      <ReportLocationPicker
                        fields={taskFields}
                        en={en}
                        disabled={busy}
                        photos={!sharedDevice}
                        onChange={(fields) => {
                          setTaskFields(fields);
                          setPlaceId(
                            fields.reportArea
                              ? "report-" + fields.reportArea
                              : "",
                          );
                          setError("");
                        }}
                      />
                    ) : placeId === NO_MEETING_PLACE ? (
                      <p>
                        {tr(
                          "요청 내용으로 담당자가 업무를 분류합니다.",
                          "Staff will classify your request.",
                        )}
                      </p>
                    ) : lockedPlace ? (
                      <>
                        <label htmlFor="dx-place">
                          {tr("이 기기의 현재 위치", "This kiosk's location")}
                        </label>
                        <select id="dx-place" value={placeId} disabled>
                          {PLACES.map((p) => (
                            <option key={p.id} value={p.id}>
                              {en ? p.labelEn : p.label}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <PlaceFinder
                        id="dx-place"
                        purpose={
                          topic?.id === "other"
                            ? "location"
                            : topic?.id === "traffic"
                              ? "curbside"
                              : "pickup"
                        }
                        value={placeId}
                        en={en}
                        photos={!sharedDevice}
                        disabled={busy}
                        onChange={(id) => {
                          setPlaceId(id);
                          setDestinationId("");
                          if (id) setError("");
                        }}
                      />
                    )}

                  </section>
                )}
                {service !== "mobility" && requestAdditional}
              </div>
              <div className="request-mobile-nav" hidden={service === "mobility"}>
                {inputStep > 0 && (
                  <button
                    type="button"
                    className="public-button public-button-secondary"
                    onClick={() => {
                      setInputStep((v) => v - 1);
                      setError("");
                    }}
                  >
                    {tr("이전", "Back")}
                  </button>
                )}
                {inputStep < lastInputStep && (
                  <button
                    type="button"
                    className="public-button"
                    data-request-next
                    onClick={advanceInput}
                  >
                    {inputStep === 0
                      ? tr("다음 · 위치 확인", "Next · location")
                      : tr("다음 · 추가 내용", "Next · details")}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </div>
              {service !== "mobility" && requestSummary}
            </form>
          )}
        </>
      )}
    </main>
  );
}

/** 직접 적는 칸 위의 개인정보 경고. 이 서비스는 이름·연락처 등을 받지 않는다. */
function PrivacyWarning({ en }: { en: boolean }) {
  return (
    <div className="request-privacy-warning" role="note">
      <AlertTriangle aria-hidden="true" />
      <p>
        {en ? (
          <>
            <strong>Do not enter personal information.</strong> Name, phone
            number, address, resident registration number, passport number, card
            number or boarding pass details.
          </>
        ) : (
          <>
            <strong>개인정보는 적지 마세요.</strong> 이름, 전화번호, 주소,
            주민등록번호, 여권번호, 카드번호, 탑승권 정보
          </>
        )}
      </p>
    </div>
  );
}

/**
 * 찾아오는 안내로봇 소개(피드백: 로봇 소개와 이용 가능한 서비스).
 * 실제 로봇 사진이 없어 공항 키오스크와 같은 로봇 그림을 쓴다. 시연용 모의 서비스라는 것을 분명히 밝힌다.
 */
function RobotIntro({ en }: { en: boolean }) {
  const items = en
    ? [
        "Walks with you to your gate or a facility",
        "Guides you by voice and on its screen",
        "Shows your flight, gate and the way",
      ]
    : [
        "탑승구·편의시설까지 함께 이동",
        "소리와 화면으로 길 안내",
        "항공편·탑승구·가는 길 안내",
      ];
  return (
    <section className="robot-intro" aria-labelledby="robot-intro-title">
      <Robot mood="happy" size={96} />
      <div>
        <h3 id="robot-intro-title">
          {en ? "What the guide robot can do" : "안내로봇이 해 드리는 일"}
        </h3>
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <p className="robot-intro-note">
          {en
            ? "Contest demo: this simulates a robot visit. No real robot is sent."
            : "공모전 시연용 모의 서비스예요. 실제 로봇은 오지 않아요."}
        </p>
      </div>
    </section>
  );
}
