import type { Db } from "./db";
import { kstDate } from "./flights/normalize";

// 시범 전후 비교에 쓰는 측정값(명세 5.3). 사람을 알 수 있는 값은 꺼내지 않는다.
// 이름·편명·필요한 도움은 조회하지 않고, 시각은 시간대(시)까지만 내보낸다.

export interface RegistrationMetric {
  route: string; // web / paper / assisted
  hourKst: number; // 등록한 시간대
  writeSec: number; // 작성 시간 (화면을 연 때부터 제출까지)
  editCount: number; // 이전 단계로 돌아가 고친 횟수
  linkWaitSec: number | null; // 제출부터 패스 연결까지. 연결 전이면 null
  status: string;
  isMock: boolean;
}

export interface EncounterMetric {
  zoneId: string;
  gateBand: string | null; // 삭제 작업이 채운다. 그 전에는 null
  hourKst: number;
  scanToStartSec: number | null; // 스캔부터 응대 시작까지
  serviceSec: number | null; // 응대 시작부터 완료까지
  supportGroups: string[]; // 삭제 작업이 채운다
  completed: boolean;
}

export interface PollMetric {
  total: number;
  failed: number;
  avgDurationMs: number | null;
  gateChanges: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

export async function collectMetrics(
  db: Db,
  since: Date,
): Promise<{ registrations: RegistrationMetric[]; encounters: EncounterMetric[]; polls: PollMetric }> {
  const registrations = await db.query<RegistrationMetric>(
    `select route,
            extract(hour from submitted_at at time zone 'Asia/Seoul')::int as "hourKst",
            extract(epoch from (submitted_at - started_at))::int as "writeSec",
            edit_count as "editCount",
            extract(epoch from (linked_at - submitted_at))::int as "linkWaitSec",
            status, is_mock as "isMock"
     from registrations where submitted_at >= $1 order by submitted_at`,
    [since],
  );
  const encounters = await db.query<EncounterMetric>(
    `select zone_id as "zoneId", gate_band as "gateBand",
            extract(hour from scanned_at at time zone 'Asia/Seoul')::int as "hourKst",
            extract(epoch from (started_at - scanned_at))::int as "scanToStartSec",
            extract(epoch from (ended_at - started_at))::int as "serviceSec",
            support_groups as "supportGroups",
            (ended_at is not null) as completed
     from encounters where scanned_at >= $1 order by scanned_at`,
    [since],
  );
  const [polls] = await db.query<PollMetric>(
    `select count(*)::int as total,
            count(*) filter (where not ok)::int as failed,
            avg(duration_ms) filter (where ok)::int as "avgDurationMs",
            coalesce(sum(gate_changes), 0)::int as "gateChanges",
            min(polled_at) as "firstAt", max(polled_at) as "lastAt"
     from flight_polls where polled_at >= $1`,
    [since],
  );
  return { registrations, encounters, polls };
}

/** 안내데스크의 "오늘 현황". 건수와 가운데값만 담는다. 누구의 것인지 알 수 있는 값은 없다. */
export interface TodaySummary {
  date: string; // 한국 날짜
  registered: number; // 오늘 받은 등록
  byRoute: { web: number; assisted: number; paper: number };
  linked: number; // 그 가운데 패스를 연결한 것
  waiting: number; // 지금 패스를 기다리는 등록
  active: number; // 지금 패스를 쓰고 있는 여객
  medianWriteSec: number | null; // 등록 작성 시간
  medianLinkWaitSec: number | null; // 등록부터 패스 연결까지
  scans: number; // 직원이 여객 카드를 연 횟수
  completed: number; // 응대 완료
  medianScanToStartSec: number | null; // 카드를 열고 응대를 시작하기까지
  medianServiceSec: number | null; // 응대 시간
  handoffs: number; // 두 구역 이상이 이어서 응대한 여객
}

function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && x >= 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

export async function todaySummary(db: Db, now: Date): Promise<TodaySummary> {
  const date = kstDate(now);
  const since = new Date(`${date}T00:00:00+09:00`);
  const { registrations, encounters } = await collectMetrics(db, since);
  const [live] = await db.query<{ waiting: number; active: number }>(
    `select count(*) filter (where status = 'pending')::int as waiting,
            count(*) filter (where status = 'active')::int as active
     from registrations`,
  );
  const [{ handoffs }] = await db.query<{ handoffs: number }>(
    `select count(*)::int as handoffs from (
       select registration_id from encounters
       where scanned_at >= $1 and registration_id is not null
       group by registration_id having count(distinct zone_id) >= 2
     ) t`,
    [since],
  );
  const count = (route: string) => registrations.filter((r) => r.route === route).length;
  return {
    date,
    registered: registrations.length,
    byRoute: { web: count("web"), assisted: count("assisted"), paper: count("paper") },
    linked: registrations.filter((r) => r.linkWaitSec !== null).length,
    waiting: live?.waiting ?? 0,
    active: live?.active ?? 0,
    medianWriteSec: median(registrations.map((r) => r.writeSec)),
    medianLinkWaitSec: median(registrations.map((r) => r.linkWaitSec)),
    scans: encounters.length,
    completed: encounters.filter((e) => e.completed).length,
    medianScanToStartSec: median(encounters.map((e) => e.scanToStartSec)),
    medianServiceSec: median(encounters.map((e) => e.serviceSec)),
    handoffs,
  };
}
