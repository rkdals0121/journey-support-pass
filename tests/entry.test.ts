import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assistCancelHandler, assistRequestHandler, assistStatusHandler, entryScanHandler, onsiteRegisterHandler } from "@/lib/api/entry";
import { eraseHandler, guideHandler, registerHandler } from "@/lib/api/public";
import { assistActionHandler, assistListHandler, exitCheckHandler, summaryHandler, type AssistItemDto } from "@/lib/api/staff";
import { deviceKey } from "@/lib/auth";
import type { Db } from "@/lib/db";
import type { Summary } from "@/lib/metrics";
import { boardingPassText, parseBoardingPass } from "@/lib/pass-format";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, deskSession, flightRow, kioskSession, regInput, resetData, sessionOf } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");
const entry = kioskSession(now, "t1-info");
const staff = sessionOf(now);
const other = sessionOf(now, { zoneId: "cc-mid" });
const desk = deskSession(now);
const web = deviceKey("203.0.113.7", "phone");
const BP = boardingPassText({ flightDate: "2026-10-05", flightNo: "KE123", ref: "0123456789" });

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await resetData(db);
  await db.query("delete from assist_requests");
  await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 127 }), flightRow("KE001", "2026-10-05 09:00")], now);
});

const onsite = (over: Record<string, unknown> = {}) =>
  onsiteRegisterHandler(
    db,
    entry,
    { boarding: BP, choices: ["mov_no_stairs", "stf_call"], lang: "ko", consent: true, proof: true, startedAt: kst("2026-10-05 11:59").toISOString(), ...over },
    "kiosk-dev",
    now,
  );

describe("모의 탑승권", () => {
  it("편과 탑승권 번호만 담고, 다시 읽을 수 있다", () => {
    expect(BP).toBe("BP1:20261005:KE123:0123456789");
    expect(parseBoardingPass(BP.toLowerCase())).toEqual({ flightDate: "2026-10-05", flightNo: "KE123", ref: "0123456789" });
    expect(parseBoardingPass("BP1:20261005:KE123:01234")).toBeNull();
    expect(parseBoardingPass("https://x/p/AAAA")).toBeNull();
  });
});

describe("공항 입구 키오스크", () => {
  it("등록하지 않은 탑승권은 그 편을 알려 주고 그 자리에서 등록하게 한다", async () => {
    const res = await entryScanHandler(db, entry, { scanned: BP }, "kiosk-dev", now);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ registered: false, boarding: BP, flight: { flightNo: "KE123", time: "14:30" } });
  });

  it("그 자리에서 등록하면 탑승권에 이어져 체크인한 것으로 되고, 같은 탑승권을 다시 찍으면 고른 도움이 나온다", async () => {
    const reg = await onsite();
    expect(reg.status).toBe(200);
    const g = (reg.body as { guide: { choices: string[]; proofVerified: boolean; checkedIn: boolean } }).guide;
    expect(g).toMatchObject({ choices: ["mov_no_stairs", "stf_call"], proofVerified: true, checkedIn: true });
    const again = await entryScanHandler(db, entry, { scanned: BP }, "kiosk-dev", now);
    expect(again.body).toMatchObject({ registered: true, guide: { choices: ["mov_no_stairs", "stf_call"] } });
    // 두 번 눌러도 등록은 하나다.
    await onsite();
    expect((await db.query("select 1 from registrations")).length).toBe(1);
    // 우대출구에서 같은 탑승권으로 확인된다(증빙 인식 + 탑승권).
    const token = (reg.body as { token: string }).token;
    const exit = await exitCheckHandler(db, staff, { scanned: token }, "d", now);
    expect((exit.body as { result: { eligible: boolean } }).result.eligible).toBe(true);
  });

  it("미리 등록한 여객의 휴대전화 탑승권(QR)을 찍으면 고른 도움을 확인하게 한다", async () => {
    const r = await registerHandler(db, { ...regInput(), startedAt: regInput().startedAt.toISOString(), choices: ["gd_large"] }, null, web, now);
    const token = (r.body as { token: string }).token;
    expect(await entryScanHandler(db, entry, { scanned: token }, "kiosk-dev", now)).toMatchObject({
      status: 200,
      body: { registered: true, token, guide: { choices: ["gd_large"] } },
    });
  });

  it("떠난 편, 없는 편, 읽을 수 없는 것, 키오스크가 아닌 기기는 받지 않는다", async () => {
    const gone = boardingPassText({ flightDate: "2026-10-05", flightNo: "KE001", ref: "0123456789" });
    expect((await entryScanHandler(db, entry, { scanned: gone }, "d", now)).status).toBe(410);
    const none = boardingPassText({ flightDate: "2026-10-05", flightNo: "ZZ999", ref: "0123456789" });
    expect((await entryScanHandler(db, entry, { scanned: none }, "d", now)).status).toBe(404);
    expect((await entryScanHandler(db, entry, { scanned: "영수증" }, "d", now)).status).toBe(404);
    expect((await entryScanHandler(db, null, { scanned: BP }, "d", now)).status).toBe(401);
    expect((await entryScanHandler(db, staff, { scanned: BP }, "d", now)).status).toBe(403);
    expect((await onsite({ consent: false })).status).toBe(400);
  });

  it("지우면 탑승권과의 연결도 끊어 같은 탑승권으로 다시 등록할 수 있다", async () => {
    const token = ((await onsite()).body as { token: string }).token;
    await eraseHandler(db, { token }, web, now);
    expect((await entryScanHandler(db, entry, { scanned: BP }, "d", now)).body).toMatchObject({ registered: false });
  });
});

describe("이동지원 요청", () => {
  const list = async (s = staff) => ((await assistListHandler(db, s, now)).body as { requests: AssistItemDto[] }).requests;

  it("요청은 직원 화면에 바로 뜨고 접수 → 배정 → 이동 중 → 완료로 넘어간다. 여객은 상태를 본다", async () => {
    const token = ((await onsite()).body as { token: string }).token;
    const req = await assistRequestHandler(db, entry, { token }, now);
    expect(req.body).toMatchObject({ request: { state: "received", place: expect.stringContaining("안내데스크") } });
    // 두 번 눌러도 한 건이다.
    await assistRequestHandler(db, entry, { token }, now);
    const [item] = await list();
    expect(await list()).toHaveLength(1);
    expect(item).toMatchObject({ state: "received", pass: { needs: ["계단 어려움", "직원 호출 원함"], proofVerified: true, flight: { flightNo: "KE123" } } });
    expect(JSON.stringify(item)).not.toMatch(/registrationId|token/);

    expect((await assistActionHandler(db, staff, item.id, { action: "assign" }, now)).status).toBe(200);
    // 다른 구역은 이미 받은 요청을 받거나 넘기지 못한다.
    expect((await assistActionHandler(db, other, item.id, { action: "assign" }, now)).status).toBe(409);
    expect((await assistActionHandler(db, other, item.id, { action: "move" }, now)).status).toBe(409);
    expect(((await assistStatusHandler(db, { token }, now)).body as { request: { state: string } }).request.state).toBe("assigned");
    await assistActionHandler(db, staff, item.id, { action: "move" }, now);
    expect((await list())[0]).toMatchObject({ state: "moving", assignedByMe: true });
    // 이동을 시작한 뒤에는 여객이 거둘 수 없다.
    expect((await assistCancelHandler(db, { token }, now)).status).toBe(409);
    await assistActionHandler(db, staff, item.id, { action: "done" }, now);
    expect(((await assistStatusHandler(db, { token }, now)).body as { request: { state: string } }).request.state).toBe("done");
  });

  it("여객이 거둘 수 있고, 휴대전화에서도 청할 수 있다. 직원이 아니면 목록을 볼 수 없다", async () => {
    const r = await registerHandler(db, { ...regInput(), startedAt: regInput().startedAt.toISOString() }, null, web, now);
    const token = (r.body as { token: string }).token;
    expect((await assistRequestHandler(db, null, { token }, now)).body).toMatchObject({ request: { state: "received", place: "" } });
    expect((await list())[0].place).toBe("휴대전화로 요청");
    expect(((await assistCancelHandler(db, { token }, now)).body as { request: { state: string } }).request.state).toBe("cancelled");
    expect((await assistListHandler(db, null, now)).status).toBe(401);
    expect((await assistListHandler(db, entry, now)).status).toBe(401);
    expect((await assistRequestHandler(db, null, { token: "AAAAAAAAAAAAAAAA" }, now)).status).toBe(404);
  });

  it("여객이 지우면 끝나지 않은 요청을 닫고 연결을 끊는다", async () => {
    const token = ((await onsite()).body as { token: string }).token;
    await assistRequestHandler(db, entry, { token }, now);
    await eraseHandler(db, { token }, web, now);
    expect((await list())[0]).toMatchObject({ state: "cancelled", pass: null });
    expect((await guideHandler(db, token, null, now)).status).toBe(410);
  });

  it("오늘 현황에 현장 등록과 이동지원 요청을 센다", async () => {
    const token = ((await onsite()).body as { token: string }).token;
    await assistRequestHandler(db, entry, { token }, now);
    const [item] = await list();
    await assistActionHandler(db, staff, item.id, { action: "assign" }, new Date(now.getTime() + 90_000));
    const s = ((await summaryHandler(db, desk, now)).body as { summary: Summary }).summary;
    expect(s.onsite).toBe(1);
    expect(s.assist).toEqual({ total: 1, done: 0, open: 1, cancelled: 0, medianAssignSec: 90 });
  });
});
