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
  STATE_LABEL,
  STATE_EN,
  type ServiceRequestView,
  type ServiceType,
} from "@/lib/service-request-model";
import { textOf } from "@/lib/i18n";
import { IdleGuard } from "../components/IdleGuard";
import { ReceiptQr } from "./ReceiptQr";
import { useSpeech } from "../components/useSpeech";

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
  const [note, setNote] = useState("");
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
              choices,
              party,
              note,
              lang,
              consent,
              registrationToken,
              assisted,
            },
            ctrl.signal,
          ),
        );
      } finally {
        clearTimeout(limit);
      }
    } catch (e) {
      setError(
        e instanceof Error
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
    ? `${en ? STATE_EN[request.state] : STATE_LABEL[request.state]}. ${en ? request.placeEn : request.place}. ${request.reason}`
    : `${tr("지금 도움 요청하기", "Request help now")}. ${tr("현재 위치와 필요한 도움을 확인해 주세요. 사전등록은 서비스 예약 확정이 아닙니다.", "Confirm your pickup point and assistance. Pre-registration is not a confirmed service booking.")}`;
  return (
    <main className={`page dx-page ${large ? "dx-large" : ""}`} lang={lang}>
      <div className="dx-toolbar">
        <Link
          href={returnTo ?? (en ? "/?lang=en" : "/")}
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
        {assisted
          ? tr("여객 대신 도움 접수", "Request help on behalf of a passenger")
          : tr("지금 도움 요청하기", "Request help now")}
      </h1>
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
          <h2 role="status">
            {en ? STATE_EN[request.state] : STATE_LABEL[request.state]}
          </h2>
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
          {request.reason && (
            <p role="status">
              {tr("안내: ", "Message: ")}
              {request.reason}
            </p>
          )}
          {OPEN_REQUEST_STATES.includes(request.state) && (
            <p>
              {tr(
                "담당자가 확인하기 전에는 배정·도착 시간이 확정되지 않습니다. 위치가 달라졌으면 취소 후 새 위치로 요청해 주세요.",
                "Assignment and arrival time are not confirmed until accepted. If your location changes, cancel and request from the new point.",
              )}
            </p>
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
              <p>
                {party}
                {tr("명", " people")}
              </p>
              {choices.length > 0 && (
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
                {tr("지금 어디에 계신가요?", "Where are you now?")}
              </label>
              <select
                id="dx-place"
                disabled={lockedPlace}
                required
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
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
                      onChange={() => setService(type)}
                    />
                    {en ? SERVICE_EN[type] : SERVICE_LABEL[type]}
                  </label>
                ))}
              </fieldset>
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
