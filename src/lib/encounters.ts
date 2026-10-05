import type { Db } from "./db";
import { isUuid } from "./registrations";
import { isBoardingClosed, isCancelled, isDelayed, isUrgent, minutesToClose } from "./timing";
import type { Facilities } from "./zones";

export interface CaseView {
  registrationId: string;
  name: string;
  categories: string[];
  needs: string[];
  submittedAt: Date;
  flightNo: string; // 여객이 입력한 편명
  operatingNo: string | null; // 공동운항이면 실제 운항 편명
  destName: string;
  terminal: string;
  gate: number | null;
  prevGate: number | null;
  gateChangedAt: Date | null;
  schedAt: Date | null; // 운항 정보를 찾지 못하면 null
  estAt: Date | null;
  status: string;
  minutesToClose: number | null; // 결항이거나 운항 정보가 없으면 null
  urgent: boolean;
  cancelled: boolean;
  delayed: boolean;
  boardingClosed: boolean; // 공공데이터가 알려 준 실제 탑승 마감
  zoneId: string | null; // 탑승구가 속한 구역
  zoneLabel: string | null;
  gateBand: string | null;
  facilities: Facilities | null;
}

interface CaseRow {
  id: string;
  name: string | null;
  categories: string[];
  needs: string[];
  submitted_at: Date;
  flight_no: string | null;
  f_found: boolean;
  f_master_no: string | null;
  f_dest_name: string | null;
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
const CASE_SQL = `
  select r.id, r.name, r.categories, r.needs, r.submitted_at, r.flight_no,
    (f.flight_no is not null) as f_found,
    f.master_no as f_master_no, f.dest_name as f_dest_name, f.terminal as f_terminal,
    f.gate as f_gate, f.prev_gate as f_prev_gate, f.gate_changed_at as f_gate_changed_at,
    f.sched_at as f_sched_at, f.est_at as f_est_at, f.status as f_status,
    (m.flight_no is not null) as m_found,
    m.flight_no as m_flight_no, m.terminal as m_terminal,
    m.gate as m_gate, m.prev_gate as m_prev_gate, m.gate_changed_at as m_gate_changed_at,
    m.sched_at as m_sched_at, m.est_at as m_est_at, m.status as m_status
  from registrations r
  left join flights f on f.flight_date = r.flight_date and f.flight_no = r.flight_no
  left join flights m on m.flight_date = f.flight_date and m.flight_no = f.master_no
    and f.master_no <> '' and f.master_no <> f.flight_no
  where r.status = 'active'`;

interface ZoneLite {
  id: string;
  terminal: string;
  label: string;
  band: string | null;
  gates: number[];
  facilities: Facilities;
  is_desk: boolean;
}

async function loadZones(db: Db): Promise<ZoneLite[]> {
  return db.query<ZoneLite>("select id, terminal, label, band, gates, facilities, is_desk from zones where active");
}

function toCase(r: CaseRow, zones: ZoneLite[], now: Date): CaseView {
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
  const zone =
    op.gate === null
      ? null
      : (zones.find((z) => !z.is_desk && z.terminal === op.terminal && z.gates.includes(op.gate as number)) ?? null);

  return {
    registrationId: r.id,
    name: r.name ?? "",
    categories: r.categories,
    needs: r.needs,
    submittedAt: r.submitted_at,
    flightNo: r.flight_no ?? "",
    operatingNo: r.m_found ? r.m_flight_no : null,
    destName: r.f_dest_name ?? "",
    terminal: op.terminal,
    gate: op.gate,
    prevGate: op.prevGate,
    gateChangedAt: op.gateChangedAt,
    schedAt: op.schedAt,
    estAt: op.estAt,
    status: op.status,
    minutesToClose: times && !cancelled ? minutesToClose(times, now) : null,
    urgent: times ? isUrgent(times, now) : false,
    cancelled,
    delayed: times ? isDelayed(times) : false,
    boardingClosed: times ? isBoardingClosed(times) : false,
    zoneId: zone?.id ?? null,
    zoneLabel: zone?.label ?? null,
    gateBand: zone?.band ?? null,
    facilities: zone
      ? {
          elevators: zone.facilities?.elevators ?? [],
          restrooms: zone.facilities?.restrooms ?? [],
          waitingPoints: zone.facilities?.waitingPoints ?? [],
        }
      : null,
  };
}

/** 패스가 연결된 등록 전체. 삭제 작업도 이 목록으로 판정한다. */
export async function loadActiveCases(db: Db, now: Date): Promise<CaseView[]> {
  const [rows, zones] = await Promise.all([db.query<CaseRow>(CASE_SQL), loadZones(db)]);
  return rows.map((r) => toCase(r, zones, now));
}

export async function getCase(db: Db, registrationId: string, now: Date): Promise<CaseView | null> {
  if (!isUuid(registrationId)) return null;
  const [rows, zones] = await Promise.all([
    db.query<CaseRow>(`${CASE_SQL} and r.id = $1`, [registrationId]),
    loadZones(db),
  ]);
  return rows[0] ? toCase(rows[0], zones, now) : null;
}

// 마감이 가까운 순. 결항과 운항 정보 없음은 맨 뒤.
function byUrgency(a: CaseView, b: CaseView): number {
  const av = a.minutesToClose ?? Number.POSITIVE_INFINITY;
  const bv = b.minutesToClose ?? Number.POSITIVE_INFINITY;
  return av - bv || a.submittedAt.getTime() - b.submittedAt.getTime();
}

/**
 * 구역 목록. 시스템은 여객의 현재 위치를 모르므로 탑승구가 속한 구역으로 나눈다.
 * 안내데스크는 전체를 본다.
 */
export async function listForZone(
  db: Db,
  zoneId: string,
  now: Date,
): Promise<{ assigned: CaseView[]; gateUnknown: CaseView[] }> {
  const [zone] = await db.query<{ terminal: string; is_desk: boolean }>(
    "select terminal, is_desk from zones where id = $1 and active",
    [zoneId],
  );
  if (!zone) return { assigned: [], gateUnknown: [] };

  const all = await loadActiveCases(db, now);
  if (zone.is_desk) return { assigned: all.sort(byUrgency), gateUnknown: [] };
  return {
    assigned: all.filter((c) => c.zoneId === zoneId).sort(byUrgency),
    gateUnknown: all.filter((c) => c.gate === null && c.terminal === zone.terminal).sort(byUrgency),
  };
}

export interface EncounterState {
  id: string;
  started: boolean;
}

/**
 * 스캔(또는 번호 조회)을 기록한다. 같은 구역이 끝내지 않은 기록이 있으면 그것을 돌려주어
 * 카드를 다시 열 때 기록이 불어나지 않게 한다. 다른 구역이 스캔하면 새 기록이 생기며, 이것이 인계다.
 */
export async function recordScan(db: Db, registrationId: string, zoneId: string, now: Date): Promise<EncounterState> {
  const [open] = await db.query<{ id: string; started_at: Date | null }>(
    `select id, started_at from encounters
     where registration_id = $1 and zone_id = $2 and ended_at is null
     order by scanned_at desc limit 1`,
    [registrationId, zoneId],
  );
  if (open) return { id: open.id, started: open.started_at !== null };

  const [row] = await db.query<{ id: string }>(
    "insert into encounters (registration_id, zone_id, scanned_at) values ($1, $2, $3) returning id",
    [registrationId, zoneId, now],
  );
  return { id: row.id, started: false };
}

export async function startEncounter(db: Db, encounterId: string, zoneId: string, now: Date): Promise<boolean> {
  if (!isUuid(encounterId)) return false;
  const rows = await db.query(
    `update encounters set started_at = $3
     where id = $1 and zone_id = $2 and started_at is null and ended_at is null returning id`,
    [encounterId, zoneId, now],
  );
  return rows.length === 1;
}

export async function endEncounter(db: Db, encounterId: string, zoneId: string, now: Date): Promise<boolean> {
  if (!isUuid(encounterId)) return false;
  const rows = await db.query(
    `update encounters set ended_at = $3
     where id = $1 and zone_id = $2 and started_at is not null and ended_at is null returning id`,
    [encounterId, zoneId, now],
  );
  return rows.length === 1;
}
