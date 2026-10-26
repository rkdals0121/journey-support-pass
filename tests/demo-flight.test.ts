import { beforeAll, beforeEach, it, expect } from "vitest";
import { prepareDemoFlight, availableDemoFlight } from "@/lib/demo-flight";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import {
  deskSession,
  sessionOf,
  kioskSession,
  addFlights,
  flightRow,
} from "./helpers/fixtures";
import type { Db } from "@/lib/db";
const now = kst("2026-10-26 23:00");
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,calls,assist_requests,events,access_logs,passes,registrations,flights,flight_polls restart identity cascade",
  );
});
it("allows only a valid desk in mock mode and leaves live data untouched", async () => {
  for (const s of [
    null,
    kioskSession(now, "t1-info"),
    sessionOf(now, { exp: now.getTime() }),
  ])
    expect((await prepareDemoFlight(db, s, now, "mock")).status).toBe(401);
  expect(
    (
      await prepareDemoFlight(
        db,
        sessionOf(now, { needsZone: true }),
        now,
        "mock",
      )
    ).status,
  ).toBe(409);
  expect(
    (await prepareDemoFlight(db, sessionOf(now), now, "mock")).status,
  ).toBe(403);
  expect(
    (await prepareDemoFlight(db, deskSession(now), now, "live")).status,
  ).toBe(403);
  expect(await db.query("select flight_no from flights")).toEqual([]);
});
it("adds one explicitly mock flight across Korean midnight without changing existing flights or recording a real poll", async () => {
  await addFlights(db, [flightRow("KE123", "2026-10-27 04:00")], now);
  const before = await db.query(
    "select * from flights where flight_no='KE123'",
  );
  const result = await prepareDemoFlight(db, deskSession(now), now, "mock");
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    reused: false,
    flight: {
      flightDate: "2026-10-27",
      gate: 130,
      departure: kst("2026-10-27 02:00").toISOString(),
    },
  });
  expect((result.body.flight as { flightNo: string }).flightNo).toMatch(
    /^DX\d{4}$/,
  );
  expect(
    await db.query("select * from flights where flight_no='KE123'"),
  ).toEqual(before);
  expect(await db.query("select * from flight_polls")).toEqual([]);
  expect(
    (await db.query("select airline from flights where flight_no<>'KE123'"))[0],
  ).toEqual({ airline: "모의 DX 시연" });
});
it("reuses an available demo flight and does not move its departure time", async () => {
  const first = await prepareDemoFlight(db, deskSession(now), now, "mock"),
    later = new Date(now.getTime() + 30 * 60000);
  const second = await prepareDemoFlight(db, deskSession(later), later, "mock");
  expect(second.body).toEqual({ ...first.body, reused: true });
  expect((await db.query("select flight_no from flights")).length).toBe(1);
  expect(await availableDemoFlight(db, later)).toEqual(first.body.flight);
});
it("creates a fresh flight when the earlier demo is too close to departure while keeping that original row", async () => {
  const first = await prepareDemoFlight(db, deskSession(now), now, "mock"),
    later = new Date(now.getTime() + 150 * 60000);
  const before = await db.query("select * from flights");
  const second = await prepareDemoFlight(db, deskSession(later), later, "mock");
  expect(second.body.reused).toBe(false);
  expect((second.body.flight as { flightNo: string }).flightNo).not.toBe(
    (first.body.flight as { flightNo: string }).flightNo,
  );
  expect(
    await db.query("select * from flights where flight_no=$1", [
      (first.body.flight as { flightNo: string }).flightNo,
    ]),
  ).toEqual(before);
  expect((await db.query("select flight_no from flights")).length).toBe(2);
});
