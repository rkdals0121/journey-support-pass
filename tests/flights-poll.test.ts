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

  it("어제부터 모레까지 출발편만 남긴다 (자정이 지나도 '내일' 편이 비지 않게 모레 편을 미리 받는다)", async () => {
    const db = await createTestDb();
    const fetcher = async () => ({
      rows: [
        raw("KE0", "202610031430"), // 그제
        raw("KE1", "202610041430"), // 어제
        raw("KE2", "202610051430"),
        raw("KE3", "202610060030"),
        raw("KE4", "202610071430"), // 모레
        raw("KE5", "202610081430"), // 글피
        { flightId: "", scheduleDateTime: "202610051430" },
      ],
      pages: 1,
    });
    const res = await runPoll(db, "key", now, fetcher);
    expect(res).toMatchObject({ ok: true, rowCount: 4 });
    const rows = await db.query<{ flight_no: string }>("select flight_no from flights order by flight_no");
    expect(rows.map((r) => r.flight_no)).toEqual(["KE1", "KE2", "KE3", "KE4"]);
    expect(await lastSuccessfulPoll(db)).toEqual(now);
  });

  it("자정을 넘겨 늦어진 어제 편도 계속 고쳐 쓴다 (탑승구와 시각이 멈추지 않는다)", async () => {
    const db = await createTestDb();
    // 어제 23:50 예정 편. 23:07 수집 때는 112번, 제시각이었다.
    await runPoll(db, "key", kst("2026-10-04 23:07"), async () => ({ rows: [raw("KE123", "202610042350")], pages: 1 }));
    // 23:30 에 01:00 으로 늦어지고 115번으로 바뀌었다. 자정 뒤 첫 수집이 이를 받아야 한다.
    const delayed = { ...raw("KE123", "202610042350", "115"), estimatedDateTime: "202610050100" };
    const res = await runPoll(db, "key", kst("2026-10-05 00:07"), async () => ({
      rows: [delayed, raw("KE2", "202610051430")],
      pages: 1,
    }));
    expect(res).toMatchObject({ ok: true, rowCount: 2 });
    const [row] = await db.query<{ gate: number; prev_gate: number; est_at: Date }>(
      "select gate, prev_gate, est_at from flights where flight_date = '2026-10-04' and flight_no = 'KE123'",
    );
    expect(row).toMatchObject({ gate: 115, prev_gate: 112 });
    expect(row.est_at).toEqual(kst("2026-10-05 01:00"));
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
