import { knownCodes } from "./catalog";
import { config } from "./config";
import type { Db } from "./db";
import { lastSuccessfulPoll } from "./flights/ingest";
import { addDays, kstDate } from "./flights/normalize";
import { isUuid, type Lang } from "./registrations";
import { departureAt, isBoardingClosed, isBoardingNow, isCancelled, isDelayed, isDeparted, minutesToClose } from "./timing";

/** 패스를 쓰고 있는 여객 한 명의 등록과 그 항공편. 이름은 없다. */
export interface Journey {
  registrationId: string;
  /** 여객이 등록한 출발 날짜(예정, 한국 날짜). 운항 정보가 아직 없는 먼 날짜 편에도 있다. */
  flightDate: string | null;
  choices: string[];
  lang: Lang;
  submittedAt: Date;
  flightNo: string; // 여객이 고른 편명
  operatingNo: string | null; // 공동운항이면 실제 운항 편명
  destName: string;
  destCode: string;
  terminal: string;
  gate: number | null;
  prevGate: number | null;
  gateChangedAt: Date | null;
  schedAt: Date | null; // 운항 정보를 찾지 못하면 null
  estAt: Date | null;
  status: string;
  minutesToClose: number | null; // 결항이거나 운항 정보가 없으면 null
  cancelled: boolean;
  delayed: boolean;
  boardingNow: boolean; // 공공데이터가 알려 준 탑승중·마감예정
  boardingClosed: boolean; // 공공데이터가 알려 준 실제 탑승 마감
  /** 증빙이 확인되었는가(우대 대상). 서류와 대상 유형은 갖고 있지 않다. */
  proofVerified: boolean;
  /** 체크인하면서 전자토큰을 탑승권에 저장했는가(시제품은 모의 체크인). */
  checkedIn: boolean;
}

interface JourneyRow {
  id: string;
  flight_date: string | null;
  proof_status: string;
  checked_in_at: Date | null;
  needs: string[];
  lang: string;
  submitted_at: Date;
  flight_no: string | null;
  f_dest_name: string | null;
  f_dest_code: string | null;
  f_terminal: string | null;
  f_gate: number | null;
  f_prev_gate: number | null;
  f_gate_changed_at: Date | null;
  f_sched_at: Date | null;
  f_est_at: Date | null;
  f_status: string | null;
  m_found: boolean;
  m_flight_no: string | null;
  m_terminal: string | null;
  m_gate: number | null;
  m_prev_gate: number | null;
  m_gate_changed_at: Date | null;
  m_sched_at: Date | null;
  m_est_at: Date | null;
  m_status: string | null;
}

// f 는 여객이 고른 편, m 은 공동운항일 때의 실제 운항 편이다.
// 탑승구·시각·상태는 m 이 있으면 m 의 값을 쓴다.
const JOURNEY_SQL = `
  select r.id, r.flight_date::text as flight_date, r.needs, r.lang, r.submitted_at, r.flight_no, r.proof_status, p.checked_in_at,
    f.dest_name as f_dest_name, f.dest_code as f_dest_code, f.terminal as f_terminal,
    f.gate as f_gate, f.prev_gate as f_prev_gate, f.gate_changed_at as f_gate_changed_at,
    f.sched_at as f_sched_at, f.est_at as f_est_at, f.status as f_status,
    (m.flight_no is not null) as m_found,
    m.flight_no as m_flight_no, m.terminal as m_terminal,
    m.gate as m_gate, m.prev_gate as m_prev_gate, m.gate_changed_at as m_gate_changed_at,
    m.sched_at as m_sched_at, m.est_at as m_est_at, m.status as m_status
  from registrations r
  left join passes p on p.registration_id = r.id and p.state = 'active'
  left join flights f on f.flight_date = r.flight_date and f.flight_no = r.flight_no
  left join flights m on m.flight_date = f.flight_date and m.flight_no = f.master_no
    and f.master_no <> '' and f.master_no <> f.flight_no
  where r.status = 'active'`;

function toJourney(r: JourneyRow, now: Date): Journey {
  const op = r.m_found
    ? {
        terminal: r.m_terminal ?? "",
        gate: r.m_gate,
        prevGate: r.m_prev_gate,
        gateChangedAt: r.m_gate_changed_at,
        schedAt: r.m_sched_at,
        estAt: r.m_est_at,
        status: r.m_status ?? "",
      }
    : {
        terminal: r.f_terminal ?? "",
        gate: r.f_gate,
        prevGate: r.f_prev_gate,
        gateChangedAt: r.f_gate_changed_at,
        schedAt: r.f_sched_at,
        estAt: r.f_est_at,
        status: r.f_status ?? "",
      };
  const times = op.schedAt ? { schedAt: op.schedAt, estAt: op.estAt, status: op.status } : null;
  const cancelled = times ? isCancelled(times) : false;
  return {
    registrationId: r.id,
    flightDate: r.flight_date,
    choices: knownCodes(r.needs),
    lang: r.lang === "en" ? "en" : "ko",
    submittedAt: r.submitted_at,
    flightNo: r.flight_no ?? "",
    operatingNo: r.m_found ? r.m_flight_no : null,
    destName: r.f_dest_name ?? "",
    destCode: r.f_dest_code ?? "",
    terminal: op.terminal,
    gate: op.gate,
    prevGate: op.gateChangedAt ? op.prevGate : null,
    gateChangedAt: op.gateChangedAt,
    schedAt: op.schedAt,
    estAt: op.estAt,
    status: op.status,
    minutesToClose: times && !cancelled ? minutesToClose(times, now) : null,
    cancelled,
    delayed: times ? isDelayed(times) : false,
    boardingNow: times ? isBoardingNow(times) : false,
    boardingClosed: times ? isBoardingClosed(times) : false,
    proofVerified: r.proof_status === "verified",
    checkedIn: r.checked_in_at !== null,
  };
}

/** 패스를 쓰고 있는 등록 전체. 삭제 작업이 이 목록으로 지울 대상을 고른다. */
export async function loadJourneys(db: Db, now: Date): Promise<Journey[]> {
  return (await db.query<JourneyRow>(JOURNEY_SQL)).map((r) => toJourney(r, now));
}

export async function getJourney(db: Db, registrationId: string, now: Date): Promise<Journey | null> {
  if (!isUuid(registrationId)) return null;
  const rows = await db.query<JourneyRow>(`${JOURNEY_SQL} and r.id = $1`, [registrationId]);
  return rows[0] ? toJourney(rows[0], now) : null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
// 운항 정보가 테이블에서 사라진 등록을 잡는 마지막 안전장치.
const ORPHAN_HOURS = 48;

/** 결항 편은 예정 출발일 다음 날 04:00(한국 시각)까지 남긴다. 여객이 공항에 머물 수 있어서다. */
function cancelledUntil(schedAt: Date): Date {
  return new Date(`${addDays(kstDate(schedAt), 1)}T04:00:00+09:00`);
}

/**
 * isJourneyOver 에 넘길 "실제 운항 수집이 마지막으로 성공한 시각". 모의 운항만 쓰는 곳(넣은 기록뿐)은 null 이다.
 * 모의 운항은 시각이 바뀌지 않으므로 기다릴 까닭이 없다.
 */
export async function lastRealPoll(db: Db): Promise<Date | null> {
  return lastSuccessfulPoll(db, false);
}

/**
 * 이 여객의 여정이 끝났는가. 삭제 작업이 지울 대상을 고르는 기준이며,
 * 패스를 여는 쪽도 같은 기준으로 끝난 패스를 열지 않는다. 삭제 작업이 늦게 돌아도 떠난 여객의 정보가 화면에 나오지 않는다.
 *
 * lastPoll 은 실제 운항 수집이 마지막으로 성공한 시각(lastRealPoll). "출발 30분 뒤"는 그 뒤에 받은 운항 정보로도
 * 늦어지지 않은 것이 확인됐을 때만 쓴다. 수집은 한 시간마다 아무 분에나 돌아 두 시간 가까이 벌어질 수 있어서,
 * 그사이 늦어진 편을 옛 출발 시각으로 끝난 것으로 보면 아직 공항에 있는 여객의 등록을 지워 버린다.
 * 수집이 멈춘 채면 수집 지연 경고 시간(staleMin)만큼만 더 기다린다.
 */
export function isJourneyOver(j: Journey, now: Date, lastPoll: Date | null): boolean {
  const t = now.getTime();
  // 운항 정보가 없다: 먼 날짜에 미리 등록해 아직 운항 정보가 들어오지 않았거나, 운항 정보가 사라졌다.
  // 등록한 날짜의 다음 날 04:00 까지 기다리고(그 사이 운항 정보가 들어오면 위의 규칙을 따른다), 등록 뒤 48시간도 지나야 지운다.
  if (!j.schedAt) {
    const byDate = j.flightDate ? new Date(`${addDays(j.flightDate, 1)}T04:00:00+09:00`).getTime() : 0;
    return t >= Math.max(byDate, j.submittedAt.getTime() + ORPHAN_HOURS * HOUR);
  }

  if (t >= j.schedAt.getTime() + config.purgeSafetyHours * HOUR) return true;
  const times = { schedAt: j.schedAt, estAt: j.estAt, status: j.status };
  if (j.cancelled) return t >= cancelledUntil(j.schedAt).getTime();
  if (isDeparted(times)) return true;
  const end = departureAt(times).getTime() + config.purgeAfterDepartureMin * MIN;
  if (t < end) return false;
  if (!lastPoll || lastPoll.getTime() >= end) return true;
  return t >= end + config.staleMin * MIN;
}
