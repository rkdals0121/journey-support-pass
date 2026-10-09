import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import {
  PASS_NO_LENGTH,
  TOKEN_LENGTH,
  activePassOf,
  cleanPassNo,
  extractToken,
  formatPassNo,
  issuePass,
  passUrl,
  resolvePassNo,
  resolveToken,
} from "@/lib/passes";
import { eraseRegistration } from "@/lib/purge";
import { getRegistration } from "@/lib/registrations";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, register, registerWithPass, resetData } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");
const TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
// 모양만 맞는 값. 어떤 패스의 것도 아니다.
const TOKEN = "7K2M9QXW4HT8VB3N";

describe("스캔한 글자에서 QR 값 꺼내기", () => {
  it("대문자 주소, 소문자 주소, 값만 있는 글자를 모두 받는다", () => {
    expect(TOKEN).toMatch(TOKEN_RE);
    expect(extractToken(`HTTPS://X.APP/P/${TOKEN}`)).toBe(TOKEN);
    expect(extractToken(`https://x.app/p/${TOKEN.toLowerCase()}`)).toBe(TOKEN);
    expect(extractToken(`http://localhost:3000/p/${TOKEN}`)).toBe(TOKEN);
    expect(extractToken(TOKEN)).toBe(TOKEN);
    expect(extractToken(TOKEN.toLowerCase())).toBe(TOKEN);
  });

  it("앞뒤 공백, 끝의 빗금, 주소 뒤에 붙은 값이 있어도 꺼낸다", () => {
    expect(extractToken(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(extractToken(`https://x.app/p/${TOKEN}/`)).toBe(TOKEN);
    expect(extractToken(`https://x.app/p/${TOKEN}?from=sticker`)).toBe(TOKEN);
    expect(extractToken(`https://x.app/p/${TOKEN}/#top`)).toBe(TOKEN);
    expect(extractToken(`/p/${TOKEN}`)).toBe(TOKEN);
  });

  it("패스가 아닌 QR 은 null", () => {
    expect(extractToken("https://naver.com")).toBeNull();
    expect(extractToken("https://x.app/p/short")).toBeNull();
    expect(extractToken(`https://x.app/q/${TOKEN}`)).toBeNull();
    expect(extractToken(`https://x.app/p/${TOKEN}/print`)).toBeNull();
    expect(extractToken("")).toBeNull();
    expect(extractToken("   ")).toBeNull();
    expect(extractToken(null as never)).toBeNull();
    expect(extractToken(undefined as never)).toBeNull();
  });

  it("길이가 다르거나 쓰지 않는 글자(I, L, O, U)가 든 값은 받지 않는다", () => {
    expect(extractToken(TOKEN.slice(1))).toBeNull();
    expect(extractToken(`${TOKEN}0`)).toBeNull();
    for (const bad of ["I", "L", "O", "U", "-", "_"]) {
      const t = `${bad}${TOKEN.slice(1)}`;
      expect(extractToken(t), bad).toBeNull();
      expect(extractToken(`https://x.app/p/${t}`), bad).toBeNull();
    }
    // 예전 구조의 24자 값.
    expect(extractToken("abcDEF_123-xyz4567890123")).toBeNull();
  });
});

describe("QR 주소", () => {
  it("전부 대문자로 만든다", () => {
    expect(passUrl("https://journey.example.kr", TOKEN)).toBe(`HTTPS://JOURNEY.EXAMPLE.KR/P/${TOKEN}`);
    expect(passUrl("http://localhost:3000", TOKEN)).toBe(`HTTP://LOCALHOST:3000/P/${TOKEN}`);
  });

  it("주소 끝의 빗금은 겹치지 않게 뗀다", () => {
    expect(passUrl("https://x.app/", TOKEN)).toBe(`HTTPS://X.APP/P/${TOKEN}`);
    expect(passUrl("https://x.app///", TOKEN)).toBe(`HTTPS://X.APP/P/${TOKEN}`);
  });

  it("QR 에 쓸 수 있는 글자(숫자, 대문자, : / . -)만 들어 있다", () => {
    expect(passUrl("https://journey-support-pass.vercel.app", TOKEN)).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
  });

  it("만든 주소에서 다시 같은 값이 나온다", () => {
    expect(extractToken(passUrl("https://x.app", TOKEN))).toBe(TOKEN);
    expect(extractToken(passUrl("http://localhost:3000/", TOKEN).toLowerCase())).toBe(TOKEN);
  });
});

describe("패스 번호 모양", () => {
  it("숫자만 남겨 여섯 자리면 받는다", () => {
    expect(PASS_NO_LENGTH).toBe(6);
    expect(cleanPassNo("123456")).toBe("123456");
    expect(cleanPassNo("123 456")).toBe("123456");
    expect(cleanPassNo(" 123-456 ")).toBe("123456");
    expect(cleanPassNo("000001")).toBe("000001");
  });

  it("여섯 자리가 아니거나 글자가 아니면 null", () => {
    expect(cleanPassNo("12345")).toBeNull();
    expect(cleanPassNo("1234567")).toBeNull();
    expect(cleanPassNo("")).toBeNull();
    expect(cleanPassNo("abcdef")).toBeNull();
    expect(cleanPassNo(123456)).toBeNull();
    expect(cleanPassNo(null)).toBeNull();
    expect(cleanPassNo(undefined)).toBeNull();
    expect(cleanPassNo(["123456"])).toBeNull();
  });

  it("화면에는 세 자리씩 띄워 보여준다. 띄운 모양을 다시 넣어도 같은 번호다", () => {
    expect(formatPassNo("123456")).toBe("123 456");
    expect(formatPassNo("000001")).toBe("000 001");
    expect(cleanPassNo(formatPassNo("042917"))).toBe("042917");
    // 여섯 자리가 아니면 손대지 않는다.
    expect(formatPassNo("1234")).toBe("1234");
    expect(formatPassNo("")).toBe("");
  });
});

describe("패스 만들기와 찾기", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  beforeEach(async () => {
    await resetData(db);
    await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], now);
  });

  const passRows = () =>
    db.query<{ token: string; pass_no: string; registration_id: string | null; state: string; linked_at: Date | null }>(
      "select token, pass_no, registration_id, state, linked_at from passes",
    );

  it("등록의 패스를 만들면 QR 값 16자와 번호 여섯 자리가 나오고, 패스와 등록이 모두 사용 중이 된다", async () => {
    const reg = await register(db, now);
    expect(reg.status).toBe("pending");
    const later = kst("2026-10-05 12:03");
    const res = await issuePass(db, reg.id, later);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(TOKEN_LENGTH).toBe(16);
    expect(res.token).toMatch(TOKEN_RE);
    expect(res.passNo).toMatch(/^\d{6}$/);
    expect(Object.keys(res).sort()).toEqual(["ok", "passNo", "token"]);

    expect(await passRows()).toEqual([
      { token: res.token, pass_no: res.passNo, registration_id: reg.id, state: "active", linked_at: later },
    ]);
    expect((await getRegistration(db, reg.id))?.status).toBe("active");
    const [row] = await db.query<{ linked_at: Date }>("select linked_at from registrations where id = $1", [reg.id]);
    expect(row.linked_at).toEqual(later);
  });

  it("한 등록에 패스는 한 장뿐이다. 다시 만들려 하면 거부하고 처음 패스가 그대로 남는다", async () => {
    const reg = await register(db, now);
    const first = await issuePass(db, reg.id, now);
    expect(await issuePass(db, reg.id, now)).toEqual({ ok: false });
    expect(await passRows()).toHaveLength(1);
    expect(await activePassOf(db, reg.id)).toEqual(first.ok ? { passNo: first.passNo, token: first.token } : null);
  });

  it("같은 순간에 두 번 만들려 해도 한 장만 생긴다", async () => {
    const reg = await register(db, now);
    const res = await Promise.all([issuePass(db, reg.id, now), issuePass(db, reg.id, now)]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(await passRows()).toHaveLength(1);
  });

  it("한 등록에 사용 중인 패스가 둘 생기는 것은 DB 가 막는다", async () => {
    const { registration } = await registerWithPass(db, now);
    await expect(
      db.query("insert into passes (token, pass_no, registration_id, state) values ($1, '999999', $2, 'active')", [
        TOKEN,
        registration.id,
      ]),
    ).rejects.toThrow();
  });

  it("없는 등록, id 모양이 아닌 값, 끝난 등록에는 만들지 않는다", async () => {
    expect(await issuePass(db, "00000000-0000-4000-8000-000000000009", now)).toEqual({ ok: false });
    expect(await issuePass(db, "not-a-uuid", now)).toEqual({ ok: false });

    const { registration } = await registerWithPass(db, now);
    await eraseRegistration(db, registration.id, now, "revoked");
    expect(await issuePass(db, registration.id, now)).toEqual({ ok: false });
    expect(await db.query("select 1 from passes where state = 'active'")).toHaveLength(0);
  });

  it("여러 장을 만들어도 QR 값과 번호가 서로 겹치지 않는다", async () => {
    const made = [];
    for (let i = 0; i < 20; i++) made.push((await registerWithPass(db, now)).pass);
    expect(new Set(made.map((p) => p.token)).size).toBe(20);
    expect(new Set(made.map((p) => p.passNo)).size).toBe(20);
    for (const p of made) {
      expect(p.token).toMatch(TOKEN_RE);
      expect(p.passNo).toMatch(/^\d{6}$/);
    }
  });

  it("등록의 패스를 찾는다. 패스가 없거나 끝났으면 null", async () => {
    const pending = await register(db, now);
    expect(await activePassOf(db, pending.id)).toBeNull();
    expect(await activePassOf(db, "not-a-uuid")).toBeNull();

    const { registration, pass } = await registerWithPass(db, now);
    expect(await activePassOf(db, registration.id)).toEqual(pass);
    await eraseRegistration(db, registration.id, now);
    expect(await activePassOf(db, registration.id)).toBeNull();
  });

  it("QR 값으로 찾는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    const found = await resolveToken(db, pass.token);
    expect(found).toMatchObject({
      kind: "active",
      registrationId: registration.id,
      pass: { token: pass.token, passNo: pass.passNo, registrationId: registration.id, state: "active" },
    });
  });

  it("없는 값과 모양이 다른 값은 unknown", async () => {
    await registerWithPass(db, now);
    expect(await resolveToken(db, TOKEN)).toEqual({ kind: "unknown" });
    expect(await resolveToken(db, "짧음")).toEqual({ kind: "unknown" });
    expect(await resolveToken(db, "")).toEqual({ kind: "unknown" });
    expect(await resolveToken(db, "x".repeat(24))).toEqual({ kind: "unknown" });
  });

  it("소문자로 바뀐 값은 extractToken 을 거쳐야 찾는다", async () => {
    const { pass } = await registerWithPass(db, now);
    const lower = pass.token.toLowerCase();
    // 값에 글자가 하나도 없으면(숫자뿐이면) 소문자로 바꿔도 같은 값이다.
    if (lower !== pass.token) expect(await resolveToken(db, lower)).toEqual({ kind: "unknown" });
    expect(await resolveToken(db, extractToken(lower)!)).toMatchObject({ kind: "active" });
  });

  it("끝난 패스는 unusable. 여객이 지운 것도, 출발해서 지워진 것도 같다", async () => {
    const a = await registerWithPass(db, now);
    const b = await registerWithPass(db, now);
    await eraseRegistration(db, a.registration.id, now, "revoked");
    await eraseRegistration(db, b.registration.id, now, "expired");
    expect(await resolveToken(db, a.pass.token)).toEqual({ kind: "unusable" });
    expect(await resolveToken(db, b.pass.token)).toEqual({ kind: "unusable" });
    const rows = await db.query<{ state: string }>("select state from passes order by state");
    expect(rows.map((r) => r.state)).toEqual(["expired", "revoked"]);
  });

  it("패스는 살아 있는데 등록이 사용 중이 아니면 unusable", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    await db.query("update registrations set status = 'expired' where id = $1", [registration.id]);
    expect(await resolveToken(db, pass.token)).toEqual({ kind: "unusable" });
    expect(await resolvePassNo(db, pass.passNo)).toEqual({ kind: "unknown" });
  });

  it("번호로는 사용 중인 패스만 찾는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    expect(await resolvePassNo(db, pass.passNo)).toMatchObject({ kind: "active", registrationId: registration.id });
    expect(await resolvePassNo(db, "12")).toEqual({ kind: "unknown" });
    expect(await resolvePassNo(db, formatPassNo(pass.passNo))).toEqual({ kind: "unknown" }); // 띄운 모양은 cleanPassNo 를 거쳐야 한다
    expect(await resolvePassNo(db, cleanPassNo(formatPassNo(pass.passNo))!)).toMatchObject({ kind: "active" });
  });

  it("끝난 패스의 번호는 있었는지조차 알려 주지 않는다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    await eraseRegistration(db, registration.id, now, "revoked");
    expect(await resolvePassNo(db, pass.passNo)).toEqual({ kind: "unknown" });
  });

  it("끝난 패스의 번호는 새 패스가 다시 쓸 수 있다. 살아 있는 패스의 번호는 못 쓴다", async () => {
    const ended = await registerWithPass(db, now);
    const live = await registerWithPass(db, now);
    await eraseRegistration(db, ended.registration.id, now);

    const next = await register(db, now);
    const insert = "insert into passes (token, pass_no, registration_id, state) values ($1, $2, $3, 'active')";
    await expect(db.query(insert, [TOKEN, live.pass.passNo, next.id])).rejects.toThrow();
    await expect(db.query(insert, [TOKEN, ended.pass.passNo, next.id])).resolves.toBeDefined();
    // 같은 번호의 끝난 패스가 있어도 번호로는 새 패스만 찾는다.
    await db.query("update registrations set status = 'active' where id = $1", [next.id]);
    expect(await resolvePassNo(db, ended.pass.passNo)).toMatchObject({ kind: "active", registrationId: next.id });
  });
});
