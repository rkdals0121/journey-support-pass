import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
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
  /** 키오스크 설치 코드로 들어온 기기. 직원 화면은 열 수 없고 키오스크 화면만 쓴다. */
  isKiosk: boolean;
  /** 키오스크가 놓인 자리 (airport.ts 의 PLACES). 키오스크가 아니면 null. */
  placeId: string | null;
  exp: number; // epoch ms
}

export const SESSION_COOKIE = "jsp_session";

export function hashCode(code: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(code, salt, 32).toString("hex")}`;
}

/**
 * verifyCode 와 같지만 서버를 붙잡아 두지 않는다. 로그인은 구역마다 한 번씩 대조하므로 동기 방식이면
 * 로그인 요청이 몰릴 때 다른 화면의 요청까지 멈춘다.
 */
export function verifyCodeAsync(code: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return Promise.resolve(false);
  const expected = Buffer.from(hashHex, "hex");
  return new Promise((resolve) => {
    scrypt(code, Buffer.from(saltHex, "hex"), expected.length, (err, actual) => {
      resolve(!err && actual.length === expected.length && timingSafeEqual(actual, expected));
    });
  });
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
  return `${sha(network(ip))}:${sha(`${ip}|${userAgent}`)}`;
}

/**
 * 잠금과 등록 한도를 셀 때 쓰는 "같은 곳" 단위. IPv4 는 주소 그대로, IPv6 는 앞 64비트(/64)로 묶는다.
 * 집이나 클라우드에서 받는 IPv6 는 보통 /64 하나를 통째로 쓸 수 있어, 주소를 바꿔 가며 한도를 피할 수 있기 때문이다.
 */
export function network(ip: string): string {
  const v = ip.trim().toLowerCase();
  if (!v.includes(":")) return v;
  // IPv4 를 IPv6 꼴로 적은 것(::ffff:1.2.3.4)은 IPv4 로 본다.
  const v4 = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1];
  const [head, tail] = v.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => (g || "0").replace(/^0+(?=.)/, "")).join(":")}::/64`;
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
      isKiosk: s.isKiosk === true,
      placeId: s.isKiosk === true && typeof s.placeId === "string" ? s.placeId : null,
      exp: s.exp,
    };
  } catch {
    return null;
  }
}

// DB 의 제약(schema.sql)에는 예전 구조의 값도 남아 있다. 먼저 만들어진 DB 의 옛 기록 때문이다. 지금 쓰는 것은 아래 네 가지다.
export type LogAction = "register" | "cancel" | "login_fail" | "number_fail";

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
 * 시도를 먼저 "틀림"으로 적어 두고, 그 기록까지 세어 한도를 넘었는지 본다. 맞으면 적은 것을 지운다(forgetAttempt).
 * 확인한 뒤에 적으면, 한꺼번에 수백 개를 보낼 때 모두가 "아직 안 틀렸다"를 보고 지나가 잠금이 소용없게 된다.
 */
export async function claimAttempt(
  db: Db,
  device: string,
  failAction: "login_fail" | "number_fail",
  now: Date,
  zoneId?: string,
): Promise<{ id: string; locked: boolean }> {
  const [row] = await db.query<{ id: string }>(
    "insert into access_logs (at, zone_id, device_key, action) values ($1, $2, $3, $4) returning id::text as id",
    [now, zoneId ?? null, device, failAction],
  );
  const since = new Date(now.getTime() - config.lockMinutes * 60_000);
  const [count] = await db.query<{ by_device: number; by_ip: number }>(
    `select count(*) filter (where device_key = $1)::int as by_device, count(*)::int as by_ip
     from access_logs
     where split_part(device_key, ':', 1) = $2 and action = $3 and at > $4`,
    [device, ipPart(device), failAction, since],
  );
  const maxFails = failAction === "number_fail" ? config.numberLockMaxFails : config.lockMaxFails;
  // 방금 적은 것까지 센 수다. 그래서 "넘으면" 잠근다(전에는 적기 전의 수가 "같거나 넘으면" 잠갔다. 같은 기준이다).
  const locked = (count?.by_device ?? 0) > maxFails || (count?.by_ip ?? 0) > config.lockIpMaxFails;
  // 잠긴 동안의 시도는 실패로 남기지 않는다. 남기면 잠금이 끝없이 늘어난다(확인은 하지 않으므로 안전하다).
  if (locked) await forgetAttempt(db, row.id);
  return { id: row.id, locked };
}

/** claimAttempt 로 적어 둔 시도가 맞았거나 여객의 잘못이 아니었으면 지운다. */
export async function forgetAttempt(db: Db, id: string): Promise<void> {
  await db.query("delete from access_logs where id = $1::bigint", [id]);
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
  const maxFails = failAction === "number_fail" ? config.numberLockMaxFails : config.lockMaxFails;
  return (row?.by_device ?? 0) >= maxFails || (row?.by_ip ?? 0) >= config.lockIpMaxFails;
}

export type LoginResult =
  | { ok: true; token: string; session: Session; zoneLabel: string }
  | { ok: false; reason: "locked" | "invalid" };

/**
 * 접속 코드로 들어온다. kiosk 에 자리를 주면 키오스크 설치 코드만, 주지 않으면 직원 코드만 맞춰 본다.
 * 직원 코드로 키오스크를 열거나 설치 코드로 직원 화면을 열 수는 없다.
 */
export async function login(
  db: Db,
  code: string,
  device: string,
  now: Date,
  kiosk: { placeId: string } | null = null,
): Promise<LoginResult> {
  const attempt = await claimAttempt(db, device, "login_fail", now);
  if (attempt.locked) return { ok: false, reason: "locked" };

  const zones = await db.query<{
    id: string;
    label: string;
    code_hash: string;
    is_desk: boolean;
    is_common: boolean;
    is_kiosk: boolean;
  }>("select id, label, code_hash, is_desk, is_common, is_kiosk from zones where active");
  // 일치 여부와 무관하게 모든 구역을 대조해 걸린 시간으로 구역 수를 짐작하지 못하게 한다.
  let matched: (typeof zones)[number] | null = null;
  for (const z of zones) {
    if ((await verifyCodeAsync(code, z.code_hash)) && !matched && z.is_kiosk === (kiosk !== null)) matched = z;
  }
  // 틀렸으면 먼저 적어 둔 "틀림"이 그대로 남는다.
  if (!matched) return { ok: false, reason: "invalid" };
  await forgetAttempt(db, attempt.id);
  const session: Session = {
    zoneId: matched.id,
    isDesk: matched.is_desk,
    canSwitch: matched.is_common,
    needsZone: matched.is_common,
    isKiosk: kiosk !== null,
    placeId: kiosk?.placeId ?? null,
    exp: now.getTime() + (kiosk ? config.kioskSessionDays * 24 : config.sessionHours) * 3_600_000,
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
  if (!session.canSwitch || session.isKiosk) return { ok: false };
  const [zone] = await db.query<{ id: string; label: string }>(
    "select id, label from zones where id = $1 and active and not is_desk and not is_common and not is_kiosk",
    [zoneId],
  );
  if (!zone) return { ok: false };
  const next: Session = { ...session, zoneId: zone.id, needsZone: false };
  return { ok: true, token: signSession(next), session: next, zoneLabel: zone.label };
}
