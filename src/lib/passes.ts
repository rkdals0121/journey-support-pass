import { randomBytes, randomInt } from "node:crypto";
import type { Db } from "./db";
import { isUuid } from "./registrations";

export type PassState = "idle" | "active" | "revoked";

export interface Pass {
  id: string;
  token: string;
  passNo: string;
  registrationId: string | null;
  state: PassState;
}

interface Row {
  id: string;
  token: string;
  pass_no: string;
  registration_id: string | null;
  state: PassState;
}

const COLUMNS = "id, token, pass_no, registration_id, state";
const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

function toPass(r: Row): Pass {
  return { id: r.id, token: r.token, passNo: r.pass_no, registrationId: r.registration_id, state: r.state };
}

/** 패스를 미리 만들어 둔다. QR 에는 token 만, 패스에는 passNo 만 인쇄한다. */
export async function generatePasses(db: Db, count: number): Promise<Pass[]> {
  const made: Pass[] = [];
  let tries = 0;
  while (made.length < count) {
    if (++tries > count * 20 + 100) throw new Error("패스 번호를 더 만들 수 없습니다");
    const rows = await db.query<Row>(
      `insert into passes (token, pass_no) values ($1, $2)
       on conflict do nothing returning ${COLUMNS}`,
      [randomBytes(18).toString("base64url"), String(randomInt(0, 10000)).padStart(4, "0")],
    );
    if (rows[0]) made.push(toPass(rows[0]));
  }
  return made;
}

/** 스캔한 글자에서 토큰을 꺼낸다. "https://host/p/XXXX" 또는 "XXXX". */
export function extractToken(scanned: string): string | null {
  const s = (scanned ?? "").trim();
  if (TOKEN_RE.test(s)) return s;
  const m = /\/p\/([A-Za-z0-9_-]{24})\/?(?:[?#].*)?$/.exec(s);
  return m ? m[1] : null;
}

export type LinkError = "not_a_pass" | "pass_in_use" | "pass_revoked";

async function passProblem(db: Db, token: string): Promise<LinkError | null> {
  const [pass] = await db.query<Row>(`select ${COLUMNS} from passes where token = $1`, [token]);
  if (!pass) return "not_a_pass";
  if (pass.state === "active") return "pass_in_use";
  if (pass.state === "revoked") return "pass_revoked";
  return null;
}

// 패스가 미사용이고 등록이 기대한 상태일 때만 한 문장으로 연결한다.
// 두 직원이 같은 패스를 동시에 연결하려 해도 한쪽만 성공한다.
async function attach(db: Db, token: string, registrationId: string, expected: "pending" | "active", now: Date) {
  const rows = await db.query<{ id: string }>(
    `update passes set state = 'active', registration_id = $2, linked_at = $3
     where token = $1 and state = 'idle'
       and exists (select 1 from registrations where id = $2 and status = $4)
     returning id`,
    [token, registrationId, now, expected],
  );
  return rows.length === 1;
}

export async function linkPass(
  db: Db,
  token: string,
  registrationId: string,
  now: Date,
): Promise<{ ok: true; passNo: string } | { ok: false; error: LinkError | "registration_not_pending" }> {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "not_a_pass" };
  if (!isUuid(registrationId)) return { ok: false, error: "registration_not_pending" };

  if (!(await attach(db, token, registrationId, "pending", now))) {
    return { ok: false, error: (await passProblem(db, token)) ?? "registration_not_pending" };
  }
  await db.query(
    "update registrations set status = 'active', linked_at = $2 where id = $1 and status = 'pending'",
    [registrationId, now],
  );
  const [pass] = await db.query<Row>(`select ${COLUMNS} from passes where token = $1`, [token]);
  return { ok: true, passNo: pass.pass_no };
}

/** 분실 재발급. 새 패스를 먼저 연결한 뒤 옛 패스를 폐기한다. */
export async function reissue(
  db: Db,
  registrationId: string,
  newToken: string,
  now: Date,
): Promise<{ ok: true; passNo: string } | { ok: false; error: LinkError | "registration_not_active" }> {
  if (!TOKEN_RE.test(newToken)) return { ok: false, error: "not_a_pass" };
  if (!isUuid(registrationId)) return { ok: false, error: "registration_not_active" };

  if (!(await attach(db, newToken, registrationId, "active", now))) {
    return { ok: false, error: (await passProblem(db, newToken)) ?? "registration_not_active" };
  }
  await db.query(
    "update passes set state = 'revoked' where registration_id = $1 and state = 'active' and token <> $2",
    [registrationId, newToken],
  );
  const [pass] = await db.query<Row>(`select ${COLUMNS} from passes where token = $1`, [newToken]);
  return { ok: true, passNo: pass.pass_no };
}

/**
 * 안내데스크에서 카메라를 쓸 수 없을 때, 패스에 인쇄된 번호로 미사용 패스를 찾는다.
 * 연결·재발급에만 쓴다. 여객 정보는 열지 않는다.
 */
export async function idleTokenByPassNo(db: Db, passNo: string): Promise<string | null> {
  if (!/^\d{4}$/.test(passNo)) return null;
  const [row] = await db.query<{ token: string }>(
    "select token from passes where pass_no = $1 and state = 'idle'",
    [passNo],
  );
  return row?.token ?? null;
}

export type Resolved =
  | { kind: "unknown" }
  | { kind: "idle"; pass: Pass }
  | { kind: "unusable" }
  | { kind: "active"; pass: Pass; registrationId: string };

interface JoinedRow extends Row {
  reg_status: string | null;
}

function classify(row: JoinedRow | undefined): Resolved {
  if (!row) return { kind: "unknown" };
  if (row.state === "idle") return { kind: "idle", pass: toPass(row) };
  if (row.state === "active" && row.registration_id && row.reg_status === "active") {
    return { kind: "active", pass: toPass(row), registrationId: row.registration_id };
  }
  return { kind: "unusable" };
}

const JOINED = `select p.id, p.token, p.pass_no, p.registration_id, p.state, r.status as reg_status
  from passes p left join registrations r on r.id = p.registration_id`;

export async function resolveToken(db: Db, token: string): Promise<Resolved> {
  if (!TOKEN_RE.test(token)) return { kind: "unknown" };
  const [row] = await db.query<JoinedRow>(`${JOINED} where p.token = $1`, [token]);
  return classify(row);
}

/**
 * 손으로 입력한 패스 번호. 사용 중인 패스만 찾는다.
 * 네 자리는 조합이 적으므로, 미사용·폐기 패스의 존재 여부를 알려 주지 않는다.
 */
export async function resolvePassNo(db: Db, passNo: string): Promise<Resolved> {
  if (!/^\d{4}$/.test(passNo)) return { kind: "unknown" };
  const [row] = await db.query<JoinedRow>(`${JOINED} where p.pass_no = $1 and p.state = 'active'`, [passNo]);
  const res = classify(row);
  return res.kind === "active" ? res : { kind: "unknown" };
}
