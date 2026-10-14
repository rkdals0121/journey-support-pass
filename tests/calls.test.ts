import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CALL_ACCEPTED_EXPIRE_MIN,
  CALL_EXPIRE_MIN,
  acceptCall,
  cancelCall,
  createCall,
  endReason,
  finishCall,
  getCallAt,
  listCalls,
} from "@/lib/calls";
import type { Db } from "@/lib/db";
import { eraseRegistration } from "@/lib/purge";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, registerWithPass, resetData } from "./helpers/fixtures";

const t0 = kst("2026-10-05 12:00");
const after = (min: number, sec = 0) => new Date(t0.getTime() + min * 60_000 + sec * 1000);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("KE123", "2026-10-05 18:30", { gate: 127 })], t0);
});

const rowCount = async () => (await db.query("select 1 from calls")).length;

describe("직원 부르기: 만들기", () => {
  it("키오스크 자리에서 부르면 그 자리를 맡은 구역으로 기다리는 호출이 생긴다", async () => {
    const call = await createCall(db, "cc-108", null, "register", t0);
    expect(call).toMatchObject({
      createdAt: t0,
      placeId: "cc-108",
      zoneId: "cc-mid",
      registrationId: null,
      screen: "register",
      acceptedAt: null,
      acceptedZone: null,
      endedAt: null,
      state: "waiting",
    });
    expect((await createCall(db, "t1-info", null, "guide", t0))?.zoneId).toBe("desk-t1");
  });

  it("없는 자리에서는 만들지 않는다", async () => {
    expect(await createCall(db, "nope", null, "guide", t0)).toBeNull();
    expect(await createCall(db, "", null, "guide", t0)).toBeNull();
    expect(await rowCount()).toBe(0);
  });

  it("같은 자리에서 여러 번 눌러도 호출은 하나다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    const b = await createCall(db, "cc-108", null, "guide", after(1));
    const c = await createCall(db, "cc-108", null, "guide", after(2));
    expect(b?.id).toBe(a?.id);
    expect(c?.id).toBe(a?.id);
    // 처음 누른 시각이 남는다. 기다린 시간이 다시 0 이 되지 않는다.
    expect(c?.createdAt).toEqual(t0);
    expect(await rowCount()).toBe(1);
  });

  it("같은 순간에 두 번 눌러도 한 줄만 생긴다", async () => {
    const [a, b] = await Promise.all([
      createCall(db, "cc-108", null, "guide", t0),
      createCall(db, "cc-108", null, "guide", t0),
    ]);
    expect(a?.id).toBe(b?.id);
    expect(await rowCount()).toBe(1);
  });

  it("끝나지 않은 호출이 한 자리에 둘 생기는 것은 DB 가 막는다", async () => {
    await createCall(db, "cc-108", null, "guide", t0);
    const insert = "insert into calls (created_at, place_id, zone_id, screen) values ($1, 'cc-108', 'cc-mid', 'guide')";
    await expect(db.query(insert, [t0])).rejects.toThrow();
  });

  it("자리가 다르면 따로 생긴다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    const b = await createCall(db, "cc-125", null, "guide", t0);
    expect(a?.id).not.toBe(b?.id);
    expect(await rowCount()).toBe(2);
  });

  it("받은 뒤에 다시 눌러도 같은 호출이고 받은 상태가 그대로다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    await acceptCall(db, a!.id, "cc-mid", after(1));
    const again = await createCall(db, "cc-108", null, "guide", after(2));
    expect(again).toMatchObject({ id: a!.id, state: "accepted", acceptedZone: "cc-mid" });
  });

  it("끝난 뒤에 다시 누르면 새 호출이 생긴다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    await finishCall(db, a!.id, "cc-mid", after(3));
    const b = await createCall(db, "cc-108", null, "guide", after(5));
    expect(b?.id).not.toBe(a?.id);
    expect(b).toMatchObject({ state: "waiting", createdAt: after(5) });
    expect(await rowCount()).toBe(2);
  });
});

describe("직원 부르기: 패스 붙이기", () => {
  it("패스를 찍고 부르면 그 등록이 붙는다", async () => {
    const { registration } = await registerWithPass(db, t0);
    const call = await createCall(db, "cc-108", registration.id, "guide", t0);
    expect(call).toMatchObject({ registrationId: registration.id, screen: "guide" });
  });

  it("패스 없이 불렀다가 패스를 찍고 다시 부르면 같은 호출에 그 패스가 붙는다", async () => {
    const { registration } = await registerWithPass(db, t0);
    const first = await createCall(db, "cc-108", null, "register", t0);
    expect(first).toMatchObject({ registrationId: null, screen: "register" });

    // 등록 중에 부르고 패스를 받은 뒤 다시 누른 같은 여객이다. 누른 시각은 처음 누른 때로 둔다.
    const second = await createCall(db, "cc-108", registration.id, "guide", after(1));
    expect(second).toMatchObject({ id: first!.id, registrationId: registration.id, screen: "guide", createdAt: t0 });
    expect(await rowCount()).toBe(1);
  });

  it("패스를 붙인 호출을 패스 없이 다시 누르면 붙은 패스가 떨어진다", async () => {
    // 앞사람이 부르고 떠난 뒤 다음 사람이 누른 것일 수 있다. 직원이 앞사람의 것을 보고 오지 않게 한다.
    const { registration } = await registerWithPass(db, t0);
    const first = await createCall(db, "cc-108", registration.id, "guide", t0);
    const again = await createCall(db, "cc-108", null, "register", after(1));
    expect(again).toMatchObject({ id: first!.id, registrationId: null, screen: "register", createdAt: after(1) });
    expect(await rowCount()).toBe(1);
  });

  it("다른 여객이 패스를 찍고 다시 누르면 지금 누른 여객의 패스로 바뀐다", async () => {
    const a = await registerWithPass(db, t0);
    const b = await registerWithPass(db, t0);
    const first = await createCall(db, "cc-108", a.registration.id, "guide", t0);
    const again = await createCall(db, "cc-108", b.registration.id, "guide", after(5));
    expect(again).toMatchObject({ id: first!.id, registrationId: b.registration.id, createdAt: after(5), state: "waiting" });
    expect(await rowCount()).toBe(1);
  });

  it("다음 여객에게 넘어간 호출은 그 여객이 누른 때부터 30분을 센다", async () => {
    // 앞사람 A 가 12:00 에 부르고 떠났다. 아무도 받지 않았고, 12:27 에 B 가 패스를 찍고 눌렀다.
    const a = await registerWithPass(db, t0);
    const b = await registerWithPass(db, t0);
    const call = await createCall(db, "cc-108", a.registration.id, "guide", t0);
    await createCall(db, "cc-108", b.registration.id, "guide", after(27));
    // 12:31. A 가 누른 지는 30분이 넘었지만 B 가 누른 지는 4분이다.
    expect(await getCallAt(db, call!.id, "cc-108", after(31))).toMatchObject({ state: "waiting", createdAt: after(27) });
    expect((await listCalls(db, after(31)))[0]).toMatchObject({ id: call!.id, state: "waiting" });
    // B 가 누른 지 30분이 넘으면 닫힌다.
    expect((await getCallAt(db, call!.id, "cc-108", after(57, 1)))?.state).toBe("cancelled");
  });

  it("직원이 이미 받은 호출은 다른 사람이 다시 눌러도 처음 부른 여객의 것으로 남는다", async () => {
    const a = await registerWithPass(db, t0);
    const first = await createCall(db, "cc-108", a.registration.id, "guide", t0);
    await acceptCall(db, first!.id, "cc-mid", after(1));
    const again = await createCall(db, "cc-108", null, "register", after(2));
    expect(again).toMatchObject({
      id: first!.id,
      registrationId: a.registration.id,
      screen: "guide",
      state: "accepted",
      acceptedAt: after(1),
      acceptedZone: "cc-mid",
    });
  });

  it("같은 여객이 다시 누르면 아무것도 바뀌지 않는다", async () => {
    const { registration } = await registerWithPass(db, t0);
    await createCall(db, "cc-108", registration.id, "guide", t0);
    const again = await createCall(db, "cc-108", registration.id, "register", after(1));
    expect(again).toMatchObject({ registrationId: registration.id, screen: "guide", createdAt: t0 });
  });

  it("다른 자리의 호출에 붙은 패스는 건드리지 않는다", async () => {
    const { registration } = await registerWithPass(db, t0);
    const other = await createCall(db, "cc-125", registration.id, "guide", t0);
    await createCall(db, "cc-108", null, "register", after(1));
    expect(await getCallAt(db, other!.id, "cc-125")).toMatchObject({ registrationId: registration.id, screen: "guide" });
  });

  it("등록 id 모양이 아닌 값은 붙이지 않는다", async () => {
    const call = await createCall(db, "cc-108", "not-a-uuid", "guide", t0);
    expect(call).toMatchObject({ registrationId: null, state: "waiting" });
  });
});

describe("직원 부르기: 받기와 마치기", () => {
  it("기다림 → 받음 → 마침 순으로 바뀐다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    const id = call!.id;
    expect((await getCallAt(db, id, "cc-108"))?.state).toBe("waiting");

    expect(await acceptCall(db, id, "cc-mid", after(1))).toBe(true);
    expect(await getCallAt(db, id, "cc-108")).toMatchObject({
      state: "accepted",
      acceptedAt: after(1),
      acceptedZone: "cc-mid",
      endedAt: null,
    });

    expect(await finishCall(db, id, "cc-mid", after(6))).toBe(true);
    expect(await getCallAt(db, id, "cc-108")).toMatchObject({
      state: "done",
      acceptedAt: after(1),
      acceptedZone: "cc-mid",
      endedAt: after(6),
    });
  });

  it("먼저 받은 구역만 받는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect(await acceptCall(db, call!.id, "cc-mid", after(1))).toBe(true);
    expect(await acceptCall(db, call!.id, "cc-end", after(2))).toBe(false);
    expect(await acceptCall(db, call!.id, "cc-mid", after(3))).toBe(false);
    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({ acceptedZone: "cc-mid", acceptedAt: after(1) });
  });

  it("같은 순간에 두 구역이 눌러도 한 구역만 받는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    const res = await Promise.all([
      acceptCall(db, call!.id, "cc-mid", after(1)),
      acceptCall(db, call!.id, "cc-end", after(1)),
    ]);
    expect(res.filter(Boolean)).toHaveLength(1);
  });

  it("자리를 맡지 않은 구역도 받을 수 있다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect(await acceptCall(db, call!.id, "cc-end", after(1))).toBe(true);
    // 부른 자리를 맡은 구역은 그대로 남고, 받은 구역만 따로 적힌다.
    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({ zoneId: "cc-mid", acceptedZone: "cc-end" });
  });

  it("받지 않고 바로 마칠 수 있다. 마친 시각에 받은 것으로 적는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect(await finishCall(db, call!.id, "cc-end", after(4))).toBe(true);
    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({
      state: "done",
      acceptedAt: after(4),
      acceptedZone: "cc-end",
      endedAt: after(4),
    });
  });

  it("다른 구역이 마쳐도 받은 구역과 받은 시각은 바뀌지 않는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    await acceptCall(db, call!.id, "cc-mid", after(1));
    expect(await finishCall(db, call!.id, "cc-end", after(5))).toBe(true);
    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({ acceptedZone: "cc-mid", acceptedAt: after(1) });
  });

  it("끝난 호출은 다시 받거나 마칠 수 없다", async () => {
    const done = await createCall(db, "cc-108", null, "guide", t0);
    await finishCall(db, done!.id, "cc-mid", after(1));
    expect(await finishCall(db, done!.id, "cc-mid", after(2))).toBe(false);
    expect(await acceptCall(db, done!.id, "cc-mid", after(2))).toBe(false);

    const cancelled = await createCall(db, "cc-125", null, "guide", t0);
    await cancelCall(db, cancelled!.id, "cc-125", after(1));
    expect(await acceptCall(db, cancelled!.id, "cc-mid", after(2))).toBe(false);
    expect(await finishCall(db, cancelled!.id, "cc-mid", after(2))).toBe(false);
    expect((await getCallAt(db, cancelled!.id, "cc-125"))?.state).toBe("cancelled");
  });

  it("없는 호출과 id 모양이 아닌 값", async () => {
    const missing = "00000000-0000-4000-8000-000000000009";
    expect(await acceptCall(db, missing, "cc-mid", t0)).toBe(false);
    expect(await finishCall(db, missing, "cc-mid", t0)).toBe(false);
    expect(await acceptCall(db, "nope", "cc-mid", t0)).toBe(false);
    expect(await finishCall(db, "nope", "cc-mid", t0)).toBe(false);
  });
});

describe("직원 부르기: 여객이 거두기", () => {
  it("거두면 cancelled 로 끝난다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect(await cancelCall(db, call!.id, "cc-108", after(2))).toBe(true);
    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({ state: "cancelled", endedAt: after(2), acceptedAt: null });
  });

  it("직원이 받은 뒤에도 거둘 수 있다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    await acceptCall(db, call!.id, "cc-mid", after(1));
    expect(await cancelCall(db, call!.id, "cc-108", after(2))).toBe(true);
    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({ state: "cancelled", acceptedZone: "cc-mid" });
  });

  it("두 번 거둘 수 없고, 마친 호출은 거둘 수 없다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    await cancelCall(db, call!.id, "cc-108", after(1));
    expect(await cancelCall(db, call!.id, "cc-108", after(2))).toBe(false);

    const done = await createCall(db, "cc-108", null, "guide", after(3));
    await finishCall(db, done!.id, "cc-mid", after(4));
    expect(await cancelCall(db, done!.id, "cc-108", after(5))).toBe(false);
    expect((await getCallAt(db, done!.id, "cc-108"))?.state).toBe("done");
  });

  it("다른 키오스크의 호출은 거둘 수 없다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect(await cancelCall(db, call!.id, "cc-125", after(1))).toBe(false);
    expect(await cancelCall(db, "nope", "cc-108", after(1))).toBe(false);
    expect((await getCallAt(db, call!.id, "cc-108"))?.state).toBe("waiting");
  });
});

describe("직원 부르기: 키오스크가 자기 호출 보기", () => {
  it("다른 키오스크의 호출은 읽지 못한다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect((await getCallAt(db, call!.id, "cc-108"))?.id).toBe(call!.id);
    expect(await getCallAt(db, call!.id, "cc-125")).toBeNull();
    expect(await getCallAt(db, call!.id, "")).toBeNull();
  });

  it("id 모양이 아닌 값과 없는 id 는 null", async () => {
    expect(await getCallAt(db, "nope", "cc-108")).toBeNull();
    expect(await getCallAt(db, "00000000-0000-4000-8000-000000000009", "cc-108")).toBeNull();
  });
});

describe("직원 부르기: 오래된 호출", () => {
  it(`받지 않은 채 ${CALL_EXPIRE_MIN}분이 넘으면 저절로 닫힌다`, async () => {
    expect(CALL_EXPIRE_MIN).toBe(30);
    const call = await createCall(db, "cc-108", null, "guide", t0);

    // 딱 30분까지는 살아 있다.
    expect((await listCalls(db, after(30))).map((c) => c.state)).toEqual(["waiting"]);

    const list = await listCalls(db, after(30, 1));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: call!.id, state: "cancelled", endedAt: after(30, 1), acceptedAt: null });
    // DB 에는 cancelled 로 남지만, 직원 화면에는 여객이 거둔 것과 나눠 "응답 없이 닫힘"으로 보인다.
    expect(endReason(list[0])).toBe("expired");
  });

  it("끝난 까닭: 여객이 거둔 것, 받은 뒤 거둔 것, 마친 것은 시간이 지나 닫힌 것이 아니다", async () => {
    const withdrawn = await createCall(db, "cc-108", null, "guide", t0);
    await cancelCall(db, withdrawn!.id, "cc-108", after(2));
    const acceptedThenWithdrawn = await createCall(db, "cc-125", null, "guide", t0);
    await acceptCall(db, acceptedThenWithdrawn!.id, "cc-mid", after(1));
    await cancelCall(db, acceptedThenWithdrawn!.id, "cc-125", after(40));
    const done = await createCall(db, "t1-west", null, "guide", t0);
    await finishCall(db, done!.id, "cc-mid", after(45));
    const open = await createCall(db, "t2-west", null, "guide", after(10));
    const reason = async (id: string, place: string) => endReason((await getCallAt(db, id, place))!);
    expect(await reason(withdrawn!.id, "cc-108")).toBe("cancelled");
    expect(await reason(acceptedThenWithdrawn!.id, "cc-125")).toBe("cancelled");
    expect(await reason(done!.id, "t1-west")).toBe("done");
    expect(await reason(open!.id, "t2-west")).toBeNull();
  });

  it("오래된 호출이 남은 자리에서 다시 누르면 앞의 것은 닫히고 새 호출이 생긴다", async () => {
    const old = await createCall(db, "cc-108", null, "guide", t0);
    const fresh = await createCall(db, "cc-108", null, "guide", after(31));
    expect(fresh?.id).not.toBe(old?.id);
    expect(fresh).toMatchObject({ state: "waiting", createdAt: after(31) });
    expect((await getCallAt(db, old!.id, "cc-108"))?.state).toBe("cancelled");
  });

  it("직원 화면이 모두 꺼져 있어도, 키오스크가 상태를 물으면 오래된 호출이 닫힌다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    expect((await getCallAt(db, call!.id, "cc-108", after(30)))?.state).toBe("waiting");
    expect(await getCallAt(db, call!.id, "cc-108", after(30, 1))).toMatchObject({ state: "cancelled", endedAt: after(30, 1) });
  });

  it("다른 자리에서 누를 때도 오래된 호출이 함께 닫힌다", async () => {
    const old = await createCall(db, "cc-108", null, "guide", t0);
    await createCall(db, "cc-125", null, "guide", after(40));
    expect((await getCallAt(db, old!.id, "cc-108"))?.state).toBe("cancelled");
  });

  it("직원이 받은 호출은 만든 지 30분이 넘어도 닫히지 않는다", async () => {
    const call = await createCall(db, "cc-108", null, "guide", t0);
    await acceptCall(db, call!.id, "cc-mid", after(25));
    expect((await listCalls(db, after(31))).map((c) => c.state)).toEqual(["accepted"]);
    // 그 자리에서 다시 눌러도 같은 호출이다.
    expect((await createCall(db, "cc-108", null, "guide", after(60)))?.id).toBe(call!.id);
  });

  it(`받고도 마치지 않은 호출은 받은 지 ${CALL_ACCEPTED_EXPIRE_MIN}분이 넘으면 마친 것으로 닫힌다`, async () => {
    expect(CALL_ACCEPTED_EXPIRE_MIN).toBe(90);
    const call = await createCall(db, "cc-108", null, "guide", t0);
    await acceptCall(db, call!.id, "cc-mid", after(10));

    // 만든 때가 아니라 받은 때부터 센다. 딱 90분까지는 살아 있다.
    expect((await listCalls(db, after(100))).map((c) => c.state)).toEqual(["accepted"]);

    const list = await listCalls(db, after(100, 1));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: call!.id,
      state: "done",
      endedAt: after(100, 1),
      acceptedAt: after(10),
      acceptedZone: "cc-mid",
    });
  });

  it("받은 채 오래된 호출이 남은 자리에서 다시 누르면 앞의 것은 닫히고 새 호출이 생긴다", async () => {
    const old = await createCall(db, "cc-108", null, "guide", t0);
    await acceptCall(db, old!.id, "cc-mid", after(1));
    const fresh = await createCall(db, "cc-108", null, "guide", after(92));
    expect(fresh?.id).not.toBe(old?.id);
    expect(fresh).toMatchObject({ state: "waiting", createdAt: after(92), acceptedAt: null });
    expect((await getCallAt(db, old!.id, "cc-108"))?.state).toBe("done");
  });

  it("이미 끝난 호출의 끝난 시각과 종류는 건드리지 않는다", async () => {
    const done = await createCall(db, "cc-108", null, "guide", t0);
    await finishCall(db, done!.id, "cc-mid", after(2));
    await listCalls(db, after(45));
    expect(await getCallAt(db, done!.id, "cc-108")).toMatchObject({ state: "done", endedAt: after(2) });
  });
});

describe("직원 부르기: 직원 화면의 목록", () => {
  it("끝나지 않은 것을 오래 기다린 순으로 먼저, 끝난 것을 그 뒤에 둔다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    const b = await createCall(db, "cc-125", null, "guide", after(1));
    const c = await createCall(db, "t2-west", null, "guide", after(2));
    const d = await createCall(db, "t1-west", null, "guide", after(3));
    await finishCall(db, a!.id, "cc-mid", after(4)); // 가장 먼저 눌렀지만 끝났다
    await acceptCall(db, c!.id, "t2-wam", after(5)); // 받았지만 끝나지 않았다

    const list = await listCalls(db, after(6));
    expect(list.map((x) => x.id)).toEqual([b!.id, c!.id, d!.id, a!.id]);
    expect(list.map((x) => x.state)).toEqual(["waiting", "accepted", "waiting", "done"]);
  });

  it("끝난 호출도 누른 순으로 둔다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    const b = await createCall(db, "cc-125", null, "guide", after(1));
    await cancelCall(db, b!.id, "cc-125", after(2));
    await finishCall(db, a!.id, "cc-mid", after(3));
    expect((await listCalls(db, after(4))).map((x) => x.id)).toEqual([a!.id, b!.id]);
  });

  it("끝난 지 30분이 지난 호출은 목록에서 빠진다. 줄은 남는다", async () => {
    const a = await createCall(db, "cc-108", null, "guide", t0);
    await finishCall(db, a!.id, "cc-mid", after(5));
    expect(await listCalls(db, after(34, 59))).toHaveLength(1);
    expect(await listCalls(db, after(35))).toHaveLength(0);
    expect(await rowCount()).toBe(1);
  });

  it("호출이 없으면 빈 목록", async () => {
    expect(await listCalls(db, t0)).toEqual([]);
  });
});

describe("직원 부르기: 등록이 지워질 때", () => {
  it("끝나지 않은 호출은 닫히고 등록과의 연결이 끊긴다", async () => {
    const { registration } = await registerWithPass(db, t0);
    const call = await createCall(db, "cc-108", registration.id, "guide", t0);

    await eraseRegistration(db, registration.id, after(10), "revoked");

    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({
      state: "cancelled",
      endedAt: after(10),
      registrationId: null,
      // 어느 키오스크에서 언제 불렀는지는 남는다.
      placeId: "cc-108",
      zoneId: "cc-mid",
      createdAt: t0,
    });
  });

  it("이미 끝난 호출은 끝난 모습 그대로 두고 연결만 끊는다", async () => {
    const { registration } = await registerWithPass(db, t0);
    const call = await createCall(db, "cc-108", registration.id, "guide", t0);
    await acceptCall(db, call!.id, "cc-mid", after(1));
    await finishCall(db, call!.id, "cc-mid", after(4));

    await eraseRegistration(db, registration.id, after(10));

    expect(await getCallAt(db, call!.id, "cc-108")).toMatchObject({
      state: "done",
      endedAt: after(4),
      acceptedZone: "cc-mid",
      registrationId: null,
    });
    expect(await db.query("select 1 from calls where registration_id is not null")).toHaveLength(0);
  });

  it("다른 여객의 호출은 건드리지 않는다", async () => {
    const a = await registerWithPass(db, t0);
    const b = await registerWithPass(db, t0);
    await createCall(db, "cc-108", a.registration.id, "guide", t0);
    const other = await createCall(db, "cc-125", b.registration.id, "guide", t0);

    await eraseRegistration(db, a.registration.id, after(10));

    expect(await getCallAt(db, other!.id, "cc-125")).toMatchObject({ state: "waiting", registrationId: b.registration.id });
  });
});
