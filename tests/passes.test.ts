import { describe, expect, it } from "vitest";
import { extractToken, generatePasses, linkPass, reissue, resolvePassNo, resolveToken } from "@/lib/passes";
import { getRegistration } from "@/lib/registrations";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, register, registerWithPass } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");

async function setup() {
  const db = await createTestDb();
  await addFlights(db, [flightRow("KE123", "2026-10-05 14:30")], now);
  return db;
}

describe("패스 생성", () => {
  it("토큰과 패스 번호가 모두 서로 다르다", async () => {
    const db = await setup();
    const passes = await generatePasses(db, 20);
    expect(new Set(passes.map((p) => p.token)).size).toBe(20);
    expect(new Set(passes.map((p) => p.passNo)).size).toBe(20);
    for (const p of passes) {
      expect(p.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(p.passNo).toMatch(/^\d{4}$/);
      expect(p.state).toBe("idle");
    }
  });
});

describe("스캔한 글자에서 토큰 꺼내기", () => {
  const token = "abcDEF_123-xyz4567890123";

  it("주소와 토큰 모두 받는다", () => {
    expect(token).toHaveLength(24);
    expect(extractToken(`https://x.app/p/${token}`)).toBe(token);
    expect(extractToken(`http://localhost:3000/p/${token}/`)).toBe(token);
    expect(extractToken(`  ${token}\n`)).toBe(token);
  });

  it("패스가 아닌 QR 은 null", () => {
    expect(extractToken("https://naver.com")).toBeNull();
    expect(extractToken("https://x.app/p/short")).toBeNull();
    expect(extractToken("")).toBeNull();
  });
});

describe("패스 연결", () => {
  it("연결하면 패스와 등록이 모두 사용 중이 된다", async () => {
    const db = await setup();
    const reg = await register(db, now);
    const [pass] = await generatePasses(db, 1);

    expect(await resolveToken(db, pass.token)).toMatchObject({ kind: "idle" });
    const later = kst("2026-10-05 12:03");
    expect(await linkPass(db, pass.token, reg.id, later)).toEqual({ ok: true, passNo: pass.passNo });

    expect(await resolveToken(db, pass.token)).toMatchObject({ kind: "active", registrationId: reg.id });
    const linked = await getRegistration(db, reg.id);
    expect(linked?.status).toBe("active");
    expect(linked?.linkedAt).toEqual(later);
  });

  it("없는 토큰은 unknown", async () => {
    const db = await setup();
    expect(await resolveToken(db, "x".repeat(24))).toEqual({ kind: "unknown" });
    expect(await resolveToken(db, "짧음")).toEqual({ kind: "unknown" });
  });

  it("사용 중인 패스는 다른 등록에 연결할 수 없다", async () => {
    const db = await setup();
    const { pass } = await registerWithPass(db, now);
    const other = await register(db, now);
    expect(await linkPass(db, pass.token, other.id, now)).toEqual({ ok: false, error: "pass_in_use" });
    expect((await getRegistration(db, other.id))?.status).toBe("pending");
  });

  it("이미 패스가 있는 등록에 또 연결할 수 없다", async () => {
    const db = await setup();
    const { registration } = await registerWithPass(db, now);
    const [extra] = await generatePasses(db, 1);
    expect(await linkPass(db, extra.token, registration.id, now)).toEqual({
      ok: false,
      error: "registration_not_pending",
    });
    expect(await resolveToken(db, extra.token)).toMatchObject({ kind: "idle" });
  });

  it("패스가 아닌 토큰", async () => {
    const db = await setup();
    const reg = await register(db, now);
    expect(await linkPass(db, "y".repeat(24), reg.id, now)).toEqual({ ok: false, error: "not_a_pass" });
  });
});

describe("패스 번호로 찾기", () => {
  it("사용 중인 패스만 찾는다", async () => {
    const db = await setup();
    const { registration, pass } = await registerWithPass(db, now);
    const [idle] = await generatePasses(db, 1);
    expect(await resolvePassNo(db, pass.passNo)).toMatchObject({ kind: "active", registrationId: registration.id });
    expect(await resolvePassNo(db, idle.passNo)).toEqual({ kind: "unknown" });
    expect(await resolvePassNo(db, "12")).toEqual({ kind: "unknown" });
  });
});

describe("재발급", () => {
  it("옛 패스는 쓸 수 없게 되고 새 패스가 같은 등록을 연다", async () => {
    const db = await setup();
    const { registration, pass: oldPass } = await registerWithPass(db, now);
    const [newPass] = await generatePasses(db, 1);

    expect(await reissue(db, registration.id, newPass.token, now)).toEqual({ ok: true, passNo: newPass.passNo });
    expect(await resolveToken(db, oldPass.token)).toEqual({ kind: "unusable" });
    expect(await resolvePassNo(db, oldPass.passNo)).toEqual({ kind: "unknown" });
    expect(await resolveToken(db, newPass.token)).toMatchObject({ kind: "active", registrationId: registration.id });
  });

  it("폐기된 패스는 다시 연결할 수 없다", async () => {
    const db = await setup();
    const { registration, pass: oldPass } = await registerWithPass(db, now);
    const [newPass] = await generatePasses(db, 1);
    await reissue(db, registration.id, newPass.token, now);

    const other = await register(db, now);
    expect(await linkPass(db, oldPass.token, other.id, now)).toEqual({ ok: false, error: "pass_revoked" });
  });

  it("패스가 연결되지 않은 등록은 재발급할 수 없다", async () => {
    const db = await setup();
    const reg = await register(db, now);
    const [pass] = await generatePasses(db, 1);
    expect(await reissue(db, reg.id, pass.token, now)).toEqual({ ok: false, error: "registration_not_active" });
  });

  it("다른 여객이 쓰는 패스로는 재발급할 수 없다", async () => {
    const db = await setup();
    const a = await registerWithPass(db, now);
    const b = await registerWithPass(db, now);
    expect(await reissue(db, a.registration.id, b.pass.token, now)).toEqual({ ok: false, error: "pass_in_use" });
    expect(await resolveToken(db, a.pass.token)).toMatchObject({ kind: "active" });
  });
});
