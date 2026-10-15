import { ipPart } from "./auth";
import { CALL_EXPIRE_MIN, closeStale } from "./calls";
import type { Db } from "./db";
import { SEED_POLL } from "./flights/ingest";
import { kstDate } from "./flights/normalize";
import { isJourneyOver, lastRealPoll, loadJourneys } from "./journey";

// 제안서의 "기대 효과와 확인 방법" 세 가지를 세는 곳.
//  1) 여객이 자신에게 맞는 안내를 받는다        → 안내 뒤 만족도 한 문항
//  2) 기기를 쓰기 어렵던 여객도 스스로 이용한다 → 안내 방식을 켰을 때와 껐을 때의 등록 완료 비율
//  3) 직원의 업무 부담을 늘리지 않는다          → 「직원 부르기」 횟수, 직원이 대신 입력한 건수
// 사람을 알 수 있는 값은 세지도 꺼내지도 않는다.

export type EventKind = "reg_start" | "reg_done" | "guide_open" | "survey";

export interface EventInput {
  at: Date;
  kind: EventKind;
  route?: string;
  adapted?: boolean;
  placeId?: string | null;
  value?: number | null;
  deviceKey?: string;
}

export async function logEvent(db: Db, e: EventInput): Promise<void> {
  await db.query(
    "insert into events (at, kind, route, adapted, place_id, value, device_key) values ($1, $2, $3, $4, $5, $6, $7)",
    [e.at, e.kind, e.route ?? "", e.adapted === true, e.placeId ?? null, e.value ?? null, e.deviceKey ?? null],
  );
}

const EVENT_WINDOW_MIN = 10;
const EVENT_MAX_PER_IP = 200;

/**
 * 화면이 보내는 건수 기록(등록 시작, 만족도)을 남용을 막으며 적는다. 같은 접속 주소에서 짧은 시간에 너무 많이 오면 받지 않는다.
 * 먼저 적고 센다(로그인·등록 한도와 같은 방식). 세고 나서 적으면 한꺼번에 보낸 요청이 모두 "아직 한도 아래"로 보고 들어온다.
 * 서버가 직접 적는 기록(등록 완료, 안내 열람)은 세지 않는다. 세면 바쁜 시간에 키오스크의 등록 시작·만족도만 빠져 비율이 틀어진다.
 */
export async function logLimitedEvent(db: Db, e: EventInput & { deviceKey: string }): Promise<boolean> {
  const [row] = await db.query<{ id: string }>(
    `insert into events (at, kind, route, adapted, place_id, value, device_key)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [e.at, e.kind, e.route ?? "", e.adapted === true, e.placeId ?? null, e.value ?? null, e.deviceKey],
  );
  const [count] = await db.query<{ n: number }>(
    `select count(*)::int as n from events
     where split_part(device_key, ':', 1) = $1 and at > $2 and kind in ('reg_start', 'survey')`,
    [ipPart(e.deviceKey), new Date(e.at.getTime() - EVENT_WINDOW_MIN * 60_000)],
  );
  if ((count?.n ?? 0) <= EVENT_MAX_PER_IP) return true;
  await db.query("delete from events where id = $1", [row.id]);
  return false;
}

export interface Completion {
  started: number;
  done: number;
  /** 완료 비율(0~100). 시작이 없으면 null. */
  rate: number | null;
}

export interface Summary {
  date: string; // 한국 날짜
  /** 지금 패스를 쓰고 있는 여객 수. */
  active: number;
  registered: number;
  byRoute: { web: number; kiosk: number; assisted: number };
  /** 등록 작성 시간의 가운데값(초). 직원이 대신 입력한 것은 뺀다. */
  medianWriteSec: number | null;
  /** 안내 방식을 켠 여객과 켜지 않은 여객의 등록 완료 비율. 여객이 스스로 한 등록만 센다. */
  completion: { adapted: Completion; plain: Completion };
  guideOpens: number;
  calls: {
    total: number;
    fromRegister: number;
    fromGuide: number;
    done: number;
    /** 여객이 거둔 호출. */
    cancelled: number;
    /** 아무도 받지 않은 채 시간이 지나 닫힌 호출. 직원 화면의 "응답 없이 닫힘"과 같은 기준이다. */
    expired: number;
    open: number;
    /** 누른 뒤 직원이 받기까지 걸린 시간의 가운데값(초). */
    medianAcceptSec: number | null;
  };
  survey: { good: number; fair: number; poor: number; total: number };
}

function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && x >= 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

function completion(started: number, done: number): Completion {
  // 시작 기록이 빠진 채 완료만 온 경우(연결이 끊겼다 이어진 경우)에도 비율이 100을 넘지 않게 한다.
  const base = Math.max(started, done);
  return { started: base, done, rate: base === 0 ? null : Math.round((done / base) * 100) };
}

/** since 부터의 집계. 안내데스크의 "오늘 현황"과 운영자용 측정값이 함께 쓴다. */
export async function summarize(db: Db, since: Date, date: string, now: Date): Promise<Summary> {
  // 아무도 받지 않아 시간이 지난 호출은 닫은 뒤에 센다.
  await closeStale(db, now);
  const regs = await db.query<{ route: string; write_sec: number }>(
    `select route, least(extract(epoch from (submitted_at - started_at)), 86400)::int as write_sec
     from registrations where submitted_at >= $1`,
    [since],
  );
  // 출발해서 여정이 끝난 여객은 삭제 작업(한 시간마다)이 아직 돌지 않았어도 빼고 센다.
  // 패스 화면·키오스크·직원 화면이 끝난 패스를 열지 않는 기준(isJourneyOver)과 같다. 쿼리는 한 번이다.
  const lastPoll = await lastRealPoll(db);
  const active = (await loadJourneys(db, now)).filter((j) => !isJourneyOver(j, now, lastPoll)).length;
  const events = await db.query<{ kind: EventKind; adapted: boolean; value: number | null; n: number }>(
    "select kind, adapted, value, count(*)::int as n from events where at >= $1 group by kind, adapted, value",
    [since],
  );
  // 받지 않은 채 CALL_EXPIRE_MIN 분 넘게 열려 있다 닫힌 호출은 "여객이 거둠"과 나눈다.
  // 직원 화면의 끝난 까닭(endReason)과 같은 기준이다. 놓친 호출이 여객이 거둔 것으로 보이지 않게 한다.
  const calls = await db.query<{
    screen: string;
    end_kind: string | null;
    ended: boolean;
    accept_sec: number | null;
    expired: boolean;
  }>(
    `select screen, end_kind, (ended_at is not null) as ended,
            extract(epoch from (accepted_at - created_at))::int as accept_sec,
            (ended_at is not null and end_kind = 'cancelled' and accepted_at is null
              and ended_at - created_at >= make_interval(mins => $2::int)) as expired
     from calls where created_at >= $1`,
    [since, CALL_EXPIRE_MIN],
  );
  // "지금 열려 있는 호출"은 언제 만들어졌든 센다. 자정 직전에 부른 호출도 아직 열려 있으면 보여야 한다.
  const [openNow] = await db.query<{ n: number }>("select count(*)::int as n from calls where ended_at is null");

  const count = (kind: EventKind, pred: (e: (typeof events)[number]) => boolean = () => true) =>
    events.filter((e) => e.kind === kind && pred(e)).reduce((n, e) => n + e.n, 0);
  const route = (r: string) => regs.filter((x) => x.route === r).length;
  const survey = { good: count("survey", (e) => e.value === 3), fair: count("survey", (e) => e.value === 2), poor: count("survey", (e) => e.value === 1) };

  return {
    date,
    active,
    registered: regs.length,
    byRoute: { web: route("web"), kiosk: route("kiosk"), assisted: route("assisted") },
    medianWriteSec: median(regs.filter((r) => r.route !== "assisted").map((r) => r.write_sec)),
    completion: {
      adapted: completion(count("reg_start", (e) => e.adapted), count("reg_done", (e) => e.adapted)),
      plain: completion(count("reg_start", (e) => !e.adapted), count("reg_done", (e) => !e.adapted)),
    },
    guideOpens: count("guide_open"),
    calls: {
      total: calls.length,
      fromRegister: calls.filter((c) => c.screen === "register").length,
      fromGuide: calls.filter((c) => c.screen !== "register").length,
      done: calls.filter((c) => c.end_kind === "done").length,
      cancelled: calls.filter((c) => c.end_kind === "cancelled" && !c.expired).length,
      expired: calls.filter((c) => c.expired).length,
      open: openNow?.n ?? 0,
      medianAcceptSec: median(calls.map((c) => c.accept_sec)),
    },
    survey: { ...survey, total: survey.good + survey.fair + survey.poor },
  };
}

export async function todaySummary(db: Db, now: Date): Promise<Summary> {
  const date = kstDate(now);
  return summarize(db, new Date(`${date}T00:00:00+09:00`), date, now);
}

export interface PollMetric {
  total: number;
  failed: number;
  avgDurationMs: number | null;
  gateChanges: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

/** 운항 정보 수집이 얼마나 잘 돌았는지. 모의 운항을 넣은 기록(SEED_POLL)은 실제 수집이 아니므로 세지 않는다. */
export async function pollMetrics(db: Db, since: Date): Promise<PollMetric> {
  const [polls] = await db.query<PollMetric>(
    `select count(*)::int as total,
            count(*) filter (where not ok)::int as failed,
            avg(duration_ms) filter (where ok)::int as "avgDurationMs",
            coalesce(sum(gate_changes), 0)::int as "gateChanges",
            min(polled_at) as "firstAt", max(polled_at) as "lastAt"
     from flight_polls where polled_at >= $1 and error is distinct from $2`,
    [since, SEED_POLL],
  );
  return polls;
}
