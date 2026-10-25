import { placeOf } from "./airport";
import type { Db } from "./db";
import { isUuid } from "./registrations";

// 이동지원(전동차) 요청. 여객이 공항 입구 키오스크나 자기 휴대전화에서 청하고, 직원이 받아 배정·이동·완료로 처리한다.
// 멘토링: 지금은 안내데스크가 받아 관리자에게 메신저로 넘기고, 관리자가 다시 담당 직원에게 넘기는 구조라 중간에 빠지면 늦어진다.
// 여기서는 요청이 바로 직원 화면에 뜨고, 여객은 접수 상태를 화면에서 본다.

export type AssistState = "received" | "assigned" | "moving" | "done" | "cancelled";
export const OPEN_STATES: AssistState[] = ["received", "assigned", "moving"];

export interface Assist {
  id: string;
  createdAt: Date;
  registrationId: string | null;
  /** 청한 키오스크의 자리. 휴대전화에서 청했으면 null. */
  placeId: string | null;
  state: AssistState;
  assignedZone: string | null;
  assignedAt: Date | null;
  endedAt: Date | null;
}

interface Row {
  id: string;
  created_at: Date;
  registration_id: string | null;
  place_id: string | null;
  state: AssistState;
  assigned_zone: string | null;
  assigned_at: Date | null;
  ended_at: Date | null;
}

const COLUMNS = "id, created_at, registration_id, place_id, state, assigned_zone, assigned_at, ended_at";

const toAssist = (r: Row): Assist => ({
  id: r.id,
  createdAt: r.created_at,
  registrationId: r.registration_id,
  placeId: r.place_id,
  state: r.state,
  assignedZone: r.assigned_zone,
  assignedAt: r.assigned_at,
  endedAt: r.ended_at,
});

/** 아무도 받지 않은 채 이만큼 지나면 스스로 닫는다(직원 호출과 같다). 받은 요청은 마칠 때까지 둔다. */
export const ASSIST_EXPIRE_MIN = 60;
// 직원이 받고 마치지 않은 요청은 이만큼 지나면 닫는다.
const ASSIST_ACCEPTED_EXPIRE_MIN = 180;
const MIN = 60_000;

export async function closeStaleAssist(db: Db, now: Date): Promise<void> {
  await db.query(
    "update assist_requests set state = 'cancelled', end_kind='expired', ended_at = $1 where state = 'received' and created_at < $2",
    [now, new Date(now.getTime() - ASSIST_EXPIRE_MIN * MIN)],
  );
  await db.query(
    "update assist_requests set state = 'cancelled', end_kind='expired', ended_at = $1 where state in ('assigned','moving') and assigned_at < $2",
    [now, new Date(now.getTime() - ASSIST_ACCEPTED_EXPIRE_MIN * MIN)],
  );
}

/** 요청을 만든다. 이 여객의 끝나지 않은 요청이 이미 있으면 그것을 돌려준다(두 번 눌러도 한 건). */
export async function createAssist(db: Db, registrationId: string, placeId: string | null, now: Date): Promise<Assist | null> {
  if (!isUuid(registrationId)) return null;
  await closeStaleAssist(db, now);
  const place = placeId && placeOf(placeId) ? placeId : null;
  await db.query(
    `insert into assist_requests (created_at, registration_id, place_id, state)
     values ($1, $2, $3, 'received') on conflict do nothing`,
    [now, registrationId, place],
  );
  return openAssistOf(db, registrationId);
}

export async function openAssistOf(db: Db, registrationId: string): Promise<Assist | null> {
  if (!isUuid(registrationId)) return null;
  const [row] = await db.query<Row>(
    `select ${COLUMNS} from assist_requests where registration_id = $1 and state in ('received','assigned','moving')`,
    [registrationId],
  );
  return row ? toAssist(row) : null;
}

/** 여객이 보는 접수 상태. 끝나지 않은 요청, 없으면 가장 최근에 끝난 요청. */
export async function latestAssistOf(db: Db, registrationId: string, now: Date): Promise<Assist | null> {
  if (!isUuid(registrationId)) return null;
  await closeStaleAssist(db, now);
  const [row] = await db.query<Row>(
    `select ${COLUMNS} from assist_requests where registration_id = $1
     order by (state in ('received','assigned','moving')) desc, created_at desc limit 1`,
    [registrationId],
  );
  return row ? toAssist(row) : null;
}

/** 여객이 거둔다. 직원이 이동을 시작하기 전까지만. */
export async function cancelAssist(db: Db, registrationId: string, now: Date): Promise<boolean> {
  if (!isUuid(registrationId)) return false;
  const rows = await db.query(
    `update assist_requests set state = 'cancelled', end_kind='cancelled', ended_at = $2
     where registration_id = $1 and state in ('received','assigned') returning id`,
    [registrationId, now],
  );
  return rows.length > 0;
}

/** 직원 화면의 목록. 끝나지 않은 것과 30분 안에 끝난 것. 오래된 것부터. */
export async function listAssist(db: Db, now: Date): Promise<Assist[]> {
  await closeStaleAssist(db, now);
  return (
    await db.query<Row>(
      `select ${COLUMNS} from assist_requests
       where state in ('received','assigned','moving') or ended_at > $1
       order by (state in ('received','assigned','moving')) desc, created_at`,
      [new Date(now.getTime() - 30 * MIN)],
    )
  ).map(toAssist);
}

export type AssistAction = "assign" | "move" | "done";

/**
 * 직원이 한 단계 넘긴다. 받기(assign)는 아직 아무도 받지 않은 요청만, 이동(move)·완료(done)는 받은 구역만 한다.
 * 다른 구역이 먼저 받았으면 거짓.
 */
export async function advanceAssist(db: Db, id: string, zoneId: string, action: AssistAction, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const sql: Record<AssistAction, string> = {
    assign: `update assist_requests set state = 'assigned', assigned_zone = $2, assigned_at = $3
             where id = $1 and state = 'received' returning id`,
    move: `update assist_requests set state = 'moving'
           where id = $1 and state = 'assigned' and assigned_zone = $2 returning id`,
    done: `update assist_requests set state = 'done', end_kind='done', ended_at = $3
           where id = $1 and state in ('assigned','moving') and assigned_zone = $2 returning id`,
  };
  const params = action === "move" ? [id, zoneId] : [id, zoneId, now];
  return (await db.query(sql[action], params)).length === 1;
}
