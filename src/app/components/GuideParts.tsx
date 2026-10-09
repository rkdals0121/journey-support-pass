import { ArrowUpDown, CircleAlert, Clock, Flag, MapPin, Milestone, PlaneTakeoff, TrainFront, TrendingUp } from "lucide-react";
import type { FacilityKind, Route, Step } from "@/lib/airport";
import type { FlightView, Pace } from "@/lib/guide";
import type { Lang, Text } from "@/lib/i18n";
import { FacilityIcon } from "./NeedIcon";

/** 영어 화면에서는 도착지 이름 대신 공항 코드를 쓴다. 운항 정보의 도착지 이름이 한국어뿐이기 때문이다. */
export function destOf(f: FlightView, lang: Lang): string {
  return lang === "en" && f.destCode ? f.destCode : f.destName;
}

/** 탑승 마감까지의 상태를 한 줄로. 공공데이터에 마감 시각이 없어 출발 시각에서 계산한 값에는 "추정"을 붙인다. */
export function closeText(f: FlightView, t: Text): string {
  switch (f.close) {
    case "cancelled":
      return t.closeCancelled;
    case "closed":
      return t.closeClosed;
    case "past":
      return t.closePast;
    case "unknown":
      return t.closeUnknown;
    default:
      return `${t.closeIn(f.minutesToClose ?? 0)} (${t.estimate})`;
  }
}

/** 공항 출발 안내판처럼 생긴 항공편 판. 탑승구가 가장 크게 보인다. */
export function FlightBoard({ flight, t, lang }: { flight: FlightView; t: Text; lang: Lang }) {
  return (
    <section className="board" aria-label={t.passFlight}>
      <div className="board-main">
        <div className="board-flight">
          <span className="board-label">
            <PlaneTakeoff size={18} aria-hidden="true" />
            {flight.operatingNo && flight.operatingNo !== flight.flightNo ? `${flight.flightNo} (${flight.operatingNo})` : flight.flightNo}
          </span>
          <b className="board-dest">{destOf(flight, lang)}</b>
          <span className="board-time">
            {t.departure}{" "}
            {flight.estTime ? (
              <>
                <s className="num">{flight.schedTime}</s> <b className="num">{flight.estTime}</b>
              </>
            ) : (
              <b className="num">{flight.schedTime ?? "–"}</b>
            )}
          </span>
        </div>
        <div className="gate-sign" aria-label={`${t.gate} ${flight.gate ?? t.gateTbd}`}>
          <small>{t.gate}</small>
          <b className={flight.gate === null ? "" : "num"}>{flight.gate ?? t.gateTbd}</b>
          {flight.area && <span>{t.area[flight.area] ?? ""}</span>}
        </div>
      </div>
      <p className={`board-close ${flight.urgent ? "urgent" : ""} ${flight.cancelled ? "cancelled" : ""}`}>
        <Clock size={20} aria-hidden="true" />
        <span>
          {flight.boardingNow && flight.close === "open" ? `${t.boardingNow} · ` : ""}
          {closeText(flight, t)}
        </span>
      </p>
      {flight.prevGate !== null && flight.gate !== null && flight.prevGate !== flight.gate && (
        <p className="board-alert" role="alert">
          <CircleAlert size={20} aria-hidden="true" />
          <span>{t.gateChanged(flight.prevGate, flight.gate)}</span>
        </p>
      )}
    </section>
  );
}

export function paceText(pace: Pace | null, t: Text): string {
  return pace === "ok" ? t.paceOk : pace === "hurry" ? t.paceHurry : pace === "late" ? t.paceLate : "";
}

/** 길의 요약 한 줄. "약 9분 · 370m" 와 계단 없는 길 표시. */
export function RouteSummary({ route, t }: { route: Route; t: Text }) {
  return (
    <span className="route-sum">
      <b>{t.routeSummary(route.minutes, route.meters)}</b>
      {route.stepFree && <em>{route.levelChanges === 0 ? t.sameLevel : t.stepFree}</em>}
    </span>
  );
}

export type RouteTarget = { type: "gate"; gate: number } | { type: "facility"; kind: FacilityKind; nearGate: number; level: number };

export function targetTitle(target: RouteTarget, t: Text): string {
  return target.type === "gate" ? t.toGate(target.gate) : t.facility[target.kind];
}

function stepText(s: Step, t: Text): string {
  if (s.kind === "walk") return t.walk(s.meters, s.minutes, s.towardGate, s.walkTo);
  if (s.kind === "shuttle") return t.shuttle(s.minutes);
  return t.liftStep(s.kind, s.fromLevel, s.toLevel);
}

/** 소리 안내와 화면이 같은 글을 쓰도록, 길을 문장의 목록으로 만든다. */
export function routeLines(route: Route, target: RouteTarget, t: Text): string[] {
  const end =
    target.type === "gate"
      ? `${t.gate} ${target.gate} ${t.arrive}`
      : `${t.facility[target.kind]} ${t.arrive}. ${t.nearGate(target.nearGate)}, ${t.level(target.level)}`;
  return [
    ...route.steps.flatMap((s) => [
      stepText(s, t),
      ...s.along.map((a) => `${t.alongTitle}: ${t.alongItem(t.facility[a.kind], a.nearGate, a.meters)}`),
    ]),
    end,
  ];
}

const STEP_ICON = { walk: Milestone, elevator: ArrowUpDown, escalator: TrendingUp, shuttle: TrainFront } as const;

/** 길 안내. 지금 있는 곳에서 시작해 한 줄에 한 가지씩, 차례대로. */
export function RouteSteps({ route, target, from, t }: { route: Route; target: RouteTarget; from: string; t: Text }) {
  return (
    <ol className="route">
      <li className="route-here">
        <span className="route-ico">
          <MapPin size={24} aria-hidden="true" />
        </span>
        <div>
          <strong>{t.here}</strong>
          <span>{from}</span>
        </div>
      </li>
      {route.steps.map((s, i) => {
        const Icon = STEP_ICON[s.kind];
        return (
          <li key={i} className={`route-${s.kind}`}>
            <span className="route-ico">
              <Icon size={24} aria-hidden="true" />
            </span>
            <div>
              <strong>{stepText(s, t)}</strong>
              {s.along.length > 0 && (
                <ul className="route-along" aria-label={t.alongTitle}>
                  {s.along.map((a) => (
                    <li key={`${a.kind}-${a.nearGate}`}>
                      <FacilityIcon kind={a.kind} size={18} />
                      <span>
                        <b>{t.alongTitle}</b> {t.alongItem(t.facility[a.kind], a.nearGate, a.meters)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
      <li className="route-end">
        <span className="route-ico">
          {target.type === "gate" ? <Flag size={24} aria-hidden="true" /> : <FacilityIcon kind={target.kind} size={24} />}
        </span>
        <div>
          <strong>
            {target.type === "gate" ? `${t.gate} ${target.gate}` : t.facility[target.kind]} {t.arrive}
          </strong>
          {target.type === "facility" && (
            <span>
              {t.nearGate(target.nearGate)} · {t.level(target.level)}
            </span>
          )}
        </div>
      </li>
    </ol>
  );
}
