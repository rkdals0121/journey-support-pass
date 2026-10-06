import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import type { Db } from "./db";

// 직원은 개인이 아니라 구역으로만 구분한다. 세션에도 구역만 담는다.
export interface Session {
  zoneId: string;
  isDesk: boolean;
  /** 공통 직원 코드로 들어왔다. 근무 구역을 스스로 고르고 바꿀 수 있다. */
  canSwitch: boolean;
  /** 아직 근무 구역을 고르지 않았다. 고르기 전에는 여객 정보를 열 수 없다. */
  needsZone: boolean;
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

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * 차단 판정에만 쓰는 값. "접속 주소 해시:기기 해시" 형태이며 원래의 IP 와 User-Agent 는 저장하지 않는다.
 * 기기 해시만 쓰면 브라우저 표시(User-Agent)를 바꿔 가며 잠금을 피할 수 있으므로 접속 주소 부분을 따로 둔다.
 */
export function deviceKey(ip: string, userAgent: string): string {
  return `${sha(ip)}:${sha(`${ip}|${userAgent}`)}`;
}

/** 기기 키에서 접속 주소 부분. */
export function ipPart(device: string): string {
  return device.split(":")[0];
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
    return {
      zoneId: s.zoneId,
      isDesk: s.isDesk === true,
      canSwitch: s.canSwitch === true,
      needsZone: s.needsZone === true,
      exp: s.exp,
    };
  } catch {
    return null;
  }
}

export type LogAction =
  | "scan_view"
  | "number_view"
  | "receipt_view"
  | "list_view"
  | "register"
  | "cancel"
  | "edit"
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

/**
 * 최근 lockMinutes 안에 같은 기기의 실패가 lockMaxFails 건 이상이거나,
 * 같은 접속 주소의 실패가 lockIpMaxFails 건 이상이면 잠근다.
 * 공항 안에서는 여러 직원이 한 접속 주소를 함께 쓰므로 주소 쪽 기준은 넉넉하게 둔다.
 */
export async function isLocked(
  db: Db,
  device: string,
  failAction: "login_fail" | "number_fail",
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - config.lockMinutes * 60_000);
  const [row] = await db.query<{ by_device: number; by_ip: number }>(
    `select count(*) filter (where device_key = $1)::int as by_device, count(*)::int as by_ip
     from access_logs
     where split_part(device_key, ':', 1) = $2 and action = $3 and at > $4`,
    [device, ipPart(device), failAction, since],
  );
  return (row?.by_device ?? 0) >= config.lockMaxFails || (row?.by_ip ?? 0) >= config.lockIpMaxFails;
}

export type LoginResult =
  | { ok: true; token: string; session: Session; zoneLabel: string }
  | { ok: false; reason: "locked" | "invalid" };

export async function login(db: Db, code: string, device: string, now: Date): Promise<LoginResult> {
  if (await isLocked(db, device, "login_fail", now)) return { ok: false, reason: "locked" };

  const zones = await db.query<{
    id: string;
    label: string;
    code_hash: string;
    is_desk: boolean;
    is_common: boolean;
  }>("select id, label, code_hash, is_desk, is_common from zones where active");
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
    canSwitch: matched.is_common,
    needsZone: matched.is_common,
    exp: now.getTime() + config.sessionHours * 3_600_000,
  };
  return { ok: true, token: signSession(session), session, zoneLabel: matched.label };
}

/**
 * 공통 직원 코드로 들어온 사람이 근무 구역을 고르거나 바꾼다.
 * 세션의 만료 시각은 그대로 둔다. 구역을 바꾼다고 로그인 시간이 늘어나지 않는다.
 */
export async function switchZone(
  db: Db,
  session: Session,
  zoneId: string,
): Promise<{ ok: true; token: string; session: Session; zoneLabel: string } | { ok: false }> {
  if (!session.canSwitch) return { ok: false };
  const [zone] = await db.query<{ id: string; label: string }>(
    "select id, label from zones where id = $1 and active and not is_desk and not is_common",
    [zoneId],
  );
  if (!zone) return { ok: false };
  const next: Session = { ...session, zoneId: zone.id, needsZone: false };
  return { ok: true, token: signSession(next), session: next, zoneLabel: zone.label };
}
