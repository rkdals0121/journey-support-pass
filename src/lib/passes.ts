import { randomInt } from "node:crypto";
import type { Db } from "./db";
import { PASS_NO_LENGTH, PASS_NO_RE, TOKEN_ALPHABET, TOKEN_LENGTH, TOKEN_RE } from "./pass-format";
import { isUuid } from "./registrations";

export { cleanPassNo, extractToken, formatPassNo, PASS_NO_LENGTH, passUrl, TOKEN_LENGTH } from "./pass-format";

export type PassState = "idle" | "active" | "revoked" | "expired";

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

function newToken(): string {
  let s = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) s += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
  return s;
}

function newPassNo(): string {
  return String(randomInt(0, 10 ** PASS_NO_LENGTH)).padStart(PASS_NO_LENGTH, "0");
}

function toPass(r: Row): Pass {
  return { id: r.id, token: r.token, passNo: r.pass_no, registrationId: r.registration_id, state: r.state };
}

const ISSUE_TRIES = 30;

/**
 * 등록을 마치면 바로 그 등록의 패스를 만든다. 여객 휴대전화에는 QR 로 보여주고, 키오스크에서는 같은 QR 을 스티커로 뽑는다.
 * 번호는 살아 있는 패스와만 겹치지 않게 뽑는다. 끝난 패스의 번호는 다시 쓴다.
 */
export async function issuePass(
  db: Db,
  registrationId: string,
  now: Date,
): Promise<{ ok: true; passNo: string; token: string } | { ok: false }> {
  if (!isUuid(registrationId)) return { ok: false };
  for (let i = 0; i < ISSUE_TRIES; i++) {
    // 등록이 아직 패스를 받지 않았을 때만 한 문장으로 만든다. 같은 등록에 패스가 두 장 생기지 않는다.
    const rows = await db.query<Row>(
      `insert into passes (token, pass_no, registration_id, state, linked_at)
       select $1, $2, r.id, 'active', $4 from registrations r where r.id = $3 and r.status = 'pending'
       on conflict do nothing
       returning ${COLUMNS}`,
      [newToken(), newPassNo(), registrationId, now],
    );
    if (rows[0]) {
      await db.query("update registrations set status = 'active', linked_at = $2 where id = $1 and status = 'pending'", [
        registrationId,
        now,
      ]);
      return { ok: true, passNo: rows[0].pass_no, token: rows[0].token };
    }
    // 번호가 겹친 것이 아니라 등록이 받을 상태가 아니면 더 해 봐도 소용없다.
    const [reg] = await db.query<{ status: string }>("select status from registrations where id = $1", [registrationId]);
    if (reg?.status !== "pending") return { ok: false };
  }
  return { ok: false };
}

/** 이 등록에 지금 연결되어 있는 패스. 없으면 null. */
export async function activePassOf(db: Db, registrationId: string): Promise<{ passNo: string; token: string } | null> {
  if (!isUuid(registrationId)) return null;
  const [row] = await db.query<{ pass_no: string; token: string }>(
    "select pass_no, token from passes where registration_id = $1 and state = 'active' limit 1",
    [registrationId],
  );
  return row ? { passNo: row.pass_no, token: row.token } : null;
}

export type Resolved = { kind: "unknown" } | { kind: "unusable" } | { kind: "active"; pass: Pass; registrationId: string };

interface JoinedRow extends Row {
  reg_status: string | null;
}

function classify(row: JoinedRow | undefined): Resolved {
  if (!row) return { kind: "unknown" };
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
 * 손으로 넣은 고유 일련 번호. 사용 중인 패스만 찾는다.
 * 번호는 조합이 적으므로, 끝난 패스가 있었는지는 알려 주지 않는다.
 */
export async function resolvePassNo(db: Db, passNo: string): Promise<Resolved> {
  if (!PASS_NO_RE.test(passNo)) return { kind: "unknown" };
  const [row] = await db.query<JoinedRow>(`${JOINED} where p.pass_no = $1 and p.state = 'active'`, [passNo]);
  const res = classify(row);
  return res.kind === "active" ? res : { kind: "unknown" };
}
