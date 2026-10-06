import type { Db } from "./db";

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
