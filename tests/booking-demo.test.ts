import { beforeAll, beforeEach, expect, it } from "vitest";
import { lookupDemoBooking, prepareBookingFlight } from "@/lib/booking-demo";
import type { BookingHandoff } from "@/lib/booking-model";
import { registerHandler, lookupPass } from "@/lib/api/public";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, CHOICES, flightRow, resetData, kioskSession } from "./helpers/fixtures";
import { seedZones } from "@/lib/zones";
import { POST } from "@/app/api/booking/lookup/route";

const now = kst("2026-10-27 23:55");
const input = { airline: "demo", reference: "DEMO01", surname: "KIM" };
let db: Db;
beforeAll(async () => { db = await createTestDb(); await seedZones(db, () => "x:y"); });
beforeEach(async () => { await resetData(db); });
function handoff() { return lookupDemoBooking(input, now, "mock").body.handoff as BookingHandoff; }
function body(h = handoff()) { return { flightDate: h.flight.flightDate, flightNo: h.flight.flightNo, bookingContext: h.context, choices: CHOICES, consent: true, via: "booking", startedAt: now.toISOString() }; }

it("looks up a normalized fictional itinerary without database writes or passenger identifiers", async () => {
  const result = lookupDemoBooking({ ...input, reference: " demo01 ", surname: " kim " }, now, "mock");
  const h = result.body.handoff as BookingHandoff;
  expect(h.flight).toMatchObject({ flightDate: "2026-10-28", flightNo: "DX9001", time: "18:00", airline: "시연 항공" });
  const decoded = Buffer.from(h.context.split(".")[0], "base64url").toString();
  expect(decoded + JSON.stringify(h)).not.toMatch(/DEMO01|KIM|surname|reference/);
  expect(await db.query("select * from flights")).toEqual([]);
});
it("rejects unsupported airlines, wrong reference/name pairs, cancellation, and live mode", () => {
  expect(lookupDemoBooking({ ...input, airline: "KE" }, now, "mock").status).toBe(400);
  expect(lookupDemoBooking({ ...input, surname: "LEE" }, now, "mock").status).toBe(404);
  expect(lookupDemoBooking({ ...input, reference: "DEMO99" }, now, "mock").status).toBe(404);
  expect(lookupDemoBooking({ ...input, reference: "DEMO02", surname: "LEE" }, now, "mock").body.code).toBe("cancelled");
  expect(lookupDemoBooking(input, now, "live").status).toBe(403);
});
it("rejects tampering, expiry, future-issued context, mismatched flight, and live mode before writes", async () => {
  const h = handoff();
  const bad = "X" + h.context.slice(1);
  for (const [token, date, no, at, mode] of [
    [bad, h.flight.flightDate, "DX9001", now, "mock"],
    [h.context, h.flight.flightDate, "DX9999", now, "mock"],
    [h.context, "2026-10-29", "DX9001", now, "mock"],
    [h.context, h.flight.flightDate, "DX9001", new Date(+now + 30 * 60_000), "mock"],
    [h.context, h.flight.flightDate, "DX9001", new Date(+now - 1), "mock"],
    [h.context, h.flight.flightDate, "DX9001", now, "live"],
  ] as const) expect((await prepareBookingFlight(db, token, date, no, at, mode))?.body.code).toBe("booking_context");
  expect(await db.query("select * from flights")).toEqual([]);
});
it("creates one fixture across concurrent preparations and does not change its schedule", async () => {
  const h = handoff();
  expect(await Promise.all(Array.from({ length: 4 }, () => prepareBookingFlight(db, h.context, h.flight.flightDate, h.flight.flightNo, now, "mock")))).toEqual([null, null, null, null]);
  const flights = await db.query<{ sched_at: Date }>("select sched_at from flights");
  expect(flights).toHaveLength(1);
  expect(new Date(flights[0].sched_at)).toEqual(kst("2026-10-28 18:00"));
});
it("leaves a conflicting existing flight unchanged", async () => {
  await addFlights(db, [flightRow("DX9001", "2026-10-28 18:00")], now);
  const before = await db.query("select * from flights");
  const h = handoff();
  expect((await prepareBookingFlight(db, h.context, h.flight.flightDate, h.flight.flightNo, now, "mock"))?.status).toBe(409);
  expect(await db.query("select * from flights")).toEqual(before);
});
it("completes booking lookup → support registration → usable pass without storing reservation identifiers", async () => {
  const result = await registerHandler(db, body(), null, "booking-test", now);
  expect(result.status).toBe(200);
  expect(typeof result.body.token).toBe("string");
  expect((await lookupPass(db, result.body.token as string, now)).kind).toBe("ok");
  const rows = await db.query("select * from registrations");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ flight_no: "DX9001", via: "booking", is_mock: true });
  expect(JSON.stringify(rows)).not.toMatch(/DEMO01|KIM|bookingContext/);
});
it("requires consent and valid choices before provisioning", async () => {
  expect((await registerHandler(db, { ...body(), consent: false }, null, "bad-consent", now)).status).toBe(400);
  expect((await registerHandler(db, { ...body(), choices: ["invalid"] }, null, "bad-choice", now)).status).toBe(400);
  expect(await db.query("select * from flights")).toEqual([]);
  expect(await db.query("select * from access_logs where action='register'")).toEqual([]);
});
it("lets on-site kiosk registration use the booking lookup too", async () => {
  const res = await registerHandler(db, body(), kioskSession(now, "cc-108"), "kiosk", now);
  expect(res.status).toBe(200);
  const rows = await db.query<{ flight_no: string; route: string }>("select flight_no, route from registrations");
  expect(rows).toEqual([expect.objectContaining({ flight_no: "DX9001", route: "kiosk" })]);
});
it("bounds lookup request bodies and returns non-cacheable errors", async () => {
  for (const value of ["not json", "[]", "null"]) {
    const result = await POST(new Request("http://localhost/api/booking/lookup", { method: "POST", body: value }));
    expect(result.status).toBe(400); expect(result.headers.get("cache-control")).toBe("no-store");
  }
  const huge = await POST(new Request("http://localhost/api/booking/lookup", { method: "POST", body: "x".repeat(2049) }));
  expect(huge.status).toBe(413);
  const valid = await POST(new Request("http://localhost/api/booking/lookup", { method: "POST", body: JSON.stringify(input) }));
  expect(valid.status).toBe(200);
  expect(valid.headers.get("cache-control")).toBe("no-store");
});
