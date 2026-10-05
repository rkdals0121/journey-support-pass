import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { ingestFlights, lastSuccessfulPoll, recordPoll } from "@/lib/flights/ingest";
import type { FlightRow } from "@/lib/flights/normalize";
import { createTestDb, kst } from "./helpers/db";

const row = (flightNo: string, gate: number | null, over: Partial<FlightRow> = {}): FlightRow => ({
  flightDate: "2026-10-05",
  flightNo,
  masterNo: "",
  airline: "대한항공",
  destCode: "JFK",
  destName: "뉴욕",
  terminal: "CONCOURSE",
  gate,
  schedAt: kst("2026-10-05 14:30"),
  estAt: null,
  status: "",
  ...over,
});

interface GateState {
  gate: number | null;
  prev_gate: number | null;
  gate_changed_at: Date | null;
  updated_at: Date;
}

const gateOf = async (db: Db, flightNo: string) =>
  (
    await db.query<GateState>(
      "select gate, prev_gate, gate_changed_at, updated_at from flights where flight_no = $1",
      [flightNo],
    )
  )[0];

describe("운항 적재", () => {
  it("새 편을 넣는다", async () => {
    const db = await createTestDb();
    const res = await ingestFlights(db, [row("KE1", 112), row("KE2", 113), row("KE3", null)], kst("2026-10-05 12:00"));
    expect(res).toEqual({ upserted: 3, gateChanges: 0 });
    expect(await db.query("select 1 from flights")).toHaveLength(3);
  });

  it("탑승구가 바뀌면 이전 값과 시각을 남긴다", async () => {
    const db = await createTestDb();
    await ingestFlights(db, [row("KE1", 112)], kst("2026-10-05 12:00"));
    const res = await ingestFlights(db, [row("KE1", 118)], kst("2026-10-05 12:05"));
    expect(res.gateChanges).toBe(1);
    const f = await gateOf(db, "KE1");
    expect(f.gate).toBe(118);
    expect(f.prev_gate).toBe(112);
    expect(f.gate_changed_at).toEqual(kst("2026-10-05 12:05"));
    expect(f.updated_at).toEqual(kst("2026-10-05 12:05"));
  });

  it("미정에서 배정된 것은 변경으로 세지 않는다", async () => {
    const db = await createTestDb();
    await ingestFlights(db, [row("KE1", null)], kst("2026-10-05 12:00"));
    const res = await ingestFlights(db, [row("KE1", 112)], kst("2026-10-05 12:05"));
    expect(res.gateChanges).toBe(0);
    const f = await gateOf(db, "KE1");
    expect(f.gate).toBe(112);
    expect(f.prev_gate).toBeNull();
    expect(f.gate_changed_at).toBeNull();
  });

  it("같은 탑승구로 다시 받아도 변경 기록은 그대로다", async () => {
    const db = await createTestDb();
    await ingestFlights(db, [row("KE1", 112)], kst("2026-10-05 12:00"));
    await ingestFlights(db, [row("KE1", 118)], kst("2026-10-05 12:05"));
    const res = await ingestFlights(db, [row("KE1", 118)], kst("2026-10-05 12:10"));
    expect(res.gateChanges).toBe(0);
    const f = await gateOf(db, "KE1");
    expect(f.prev_gate).toBe(112);
    expect(f.gate_changed_at).toEqual(kst("2026-10-05 12:05"));
  });

  it("응답에서 탑승구가 잠깐 비어도 알던 값을 지우지 않는다", async () => {
    const db = await createTestDb();
    await ingestFlights(db, [row("KE1", 112)], kst("2026-10-05 12:00"));
    await ingestFlights(db, [row("KE1", null)], kst("2026-10-05 12:05"));
    expect((await gateOf(db, "KE1")).gate).toBe(112);
  });

  it("시각과 상태를 덮어쓴다", async () => {
    const db = await createTestDb();
    await ingestFlights(db, [row("KE1", 112)], kst("2026-10-05 12:00"));
    await ingestFlights(
      db,
      [row("KE1", 112, { estAt: kst("2026-10-05 15:10"), status: "지연" })],
      kst("2026-10-05 12:05"),
    );
    const [f] = await db.query<{ est_at: Date; status: string }>("select est_at, status from flights");
    expect(f.est_at).toEqual(kst("2026-10-05 15:10"));
    expect(f.status).toBe("지연");
  });

  it("같은 편이 한 번에 두 번 들어와도 오류가 없다", async () => {
    const db = await createTestDb();
    const res = await ingestFlights(db, [row("KE1", 112), row("KE1", 112)], kst("2026-10-05 12:00"));
    expect(res.upserted).toBe(1);
  });
});

describe("수집 기록", () => {
  it("마지막 성공 시각을 돌려준다", async () => {
    const db = await createTestDb();
    expect(await lastSuccessfulPoll(db)).toBeNull();
    await recordPoll(db, { at: kst("2026-10-05 12:00"), ok: true, rowCount: 1200, durationMs: 900, gateChanges: 0 });
    await recordPoll(db, {
      at: kst("2026-10-05 12:05"),
      ok: false,
      rowCount: 0,
      durationMs: 60000,
      gateChanges: 0,
      error: "timeout",
    });
    expect(await lastSuccessfulPoll(db)).toEqual(kst("2026-10-05 12:00"));
  });
});
