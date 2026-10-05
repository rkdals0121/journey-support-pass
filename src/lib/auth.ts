import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import type { Db } from "./db";

// 직원은 개인이 아니라 구역으로만 구분한다. 세션에도 구역만 담는다.
export interface Session {
  zoneId: string;
  isDesk: boolean;
  exp: number; // epoch ms
}

export const SESSION_COOKIE = "jsp_session";

export function hashCode(code: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(code, salt, 32).toString("hex")}`;
}

export function verifyCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(code, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 차단 판정에만 쓰는 값. 원래의 IP 와 User-Agent 는 저장하지 않는다. */
export function deviceKey(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function signSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token: string | undefined, now: Date): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Session;
    if (typeof s.zoneId !== "string" || typeof s.exp !== "number") return null;
    if (s.exp <= now.getTime()) return null;
    return { zoneId: s.zoneId, isDesk: s.isDesk === true, exp: s.exp };
  } catch {
    return null;
  }
}

export type LogAction =
  | "scan_view"
  | "number_view"
  | "receipt_view"
  | "link"
  | "reissue"
  | "login_fail"
  | "number_fail";

export async function logAccess(
  db: Db,
  e: { at: Date; zoneId?: string; deviceKey?: string; action: LogAction; registrationId?: string },
): Promise<void> {
  await db.query(
    "insert into access_logs (at, zone_id, device_key, action, registration_id) values ($1, $2, $3, $4, $5)",
    [e.at, e.zoneId ?? null, e.deviceKey ?? null, e.action, e.registrationId ?? null],
  );
}

/** 최근 lockMinutes 안에 같은 기기의 실패가 lockMaxFails 건 이상이면 잠근다. */
export async function isLocked(
  db: Db,
  device: string,
  failAction: "login_fail" | "number_fail",
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - config.lockMinutes * 60_000);
  const [row] = await db.query<{ n: number }>(
    "select count(*)::int as n from access_logs where device_key = $1 and action = $2 and at > $3",
    [device, failAction, since],
  );
  return (row?.n ?? 0) >= config.lockMaxFails;
}

export type LoginResult =
  | { ok: true; token: string; session: Session; zoneLabel: string }
  | { ok: false; reason: "locked" | "invalid" };

export async function login(db: Db, code: string, device: string, now: Date): Promise<LoginResult> {
  if (await isLocked(db, device, "login_fail", now)) return { ok: false, reason: "locked" };

  const zones = await db.query<{ id: string; label: string; code_hash: string; is_desk: boolean }>(
    "select id, label, code_hash, is_desk from zones where active",
  );
  // 일치 여부와 무관하게 모든 구역을 대조해 걸린 시간으로 구역 수를 짐작하지 못하게 한다.
  let matched: (typeof zones)[number] | null = null;
  for (const z of zones) {
    if (verifyCode(code, z.code_hash) && !matched) matched = z;
  }
  if (!matched) {
    await logAccess(db, { at: now, deviceKey: device, action: "login_fail" });
    return { ok: false, reason: "invalid" };
  }
  const session: Session = {
    zoneId: matched.id,
    isDesk: matched.is_desk,
    exp: now.getTime() + config.sessionHours * 3_600_000,
  };
  return { ok: true, token: signSession(session), session, zoneLabel: matched.label };
}
