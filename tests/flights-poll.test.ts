import { describe, expect, it } from "vitest";
import { lastSuccessfulPoll } from "@/lib/flights/ingest";
import { runPoll } from "@/lib/flights/poll";
import { isCronAuthorized } from "@/lib/cron";
import { createTestDb, kst } from "./helpers/db";

const raw = (flightId: string, sched: string, gate = "112") => ({
  flightId,
  scheduleDateTime: sched,
  gatenumber: gate,
  terminalid: "P02",
  airline: "대한항공",
  airportCode: "JFK",
  airport: "뉴욕",
});

describe("수집 한 회", () => {
  const now = kst("2026-10-05 12:00");

  it("오늘과 내일 출발편만 남긴다", async () => {
    const db = await createTestDb();
    const fetcher = async () => ({
      rows: [
        raw("KE1", "202610041430"), // 어제
        raw("KE2", "202610051430"),
        raw("KE3", "202610060030"),
        raw("KE4", "202610071430"), // 모레
        { flightId: "", scheduleDateTime: "202610051430" },
      ],
      pages: 1,
    });
    const res = await runPoll(db, "key", now, fetcher);
    expect(res).toMatchObject({ ok: true, rowCount: 2 });
    const rows = await db.query<{ flight_no: string }>("select flight_no from flights order by flight_no");
    expect(rows.map((r) => r.flight_no)).toEqual(["KE2", "KE3"]);
    expect(await lastSuccessfulPoll(db)).toEqual(now);
  });

  it("호출이 실패하면 실패로 기록하고 기존 운항 정보는 그대로 둔다", async () => {
    const db = await createTestDb();
    await runPoll(db, "key", now, async () => ({ rows: [raw("KE2", "202610051430")], pages: 1 }));
    const later = kst("2026-10-05 12:05");
    const res = await runPoll(db, "key", later, async () => {
      throw new Error("timeout");
    });
    expect(res).toMatchObject({ ok: false, error: "timeout" });
    expect(await db.query("select 1 from flights")).toHaveLength(1);
    expect(await lastSuccessfulPoll(db)).toEqual(now);
    const [log] = await db.query<{ error: string }>("select error from flight_polls where not ok");
    expect(log.error).toBe("timeout");
  });

  it("0건 응답은 실패로 본다", async () => {
    const db = await createTestDb();
    const res = await runPoll(db, "key", now, async () => ({ rows: [], pages: 1 }));
    expect(res.ok).toBe(false);
  });
});

describe("예약 실행 인증", () => {
  const req = (auth?: string) =>
    new Request("http://localhost/api/cron/poll-flights", { headers: auth ? { authorization: auth } : {} });

  it("Bearer 값이 맞아야 통과한다", () => {
    expect(isCronAuthorized(req("Bearer dev-only-secret-change-me"))).toBe(true);
    expect(isCronAuthorized(req("Bearer wrong"))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });
});
