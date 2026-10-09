import { placeOf } from "./airport";
import type { Db } from "./db";
import { isUuid } from "./registrations";

// 여객이 키오스크에서 누른 「직원 부르기」.
// 직원은 먼저 다가가지 않는다. 여객이 부를 때만 호출이 생기고, 그 구역 직원 화면에 뜬다.

export type CallState = "waiting" | "accepted" | "done" | "cancelled";
export type CallScreen = "register" | "guide";

export interface Call {
  id: string;
  createdAt: Date;
  placeId: string;
  zoneId: string;
  registrationId: string | null;
  screen: CallScreen;
  acceptedAt: Date | null;
  acceptedZone: string | null;
  endedAt: Date | null;
  state: CallState;
}

interface Row {
  id: string;
  created_at: Date;
  place_id: string;
  zone_id: string;
  registration_id: string | null;
  screen: string;
  accepted_at: Date | null;
  accepted_zone: string | null;
  ended_at: Date | null;
  end_kind: string | null;
}

const COLUMNS =
  "id, created_at, place_id, zone_id, registration_id, screen, accepted_at, accepted_zone, ended_at, end_kind";

function toCall(r: Row): Call {
  const state: CallState = r.ended_at ? (r.end_kind === "done" ? "done" : "cancelled") : r.accepted_at ? "accepted" : "waiting";
  return {
    id: r.id,
    createdAt: r.created_at,
    placeId: r.place_id,
    zoneId: r.zone_id,
    registrationId: r.registration_id,
    screen: r.screen === "register" ? "register" : "guide",
    acceptedAt: r.accepted_at,
    acceptedZone: r.accepted_zone,
    endedAt: r.ended_at,
    state,
  };
}

const MIN = 60_000;
/** 아무도 받지 않은 채 이만큼 지난 호출은 닫는다. 여객이 자리를 떠난 것으로 본다. */
export const CALL_EXPIRE_MIN = 30;
/** 직원이 받고도 마침을 누르지 않은 호출은 받은 뒤 이만큼 지나면 닫는다. 그 키오스크에서 다음 호출을 받을 수 있게 한다. */
export const CALL_ACCEPTED_EXPIRE_MIN = 90;
/** 끝난 호출을 직원 화면에 이만큼 더 보여준다. */
const RECENT_MIN = 30;

async function closeStale(db: Db, now: Date): Promise<void> {
  await db.query(
    `update calls set ended_at = $1, end_kind = 'cancelled'
     where ended_at is null and accepted_at is null and created_at < $2`,
    [now, new Date(now.getTime() - CALL_EXPIRE_MIN * MIN)],
  );
  await db.query(
    "update calls set ended_at = $1, end_kind = 'done' where ended_at is null and accepted_at < $2",
    [now, new Date(now.getTime() - CALL_ACCEPTED_EXPIRE_MIN * MIN)],
  );
}

/**
 * 호출을 만든다. 그 키오스크에 끝나지 않은 호출이 이미 있으면 그 호출을 돌려준다.
 * 버튼을 여러 번 눌러도, 두 번 연달아 눌러도 한 줄만 생긴다.
 * 아직 아무도 받지 않은 호출에는 지금 누른 사람의 패스를 붙인다(패스 없이 눌렀으면 뗀다).
 * 앞사람이 부르고 떠난 뒤 다음 사람이 누르면, 직원이 앞사람의 고른 항목을 보고 오지 않게 하기 위해서다.
 * 직원이 이미 받은 호출은 바꾸지 않는다. 직원은 처음 부른 여객을 보고 오는 중이다.
 */
export async function createCall(
  db: Db,
  placeId: string,
  registrationId: string | null,
  screen: CallScreen,
  now: Date,
): Promise<Call | null> {
  const place = placeOf(placeId);
  if (!place) return null;
  const reg = isUuid(registrationId) ? registrationId : null;
  await closeStale(db, now);
  await db.query(
    `insert into calls (created_at, place_id, zone_id, registration_id, screen)
     values ($1, $2, $3, $4, $5) on conflict do nothing`,
    [now, place.id, place.zoneId, reg, screen],
  );
  await db.query(
    `update calls set registration_id = $2, screen = $3
     where place_id = $1 and ended_at is null and accepted_at is null and registration_id is distinct from $2`,
    [place.id, reg, screen],
  );
  const [row] = await db.query<Row>(`select ${COLUMNS} from calls where place_id = $1 and ended_at is null`, [place.id]);
  return row ? toCall(row) : null;
}

/** 키오스크가 자기 호출의 상태를 확인한다. 다른 키오스크의 호출은 보지 못한다. */
export async function getCallAt(db: Db, id: string, placeId: string): Promise<Call | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.query<Row>(`select ${COLUMNS} from calls where id = $1 and place_id = $2`, [id, placeId]);
  return row ? toCall(row) : null;
}

/** 여객이 호출을 거둔다. */
export async function cancelCall(db: Db, id: string, placeId: string, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.query(
    "update calls set ended_at = $3, end_kind = 'cancelled' where id = $1 and place_id = $2 and ended_at is null returning id",
    [id, placeId, now],
  );
  return rows.length === 1;
}

/** 직원이 "가겠습니다"를 누른다. 먼저 누른 구역만 받는다. */
export async function acceptCall(db: Db, id: string, zoneId: string, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.query(
    `update calls set accepted_at = $3, accepted_zone = $2
     where id = $1 and ended_at is null and accepted_at is null returning id`,
    [id, zoneId, now],
  );
  return rows.length === 1;
}

/** 직원이 도움을 마쳤다. 받지 않고 바로 마칠 수도 있다(지나가다 도운 경우). */
export async function finishCall(db: Db, id: string, zoneId: string, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.query(
    `update calls set ended_at = $3, end_kind = 'done',
       accepted_at = coalesce(accepted_at, $3), accepted_zone = coalesce(accepted_zone, $2)
     where id = $1 and ended_at is null returning id`,
    [id, zoneId, now],
  );
  return rows.length === 1;
}

/** 직원 화면에 보여줄 호출. 끝나지 않은 것 전부와 방금 끝난 것. 오래 기다린 순. */
export async function listCalls(db: Db, now: Date): Promise<Call[]> {
  await closeStale(db, now);
  const rows = await db.query<Row>(
    `select ${COLUMNS} from calls
     where ended_at is null or ended_at > $1
     order by (ended_at is not null), created_at`,
    [new Date(now.getTime() - RECENT_MIN * MIN)],
  );
  return rows.map(toCall);
}
