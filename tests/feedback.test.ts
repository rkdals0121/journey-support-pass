// 2026-10-24 웹개발 피드백과 「공항 이용 도움 체크리스트 (가지뻗기)」를 반영한 동작.
//  피드백 2: 여객이 QR 을 쓰지 않는다. 체크인하면 전자토큰이 탑승권에 저장되고 키오스크·우대출구는 탑승권으로 등록을 찾는다.
//  피드백 3: 안내 키오스크에서 미리 등록한 내용을 고칠 수 있다.
//  체크리스트: 함께 가는 분의 수, 유모차 수, 더 하고 싶은 말씀을 받고 출발 뒤 지운다.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveHandler, updateNeedsHandler } from "@/lib/api/kiosk";
import { checkinHandler, guideHandler, lookupPass, registerHandler } from "@/lib/api/public";
import { exitCheckHandler } from "@/lib/api/staff";
import type { Db } from "@/lib/db";
import type { GuideDto } from "@/lib/guide";
import { getJourney } from "@/lib/journey";
import { boardingPassText, parseBoardingPass } from "@/lib/pass-format";
import { purge } from "@/lib/purge";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, kioskSession, registerWithPass, resetData, sessionOf } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");
const kiosk = kioskSession(now, "cc-108");
const staff = sessionOf(now);
const web = "1.2.3.4:phone";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
}, 400_000);
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 127 })], now);
});

const boardingOf = async (registrationId: string) => (await getJourney(db, registrationId, now))!.boarding;

describe("탑승권으로 등록 찾기 (피드백 2)", () => {
  it("체크인 전에는 탑승권이 없고, 체크인하면 그 편의 탑승권이 생긴다. 다시 해도 같은 탑승권이다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    expect(await boardingOf(registration.id)).toBeNull();
    await checkinHandler(db, { token: pass.token }, web, now);
    const boarding = await boardingOf(registration.id);
    expect(parseBoardingPass(boarding!)).toMatchObject({ flightDate: "2026-10-05", flightNo: "KE123" });
    await checkinHandler(db, { token: pass.token }, web, now);
    expect(await boardingOf(registration.id)).toBe(boarding);
  });

  it("안내 키오스크와 우대출구는 탑승권 바코드로 등록을 연다", async () => {
    const { registration, pass } = await registerWithPass(db, now, { proof: true });
    await checkinHandler(db, { token: pass.token }, web, now);
    const boarding = (await boardingOf(registration.id))!;

    const opened = await resolveHandler(db, kiosk, { scanned: boarding, purpose: "guide" }, "k", now);
    expect(opened.status).toBe(200);
    expect(opened.body.token).toBe(pass.token);

    const exit = await exitCheckHandler(db, staff, { scanned: boarding }, "exit-dev", now);
    expect(exit.status).toBe(200);
    expect((exit.body as { result: { eligible: boolean } }).result.eligible).toBe(true);
  });

  it("체크인하지 않은 등록이나 모르는 탑승권은 등록되지 않은 것으로 본다", async () => {
    const stranger = boardingPassText({ flightDate: "2026-10-05", flightNo: "KE123", ref: "0123456789" });
    expect(await lookupPass(db, stranger, now)).toEqual({ kind: "none" });
    expect((await resolveHandler(db, kiosk, { scanned: stranger }, "k", now)).status).toBe(404);
  });
});

describe("안내 키오스크에서 고치기 (피드백 3)", () => {
  const guideOf = (body: Record<string, unknown>) => body.guide as GuideDto;

  it("고른 항목과 함께 받은 숫자·말씀을 고치고, 고친 안내를 이 자리 기준으로 돌려준다", async () => {
    const { registration, pass } = await registerWithPass(db, now);
    const res = await updateNeedsHandler(
      db,
      kiosk,
      { token: pass.token, choices: ["tr_walk", "mov_wheelchair_need", "bug_ride", "cmp_with", "stf_escort"], party: 3, strollers: 0, note: "엘리베이터를 꼭 타야 해요" },
      "k",
      now,
    );
    expect(res.status).toBe(200);
    const g = guideOf(res.body);
    expect(g.choices).toEqual(["tr_walk", "mov_wheelchair_need", "bug_ride", "cmp_with", "stf_escort"]);
    expect(g.extra).toEqual({ party: 3, strollers: 0, note: "엘리베이터를 꼭 타야 해요" });
    expect(g.place?.id).toBe("cc-108");
    // 휠체어를 빌린다고 했으니 빌리는 곳이 맨 앞이다.
    expect(g.facilities[0]).toMatchObject({ kind: "wheelchair", chosen: true });
    // 항공편은 그대로다.
    expect(g.flight.flightNo).toBe("KE123");

    const [row] = await db.query<{ edit_count: number }>("select edit_count from registrations where id = $1", [registration.id]);
    expect(row.edit_count).toBe(1);
    const logs = await db.query("select 1 from access_logs where action = 'edit' and registration_id = $1", [registration.id]);
    expect(logs).toHaveLength(1);
    // 휴대전화의 등록 현황에도 바로 보인다.
    expect(guideOf((await guideHandler(db, pass.token, null, now)).body).choices).toContain("mov_wheelchair_need");
  });

  it("키오스크만 고칠 수 있고, 맞지 않는 선택과 끝난 등록은 거부한다", async () => {
    const { pass } = await registerWithPass(db, now);
    const body = { token: pass.token, choices: ["tr_none"] };
    expect((await updateNeedsHandler(db, null, body, "k", now)).status).toBe(401);
    expect((await updateNeedsHandler(db, staff, body, "k", now)).status).toBe(403);
    expect((await updateNeedsHandler(db, kiosk, { ...body, choices: ["tr_none", "tr_walk"] }, "k", now)).status).toBe(400);
    expect((await updateNeedsHandler(db, kiosk, { ...body, choices: ["stf_self"] }, "k", now)).status).toBe(400);
    expect((await updateNeedsHandler(db, kiosk, { ...body, token: "AAAAAAAAAAAAAAAA" }, "k", now)).status).toBe(404);
    expect((await updateNeedsHandler(db, kiosk, body, "k", now)).status).toBe(200);
  });
});

describe("함께 가는 분, 유모차, 더 하고 싶은 말씀", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    flightDate: "2026-10-05",
    flightNo: "KE123",
    choices: ["tr_child", "chd_stroller_own", "cmp_with"],
    lang: "ko",
    consent: true,
    startedAt: kst("2026-10-05 11:58").toISOString(),
    ...over,
  });

  it("등록과 함께 받고, 범위를 벗어난 값은 버린다", async () => {
    const res = await registerHandler(db, body({ party: 3, strollers: 1, note: "아이가 소리에 예민해요" }), null, web, now);
    expect(res.status).toBe(200);
    const found = await lookupPass(db, res.body.token as string, now);
    expect(found.kind === "ok" && found.journey.extra).toEqual({ party: 3, strollers: 1, note: "아이가 소리에 예민해요" });

    const odd = await registerHandler(db, body({ party: 0, strollers: "2", note: 7 }), null, "5.6.7.8:phone", now);
    const found2 = await lookupPass(db, odd.body.token as string, now);
    expect(found2.kind === "ok" && found2.journey.extra).toEqual({ party: null, strollers: null, note: "" });
  });

  it("출발 뒤에는 다른 항목과 함께 지운다", async () => {
    const res = await registerHandler(db, body({ party: 2, strollers: 1, note: "엘리베이터를 꼭 타야 해요" }), null, web, now);
    expect(res.status).toBe(200);
    expect((await purge(db, kst("2026-10-05 15:30"))).purged).toBe(1);
    const [row] = await db.query<{ party_size: number | null; stroller_count: number | null; note: string | null }>(
      "select party_size, stroller_count, note from registrations",
    );
    expect(row).toEqual({ party_size: null, stroller_count: null, note: null });
  });
});
