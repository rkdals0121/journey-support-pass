import { ArrowUpDown, CircleAlert, Clock, Flag, MapPin, Milestone, PlaneTakeoff, TrainFront, TrendingUp } from "lucide-react";
import type { FacilityKind, Route, Step } from "@/lib/airport";
import { config } from "@/lib/config";
import { destLabel } from "@/lib/dest-en";
import { kstDate } from "@/lib/flights/normalize";
import type { FlightView, Pace } from "@/lib/guide";
import type { Lang, Text } from "@/lib/i18n";
import { kstTime } from "@/lib/timing";
import { FacilityIcon } from "./NeedIcon";

const MIN = 60_000;
// 마감까지 이만큼(분) 넘게 남으면 남은 분 대신 추정 마감 시각을 보여 준다. "1410분"처럼 큰 숫자는 언제인지 알아보기 어렵다.
const CLOCK_FROM_MIN = 120;

/** 영어 화면에서는 도착지를 영어 도시 이름으로 쓴다. 운항 정보의 도착지 이름이 한국어뿐이라 공항 코드로 찾는다. */
export function destOf(f: FlightView, lang: Lang): string {
  return destLabel(lang, f);
}

/**
 * 남은 시간(minutesToClose)을 센 시각(ms). 남은 시간이 없으면 null.
 * 패스 화면은 남은 시간을 지금 시각으로 다시 세므로(PassView 의 liveFlight), 이 값도 서버가 만든 때가 아니라 지금 시각을 따라간다.
 * 남은 분은 내림한 값이라(timing.ts 의 minutesToClose), 실제로 센 때는 "마감 - 남은 분"보다 1분 안쪽만큼 이를 수 있다.
 * 그 가운데 가장 이른 때를 쓴다. 23:59:30 에 센 값이 다음 날 00:00 으로 올라가 "내일"이 빠지지 않게 한다.
 */
function countedAt(f: FlightView): number | null {
  return f.close === "open" && f.closeAtMs !== null && f.minutesToClose !== null ? f.closeAtMs - (f.minutesToClose + 1) * MIN + 1 : null;
}

/**
 * 출발이 내일인가. 항공편 판이 시각 앞에 "내일"을 붙일지 정한다.
 * 남은 시간이 있으면 그 시간을 센 시각과 견주어 다시 정한다. 휴대전화에 남겨 둔 패스를 다음 날 인터넷 없이 열어도 "내일"이 남지 않는다.
 * 마감이 지났거나 마감되었으면 곧 떠나는 편이라 붙이지 않는다. 결항이면 서버가 정한 날(day)을 그대로 쓴다.
 */
export function departsTomorrow(f: FlightView): boolean {
  if (f.close === "past" || f.close === "closed" || f.close === "unknown") return false;
  const at = countedAt(f);
  // 추정 마감 시각은 출발 시각에서 config.boardingCloseMin 분을 뺀 값이다(timing.ts 의 boardingCloseAt).
  if (at !== null && f.closeAtMs !== null) {
    return kstDate(new Date(f.closeAtMs + config.boardingCloseMin * MIN)) > kstDate(new Date(at));
  }
  return f.day === "tomorrow";
}

/** 소리 안내에 넣는 출발 시각 한 마디. "출발 내일 14:30". 항공편 판과 같은 날을 말한다. 출발 시각을 모르면 빈 글자. */
export function departureText(f: FlightView, t: Text): string {
  if (!f.schedTime) return "";
  const time = f.estTime ?? f.schedTime;
  // 늦어진 것은 말로도 알린다. 화면의 줄 그은 옛 시각은 화면 읽기 프로그램과 소리 안내로는 전해지지 않는다.
  return `${t.departure} ${departsTomorrow(f) ? `${t.departTomorrow} ` : ""}${f.delayed && f.estTime ? t.delayedTo(time) : time}`;
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
    default: {
      const min = f.minutesToClose ?? 0;
      const at = countedAt(f);
      // 마감이 한참 남았으면 남은 분 대신 마감 시각을 보여 준다. 마감이 남은 시간을 센 날의 다음 날이면 "내일"을 붙인다.
      if (min >= CLOCK_FROM_MIN && at !== null && f.closeAtMs !== null) {
        const closeAt = new Date(f.closeAtMs);
        return `${t.closeAt(kstTime(closeAt), kstDate(closeAt) > kstDate(new Date(at)))} (${t.estimate})`;
      }
      return `${t.closeIn(min)} (${t.estimate})`;
    }
  }
}

/** 공항 출발 안내판처럼 생긴 항공편 판. 탑승구가 가장 크게 보인다. */
export function FlightBoard({ flight, t, lang }: { flight: FlightView; t: Text; lang: Lang }) {
  // 내일 떠나는 편은 실제로 떠나는 시각 앞에 "내일"을 붙인다. 등록 화면이 "내일 14:30"으로 보여 준 편을 오늘 편으로 읽지 않게 한다.
  const day = departsTomorrow(flight) ? (
    <>
      <b>{t.departTomorrow}</b>{" "}
    </>
  ) : null;
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
                {/* 줄 그은 옛 시각은 화면 읽기 프로그램이 알리지 않는다. 읽을 때는 "출발 15:10, 늦어졌습니다"처럼 말로 준다. */}
                <span aria-hidden="true">
                  <s className="num">{flight.schedTime}</s> {day}
                  <b className="num">{flight.estTime}</b>
                </span>
                <span className="sr-only">{departureText(flight, t).slice(t.departure.length)}</span>
              </>
            ) : (
              <>
                {day}
                <b className="num">{flight.schedTime ?? "–"}</b>
              </>
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

/** 길 끝에 붙는 장소 이름. "탑승구 112", "장애인 화장실"처럼 t.arrive 에 넣는다. */
function endName(target: RouteTarget, t: Text): string {
  return target.type === "gate" ? `${t.gate} ${target.gate}` : t.facility[target.kind];
}

/** 마침표 뒤에서 문장을 새로 시작할 때 첫 글자를 대문자로. 영어 "next to Gate…"가 소문자로 시작하지 않게 한다. 한글은 그대로다. */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
      ? t.arrive(endName(target, t))
      : `${t.arrive(endName(target, t))}. ${sentence(t.nearGate(target.nearGate))}, ${t.level(target.level)}`;
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
          <strong>{t.arrive(endName(target, t))}</strong>
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
