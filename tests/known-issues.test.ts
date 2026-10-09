import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { callHandler } from "@/lib/api/kiosk";
import { lookupPass } from "@/lib/api/public";
import { callsHandler, type CallDto } from "@/lib/api/staff";
import { acceptCall, createCall, getCallAt, listCalls } from "@/lib/calls";
import type { Db } from "@/lib/db";
import { createRegistration } from "@/lib/registrations";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, kioskSession, regInput, registerWithPass, resetData, sessionOf } from "./helpers/fixtures";

// 한 번 틀렸다가 고친 동작이 다시 틀어지지 않는지 보는 검사다.
// 호출에 앞사람의 정보가 남는 것, 받은 호출이 저절로 닫히는 것, 떠난 여객의 정보가 직원 화면에 남는 것,
// 실제 운항 편이 떠난 공동운항 편으로 등록되는 것. 네 가지 모두 여객의 정보가 엉뚱한 곳에 보이거나 쓸모없는 패스가 나오는 문제였다.

const now = kst("2026-10-05 12:00");
const after = (min: number) => new Date(now.getTime() + min * 60_000);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("KE123", "2026-10-05 14:30", { gate: 127 })], now);
});

describe("고친 문제가 되돌아오지 않는다", () => {
  // calls.ts createCall: 예전에는 끝나지 않은 호출에 이미 다른 등록이 붙어 있으면 그대로 두었다.
  it("앞 여객이 부르고 떠난 키오스크에서 다음 여객이 패스를 찍고 부르면, 직원 화면에 다음 여객의 것이 보여야 한다", async () => {
    const kiosk = kioskSession(now, "cc-108");
    const first = await registerWithPass(db, now, { choices: ["mov_wheelchair_own"] });
    const second = await registerWithPass(db, now, { choices: ["gd_voice"] });

    await callHandler(db, kiosk, { token: first.pass.token }, now);
    // 앞 여객은 거두지 않고 자리를 떴다. 5분 뒤 다음 여객이 같은 키오스크에서 부른다.
    await callHandler(db, kiosk, { token: second.pass.token }, after(5));

    const calls = (await callsHandler(db, sessionOf(now, { zoneId: "cc-mid" }), after(5))).body.calls as CallDto[];
    const open = calls.filter((c) => c.state === "waiting");
    expect(open).toHaveLength(1);
    expect(open[0].pass?.choices).toEqual(["소리 안내"]); // 예전에는 앞 여객의 ["휠체어 이용"] 이 나왔다
  });

  // calls.ts closeStale: 예전에는 받았는지 보지 않고 만든 지 30분이 지난 것을 모두 닫았다.
  it("직원이 받아서 돕고 있는 호출은 30분이 지나도 저절로 닫히지 않아야 한다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now);
    await acceptCall(db, call!.id, "cc-mid", after(25));
    await listCalls(db, after(31));
    expect((await getCallAt(db, call!.id, "cc-108"))?.state).toBe("accepted"); // 예전에는 cancelled
  });

  // api/staff.ts callsHandler: 예전에는 getJourney 만 하고 isJourneyOver 를 보지 않았다.
  it("출발한 편의 여객 정보는 삭제 작업이 돌기 전이라도 직원 호출 목록에 나오지 않아야 한다", async () => {
    await addFlights(db, [flightRow("KE001", "2026-10-05 12:20")], now);
    const { registration, pass } = await registerWithPass(db, now, { flightNo: "KE001" });
    const at = kst("2026-10-05 12:40");
    await createCall(db, "cc-108", registration.id, "guide", at);

    const later = kst("2026-10-05 12:55"); // 출발 35분 뒤. 패스는 이미 열리지 않는다.
    expect((await lookupPass(db, pass.token, later)).kind).toBe("ended");
    const calls = (await callsHandler(db, sessionOf(now, { zoneId: "cc-mid" }), later)).body.calls as CallDto[];
    expect(calls[0].pass).toBeNull(); // 예전에는 고른 항목과 항공편이 나왔다
  });

  // registrations.ts createRegistration: 예전에는 여객이 고른 편의 시각·상태만 보고, 공동운항의 실제 운항 편은 보지 않았다.
  it("공동운항의 실제 운항 편이 이미 떠났으면 등록을 받지 않아야 한다", async () => {
    await addFlights(
      db,
      [
        flightRow("OP1", "2026-10-05 14:30", { status: "출발" }),
        flightRow("CS1", "2026-10-05 14:30", { masterNo: "OP1", gate: null }),
      ],
      now,
    );
    const res = await createRegistration(db, regInput({ flightNo: "CS1" }), now);
    expect(res.ok).toBe(false); // 예전에는 받았다. 받자마자 패스가 "사용이 끝난 패스"가 되었다
  });
});
