"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Navigation,
  ArrowRight,
  MapPin,
  Clock,
  Accessibility,
} from "lucide-react";
import { PlaceFinder } from "../components/PlaceFinder";
import { IdleGuard } from "../components/IdleGuard";
import type { KioskReturn } from "@/lib/help-entry";
import {
  placeOf,
  GATE_PICKUP_POINTS,
  routeToGateFrom,
  nearestFacilities,
  routeOptionsOf,
  type Route,
  type FacilityKind,
} from "@/lib/airport";
import { textOf } from "@/lib/i18n";
const floorKo = (n: number) => (n < 0 ? `지하 ${-n}층` : `${n}층`);
const floorEn = (n: number) => (n < 0 ? `B${-n}` : `${n}F`);
export function NavigationFlow({
  en,
  initialGate = "",
  initialPlace = "",
  fixedPlace = false,
  returnTo = "/kiosk/guide",
  idleAskSec = 120,
  idleAnswerSec = 30,
}: {
  en: boolean;
  initialGate?: string;
  initialPlace?: string;
  fixedPlace?: boolean;
  returnTo?: KioskReturn;
  idleAskSec?: number;
  idleAnswerSec?: number;
}) {
  const t = (ko: string, english: string) => (en ? english : ko),
    labels = textOf(en ? "en" : "ko").facility;
  const [place, setPlace] = useState(initialPlace),
    [kind, setKind] = useState("gate"),
    [gate, setGate] = useState(initialGate),
    [stepFree, setStepFree] = useState(true),
    [result, setResult] = useState<{ title: string; route: Route } | null>(
      null,
    ),
    [error, setError] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (result) {
      resultHeading.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 850px)").matches)
        resultHeading.current?.scrollIntoView({ block: "center" });
    } else if (error) errorMessage.current?.focus();
  }, [result, error]);
  function find() {
    setResult(null);
    setError("");
    const from = placeOf(place);
    if (!from) {
      setError(
        t(
          "현재 위치 후보를 먼저 확인해 주세요.",
          "Confirm your current location first.",
        ),
      );
      return;
    }
    const opts = routeOptionsOf(stepFree ? ["mov_no_stairs"] : []);
    if (kind === "gate") {
      const target = GATE_PICKUP_POINTS.find((p) => p.gate === Number(gate));
      if (!/^\d{1,3}$/.test(gate) || !target) {
        setError(
          t(
            "지원하는 게이트 번호를 입력해 주세요.",
            "Enter a supported gate number.",
          ),
        );
        return;
      }
      const route = routeToGateFrom(from, target.place.area, Number(gate), opts);
      if (route)
        setResult({ title: t(`${gate}번 탑승구`, `Gate ${gate}`), route });
      else
        setError(
          t(
            "이 위치에서는 그 탑승구로 걸어서 갈 수 없어요. 터미널이 다르면 터미널 사이 셔틀버스를 타야 해요. 항공권에 적힌 터미널을 확인하시거나 현장 안내를 불러 주세요.",
            "You cannot walk to that gate from here. Different terminals are linked by the inter-terminal shuttle bus. Check the terminal on your ticket, or request on-site guidance.",
          ),
        );
    } else {
      const near = nearestFacilities(from, opts).find((f) => f.kind === kind);
      if (near)
        setResult({
          title: `${labels[kind as FacilityKind]} · ${near.nearGate}${t("번 부근", " nearby")}`,
          route: near.route,
        });
      else
        setError(
          t(
            "이 위치에서 확인된 시설 경로가 없어요.",
            "No facility route is available from this location.",
          ),
        );
    }
  }
  return (
    <main id="public-main" className="service-workspace">
      <IdleGuard
        t={textOf(en ? "en" : "ko")}
        enabled={fixedPlace}
        askSec={idleAskSec}
        answerSec={idleAnswerSec}
        onTimeout={() =>
          window.location.assign(returnTo + (en ? "?lang=en" : ""))
        }
      />
      <header className="service-heading">
        <span className="service-kicker">
          <Navigation aria-hidden="true" />
          {t("바로 이용하는 안내", "SELF-SERVICE DIRECTIONS")}
        </span>
        <h1>{t("어디로 가시나요?", "Where are you heading?")}</h1>
        <p>
          {t(
            "현재 위치와 목적지를 고르면 이동 경로가 나와요.",
            "Choose your location and destination for directions.",
          )}
        </p>
        <span className="service-demo-label">
          {t("시연 지도 기준", "Prototype map")}
        </span>
      </header>
      <div className="service-form-layout">
        <form
          className="service-form-card"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <section className="request-section">
            <h2>
              <span>1</span>
              {t("출발 위치", "Start location")}
            </h2>
            {fixedPlace ? (
              <p className="field-current-location">
                <MapPin aria-hidden="true" />
                {en ? placeOf(place)?.labelEn : placeOf(place)?.label}
              </p>
            ) : (
              <PlaceFinder
                id="nav-place"
                value={place}
                onChange={(id) => {
                  setPlace(id);
                  setResult(null);
                }}
                en={en}
              />
            )}
          </section>
          <section className="request-section">
            <h2>
              <span>2</span>
              {t("목적지", "Destination")}
            </h2>
            <label htmlFor="nav-kind">{t("찾을 곳", "Destination type")}</label>
            <select
              id="nav-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setResult(null);
              }}
            >
              <option value="gate">{t("탑승구", "Boarding gate")}</option>
              {Object.entries(labels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            {kind === "gate" && (
              <>
                <label htmlFor="nav-gate">
                  {t("탑승구 번호", "Gate number")}
                </label>
                <input
                  id="nav-gate"
                  inputMode="numeric"
                  maxLength={3}
                  value={gate}
                  onChange={(e) => {
                    setGate(e.target.value);
                    setResult(null);
                  }}
                  required
                  placeholder="130"
                />
              </>
            )}
            <label className="request-check">
              <input
                type="checkbox"
                checked={stepFree}
                onChange={(e) => {
                  setStepFree(e.target.checked);
                  setResult(null);
                }}
              />
              <Accessibility aria-hidden="true" />
              {t("계단 없는 경로", "Step-free route")}
            </label>
          </section>
          {error && (
            <p
              className="error-note"
              role="alert"
              ref={errorMessage}
              tabIndex={-1}
            >
              {error}
            </p>
          )}
          <button className="public-button" type="submit">
            {t("경로 보기", "Show route")}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        <aside
          className="service-route-result"
          aria-label={t("경로 결과", "Route result")}
          aria-live="polite"
        >
          {result ? (
            <>
              <span className="service-kicker">
                {t("이동 경로", "YOUR ROUTE")}
              </span>
              <h2 ref={resultHeading} tabIndex={-1}>
                {result.title}
              </h2>
              <div className="route-metrics">
                <span>
                  <Clock aria-hidden="true" />
                  {t(
                    `약 ${result.route.minutes}분`,
                    `About ${result.route.minutes} min`,
                  )}
                </span>
                <span>{Math.round(result.route.meters)}m</span>
              </div>
              <ol className="journey-route-steps">
                <li>
                  <MapPin aria-hidden="true" />
                  {en ? placeOf(place)?.labelEn : placeOf(place)?.label}
                </li>
                {result.route.steps.map((s, i) => (
                  <li key={i}>
                    {s.kind === "walk"
                      ? t(
                          `${s.towardGate}번 방향으로 ${Math.round(s.meters)}m 이동`,
                          `Walk ${Math.round(s.meters)}m towards gate ${s.towardGate}`,
                        )
                      : s.kind === "shuttle"
                        ? t("셔틀트레인 이용", "Take the shuttle train")
                        : s.kind === "security"
                          ? t("출국장에서 보안검색·출국심사", "Security and passport control")
                          : t(
                            `${s.kind === "elevator" ? "엘리베이터" : "에스컬레이터"}로 ${floorKo(s.fromLevel)} → ${floorKo(s.toLevel)}`,
                            `Take the ${s.kind} from ${floorEn(s.fromLevel)} to ${floorEn(s.toLevel)}`,
                          )}
                  </li>
                ))}
                <li>{result.title}</li>
              </ol>
              <p className="service-muted">
                {t(
                  "거리·시간은 시연 지도 기준 추정치예요.",
                  "Estimated using the prototype map.",
                )}
              </p>
            </>
          ) : (
            <div className="route-empty">
              <Navigation aria-hidden="true" />
              <h2>{t("나에게 맞는 경로", "Your route")}</h2>
              <p>
                {t(
                  "출발 위치와 목적지를 선택해 주세요.",
                  "Choose your start and destination.",
                )}
              </p>
            </div>
          )}
          <Link
            className="public-text-link"
            href={`/help?topic=guidance&fresh=1${place ? "&place=" + encodeURIComponent(place) : ""}${fixedPlace ? "&returnTo=" + encodeURIComponent(returnTo) : ""}${en ? "&lang=en" : ""}`}
          >
            {t("현장 안내 지원 요청", "Request on-site guidance")}
            <ArrowRight aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
