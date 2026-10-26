"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLACES, placeOf } from "@/lib/airport";
import { labelOf } from "@/lib/catalog";
import {
  OPEN_REQUEST_STATES,
  SERVICE_TYPES,
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
import { RequestResolutionView } from "../components/RequestResolutionView";
import { useSpeech } from "../components/useSpeech";
import { supportTopic, topicMatchesService } from "@/lib/service-catalog";
import {
  businessOf,
  pilotDestinations,
  BUSINESS_AREAS,
} from "@/lib/operating-profile";

const STORAGE = "jsp-dx-receipt-v1";
const STORAGE_SCOPE = "jsp-dx-receipt-registration-v1";
const supportCodes = [
  "mov_no_stairs",
  "mov_wheelchair",
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
  initialNote = "",
  initialTopic,
  initialBusiness,
  returnTo,
  freshShared = false,
  checkExisting = false,
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
  initialNote?: string;
  initialTopic?: string;
  initialBusiness?: string;
  returnTo?: string;
  freshShared?: boolean;
  checkExisting?: boolean;
}) {
  const [lang, setLang] = useState(initialLang);
  const en = lang === "en";
  const [placeId, setPlaceId] = useState(placeOf(initialPlace)?.id ?? "");
  const [service, setService] = useState<ServiceType>(initialService);
  const [choices, setChoices] = useState(savedChoices);
  const [party, setParty] = useState(savedParty);
  const [note, setNote] = useState(initialNote);
  const [topicId, setTopicId] = useState(initialTopic);
  const [businessId, setBusinessId] = useState(initialBusiness);
  const [destinationId, setDestinationId] = useState("");
  const [consent, setConsent] = useState(false);
  const [review, setReview] = useState(false);
  const [request, setRequest] = useState<ServiceRequestView | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState("");
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
      if (sharedDevice && freshShared && !freshConsumed.current) {
        freshConsumed.current = true;
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
              choices: referral ? [] : choices,
              party: referral ? 1 : party,
              note,
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
      } finally {
        clearTimeout(limit);
      }
    } catch (e) {
      setError(
        en && e instanceof RequestError && e.code === "duplicate_service"
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
  const currentPlace = placeOf(placeId);
  const readText = request
    ? `${requestStateLabel(request, lang)}. ${en ? request.placeEn : request.place}. ${request.reason}`
    : `${tr("지금 도움 요청하기", "Request help now")}. ${tr("현재 위치와 필요한 도움을 확인해 주세요. 사전등록은 서비스 예약 확정이 아닙니다.", "Confirm your pickup point and assistance. Pre-registration is not a confirmed service booking.")}`;
  return (
    <main
      id="public-main"
      className={`page dx-page ${large ? "dx-large" : ""}`}
      lang={lang}
    >
      <div className="dx-toolbar">
        <Link
          href={returnTo ?? registrationHome ?? (en ? "/?lang=en" : "/")}
          onClick={() => {
            if (sharedDevice) {
              try {
                sessionStorage.removeItem(STORAGE);
                sessionStorage.removeItem(STORAGE_SCOPE);
              } catch {}
            }
          }}
        >
          {returnTo
            ? tr("안내 화면으로", "Back to kiosk")
            : registrationHome
              ? tr("내 등록으로", "My registration")
              : tr("처음으로", "Home")}
        </Link>
        <button
          className="btn btn-ghost"
          onClick={() => setLang(en ? "ko" : "en")}
        >
          {en ? "한국어" : "English"}
        </button>
        <button
          className="btn btn-ghost"
          aria-pressed={large}
          onClick={() => setLarge(!large)}
        >
          {tr("큰 글씨", "Large text")}
        </button>
        {speech.supported && (
          <button
            className="btn btn-ghost"
            onClick={() =>
              speech.speaking ? speech.stop() : speech.speak(readText)
            }
          >
            {speech.speaking
              ? tr("읽기 멈춤", "Stop reading")
              : tr("소리로 듣기", "Read aloud")}
          </button>
        )}
      </div>
      <h1>
        {request
          ? tr("내 요청 처리 현황", "My request status")
          : assisted
            ? tr("여객 대신 도움 접수", "Request help on behalf of a passenger")
            : tr("지금 도움 요청하기", "Request help now")}
      </h1>
      {!request && (supportTopic(topicId) || businessOf(businessId)) && (
        <p className="public-topic-note">
          {supportTopic(topicId)
            ? en
              ? supportTopic(topicId)!.en
              : supportTopic(topicId)!.label
            : en
              ? businessOf(businessId)!.en
              : businessOf(businessId)!.label}
        </p>
      )}
      {!sharedDevice && (
        <p>
          <Link href={en ? "/services?lang=en" : "/services"}>
            {tr("서비스·담당 업무 안내", "Service directory")}
          </Link>
        </p>
      )}
      <p className="dx-notice">
        {tr(
          "시연용 접수입니다. 실제 직원·로봇·차량이 출동하지 않습니다. 실제 도움이 필요하면 가까운 안내데스크에 말씀해 주세요.",
          "Demonstration only. No real staff, robot or vehicle is dispatched. For actual help, contact the nearest information desk.",
        )}
      </p>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      {registrationError && (
        <p role="status">
          {tr(
            "사전등록을 불러올 수 없습니다. 아래에서 새로 요청할 수 있습니다.",
            "Pre-registration could not be loaded. You can make a new request below.",
          )}
        </p>
      )}
      {checkExisting && !restoring && !request && !receipt && (
        <p role="status" className="dx-notice">
          {tr(
            "이 기기에 연결된 접수 내역이 없습니다. 휴대전화로 이어 본 요청은 해당 휴대전화에서 확인해 주세요. 필요한 경우 아래에서 새로 접수할 수 있습니다.",
            "No request is linked on this device. If you moved it to your phone, check it there. You can make a new request below.",
          )}
        </p>
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
      {restoring ? (
        <p role="status">
          {tr("이 기기의 요청 확인 중…", "Checking requests on this device…")}
        </p>
      ) : request ? (
        <section className="dx-card">
          <h2 role="status">{requestStateLabel(request, lang)}</h2>
          <p>
            {en ? SERVICE_EN[request.service] : SERVICE_LABEL[request.service]}
          </p>
          <p>
            <strong>{tr("만날 곳: ", "Pickup: ")}</strong>
            {en ? request.placeEn : request.place}
          </p>
          <p>
            {request.party}
            {tr("명", " people")}
          </p>
          <p>
            {request.source === "preregistered"
              ? tr(
                  "사전등록 내용을 연결한 요청입니다.",
                  "Your pre-registration is linked.",
                )
              : tr(
                  "현장에서 접수한 요청입니다.",
                  "This request was made on site.",
                )}
          </p>
          {request.note && <p>{request.note}</p>}
          {request.topicId && (
            <p>
              {tr("상담 유형", "Enquiry type")}:{" "}
              {en
                ? supportTopic(request.topicId)?.en
                : supportTopic(request.topicId)?.label}
            </p>
          )}
          {request.businessId && (
            <p>
              {tr("담당 연결 참고 업무", "Service responsibility")}:{" "}
              {en
                ? businessOf(request.businessId)?.en
                : businessOf(request.businessId)?.label}
            </p>
          )}
          {request.destinationId && (
            <p>
              {tr("목적지", "Destination")}:{" "}
              {en
                ? placeOf(request.destinationId)?.labelEn
                : placeOf(request.destinationId)?.label}
            </p>
          )}
          {request.reason && (
            <p role="status">
              {tr("안내: ", "Message: ")}
              {request.reason}
            </p>
          )}
          {request.resolution && (
            <RequestResolutionView
              resolution={request.resolution}
              lang={en ? "en" : "ko"}
            />
          )}
          {OPEN_REQUEST_STATES.includes(request.state) && (
            <p>
              {tr(
                request.state === "serving"
                  ? "지원이 시작되었습니다. 위치나 만날 곳이 바뀌면 현장 직원에게 직접 알려 주세요."
                  : "배정·도착 시간은 확정 약속이 아닙니다. 위치가 달라졌다면 아래에서 만날 곳 변경을 요청해 주세요.",
                request.state === "serving"
                  ? "Assistance has started. Tell the staff member directly if your location changes."
                  : "Assignment and arrival times are not a promise. If you moved, use the pickup change options below.",
              )}
            </p>
          )}
          {receipt && (
            <PickupChange
              request={request}
              receipt={receipt}
              en={en}
              sharedDevice={sharedDevice}
              disabled={busy}
              onChanged={applyRequest}
              onRefresh={refresh}
            />
          )}
          {request.service === "robot" && (
            <p>
              {tr(
                "로봇 이동·도착은 직원 시연 화면에서 바꾸는 모의 상태입니다.",
                "Robot travel and arrival are simulated by the operator.",
              )}
            </p>
          )}
          {sharedDevice && receipt && <ReceiptQr receipt={receipt} en={en} />}
          {sharedDevice && (
            <button className="btn btn-ghost" onClick={restart}>
              {tr(
                "접수는 유지하고 화면 비우기",
                "Clear screen, keep request active",
              )}
            </button>
          )}
          <div className="dx-actions">
            <button
              className="btn"
              onClick={() => void refresh()}
              disabled={busy}
            >
              {tr("상태 다시 확인", "Refresh status")}
            </button>
            {["received", "assigned", "en_route", "arrived"].includes(
              request.state,
            ) && (
              <button
                className="btn btn-ghost"
                onClick={() => void cancel()}
                disabled={busy}
              >
                {tr("요청 취소", "Cancel request")}
              </button>
            )}
            {!OPEN_REQUEST_STATES.includes(request.state) && (
              <button className="btn btn-primary" onClick={restart}>
                {tr("새 요청 시작", "Start a new request")}
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {receipt && (
            <section className="dx-card">
              <p>
                {tr(
                  "보낸 요청이 있을 수 있습니다. 중복 접수 전에 상태를 확인해 주세요.",
                  "An earlier request may exist. Check it before starting another.",
                )}
              </p>
              <button
                className="btn"
                disabled={busy}
                onClick={() => void refresh()}
              >
                {tr("이전 요청 확인", "Check previous request")}
              </button>
              <button className="btn btn-ghost" onClick={restart}>
                {tr(
                  "확인값 지우고 새로 시작",
                  "Forget receipt and start again",
                )}
              </button>
            </section>
          )}
          {registrationToken && (
            <p className="dx-notice">
              {tr(
                "사전등록의 필요한 도움을 불러왔습니다. 아래에서 현재 위치와 이번 요청을 확인해 주세요. 등록 완료만으로 서비스가 예약되지는 않습니다.",
                "Your saved needs are loaded. Confirm today's pickup point and service. Registration alone does not book assistance.",
              )}
            </p>
          )}
          {review ? (
            <section className="dx-card">
              <h2>{tr("요청 전 확인", "Review your request")}</h2>
              <p>{en ? SERVICE_EN[service] : SERVICE_LABEL[service]}</p>
              <p>{en ? currentPlace?.labelEn : currentPlace?.label}</p>
              {destinationId && (
                <p>
                  {tr("목적지", "Destination")}:{" "}
                  {en
                    ? placeOf(destinationId)?.labelEn
                    : placeOf(destinationId)?.label}
                </p>
              )}
              {(topicId || !businessId) && (
                <p>
                  {tr("상담 유형", "Enquiry type")}:{" "}
                  {en
                    ? supportTopic(topicId ?? service)?.en
                    : supportTopic(topicId ?? service)?.label}
                </p>
              )}
              {!referral && (
                <p>
                  {party}
                  {tr("명", " people")}
                </p>
              )}
              {!referral && choices.length > 0 && (
                <ul>
                  {choices.map((c) => (
                    <li key={c}>{labelOf(c, lang)}</li>
                  ))}
                </ul>
              )}
              {note && <p>{note}</p>}
              <p>
                {tr(
                  "사전등록이나 증빙 없이도 접수할 수 있습니다. 요청 후에는 담당자의 확인이 필요합니다.",
                  "You can request without pre-registration or documents. Staff confirmation is still required.",
                )}
              </p>
              <div className="dx-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void submit()}
                  disabled={busy}
                >
                  {busy
                    ? tr("접수 중…", "Sending…")
                    : tr("이 내용으로 요청 접수", "Send this request")}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setReview(false)}
                  disabled={busy}
                >
                  {tr("고치기", "Edit")}
                </button>
              </div>
            </section>
          ) : (
            <form
              className="dx-card"
              onSubmit={(e) => {
                e.preventDefault();
                setReview(true);
              }}
            >
              <label htmlFor="dx-place">
                {topic?.id === "facility"
                  ? tr("불편한 시설이 있는 지점", "Location of the facility")
                  : referral
                    ? tr(
                        "상담받을 곳을 알려주세요",
                        "Where can staff assist you?",
                      )
                    : tr("지금 어디에 계신가요?", "Where are you now?")}
              </label>
              <select
                id="dx-place"
                disabled={lockedPlace}
                required
                value={placeId}
                onChange={(e) => {
                  setPlaceId(e.target.value);
                  setDestinationId("");
                }}
              >
                <option value="">
                  {tr(
                    "현재 위치를 골라 주세요",
                    "Choose your current pickup point",
                  )}
                </option>
                {PLACES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {en ? p.labelEn : p.label}
                  </option>
                ))}
              </select>
              <p className="fine">
                {tr(
                  "위치 목록은 시연용입니다. 탑승구 목적지가 아니라 현재 계신 곳을 고르세요.",
                  "Demo pickup points. Choose where you are, not your destination gate.",
                )}
              </p>
              {!topic && (
                <fieldset>
                  <legend>
                    {tr(
                      "어떤 도움이 필요한가요?",
                      "What assistance do you need?",
                    )}
                  </legend>
                  {SERVICE_TYPES.map((type) => (
                    <label className="dx-option" key={type}>
                      <input
                        type="radio"
                        name="service"
                        value={type}
                        checked={service === type}
                        onChange={() => {
                          setService(type);
                          if (topicId && !topicMatchesService(topicId, type)) {
                            setTopicId(undefined);
                            setBusinessId(undefined);
                          }
                          if (type !== "mobility") setDestinationId("");
                        }}
                      />
                      {en ? SERVICE_EN[type] : SERVICE_LABEL[type]}
                    </label>
                  ))}
                </fieldset>
              )}
              {topic && (
                <p className="fine">
                  {tr("선택한 서비스", "Selected service")}:{" "}
                  {en ? topic.en : topic.label} ·{" "}
                  <Link href={en ? "/services?lang=en" : "/services"}>
                    {tr("서비스 변경", "Change service")}
                  </Link>
                </p>
              )}
              {topic?.id === "other" && (
                <>
                  <label htmlFor="dx-business">
                    {tr("문의할 업무 · 선택", "Department · optional")}
                  </label>
                  <select
                    id="dx-business"
                    value={businessId ?? ""}
                    onChange={(e) => setBusinessId(e.target.value || undefined)}
                  >
                    <option value="">
                      {tr(
                        "직원이 함께 확인해 주세요",
                        "Ask staff to identify the department",
                      )}
                    </option>
                    {BUSINESS_AREAS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {en ? b.en : b.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {service === "mobility" && (
                <>
                  <label htmlFor="dx-destination">
                    {tr("가고 싶은 곳 · 선택", "Destination · optional")}
                  </label>
                  <select
                    id="dx-destination"
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                  >
                    <option value="">
                      {tr("담당자와 상담해 정할게요", "Confirm with staff")}
                    </option>
                    {pilotDestinations(placeId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {en ? p.labelEn : p.label}
                      </option>
                    ))}
                  </select>
                  <p className="fine">
                    {tr(
                      "같은 터미널·보안 구역 안의 시연 지점입니다. 실제 이동은 담당자가 확인해요.",
                      "Demo destinations within the same terminal and security area. Staff confirm actual travel.",
                    )}
                  </p>
                </>
              )}
              {!referral && (
                <fieldset>
                  <legend>
                    {tr(
                      "안내할 때 참고해 주세요 · 선택",
                      "Helpful to know · optional",
                    )}
                  </legend>
                  {Array.from(new Set([...savedChoices, ...supportCodes])).map(
                    (code) => (
                      <label className="dx-option" key={code}>
                        <input
                          type="checkbox"
                          checked={choices.includes(code)}
                          onChange={() =>
                            setChoices((current) =>
                              current.includes(code)
                                ? current.filter((c) => c !== code)
                                : [...current, code],
                            )
                          }
                        />
                        {labelOf(code, lang)}
                      </label>
                    ),
                  )}
                </fieldset>
              )}
              {!referral && (
                <>
                  <label htmlFor="dx-party">
                    {tr("함께 도움받을 인원", "Number of people needing help")}
                  </label>
                  <input
                    id="dx-party"
                    type="number"
                    min="1"
                    max="20"
                    required
                    value={party}
                    onChange={(e) => setParty(Number(e.target.value))}
                  />
                </>
              )}
              <label htmlFor="dx-note">
                {tr(
                  "추가 말씀 · 선택, 200자 이내",
                  "Additional message · optional, up to 200 characters",
                )}
              </label>
              <textarea
                id="dx-note"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="fine">
                {tr(
                  "이름·연락처·증빙 사진은 입력하지 마세요. 요청 정보는 24시간 후 열람을 종료하고 순차 삭제합니다.",
                  "Do not enter names, contact details or documents. Request details expire after 24 hours.",
                )}
              </p>
              <label className="dx-option">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {tr(
                  "위치와 필요한 도움을 담당자에게 전달하는 데 동의합니다.",
                  "I agree to share my pickup point and assistance needs with staff.",
                )}
              </label>
              <button className="btn btn-primary" type="submit">
                {tr("요청 내용 확인", "Review request")}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
