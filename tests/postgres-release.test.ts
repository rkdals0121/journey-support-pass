import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { openPg, migrate, type Db } from "@/lib/db";
import { seedZones } from "@/lib/zones";
import { bookVisit } from "@/lib/support-visits";
import { eraseRegistration } from "@/lib/purge";
import { registerWithPass, addFlights, flightRow } from "./helpers/fixtures";
import { kst } from "./helpers/db";
import type { VisitView } from "@/lib/service-hubs";
const url = process.env.JSP_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/jsp_release_checks"
  )
    throw Error("PostgreSQL gate requires a dedicated local test database");
}
let db: Db;
const now = kst("2026-10-28 09:15"),
  receipt = (n: number) => n.toString(16).padStart(64, "0");
function slowReads(): Db {
  return {
    ...db,
    transaction: (work) =>
      db.transaction!(async (tx) =>
        work({
          ...tx,
          query: async <T>(sql: string, args: unknown[] = []) => {
            const rows = await tx.query<T>(sql, args);
            if (
              sql.includes("receipt_hash=$1") ||
              sql.includes(
                "count(*)::int as n from support_visits where device_key",
              )
            )
              await delay(150);
            return rows;
          },
        }),
      ),
  };
}
const book = (
  n: number,
  hubId: string,
  device: string,
  at = "09:30",
  database = db,
) =>
  bookVisit(
    database,
    {
      receipt: receipt(n),
      consent: true,
      hubId,
      service: "robot",
      task: "directions",
      party: 1,
      startAt: kst("2026-10-28 " + at).toISOString(),
    },
    device,
    now,
  );
describe.skipIf(!url)("real PostgreSQL release gate", () => {
  beforeAll(async () => {
    db = await openPg(url!);
    await migrate(db);
    await seedZones(db, () => "ci-only-hash");
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      "truncate support_visits,support_hub_rules,support_crew,service_requests,service_request_limits,dispatch_resources,registrations,passes,flights restart identity cascade",
    );
  });
  afterAll(async () => {
    await db?.close?.();
  });
  it("returns one persisted booking for the same attempt sent concurrently to different hubs", async () => {
    const slow = slowReads();
    const results = await Promise.all([
      book(1, "concourse", "one", "09:30", slow),
      book(1, "t2-airside", "two", "09:30", slow),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((results[0].body.visit as VisitView).id).toBe(
      (results[1].body.visit as VisitView).id,
    );
    expect(await db.query("select id from support_visits")).toHaveLength(1);
  }, 15000);
  it("enforces the device quota across concurrently booked hubs", async () => {
    const hubs = [
        "t1-departure",
        "t1-care",
        "t1-airside",
        "concourse",
        "t2-departure",
        "t2-airside",
      ],
      slow = slowReads();
    const results = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        book(
          i + 1,
          hubs[i % hubs.length],
          "same-browser",
          i < 6 ? "09:30" : "10:00",
          slow,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(1);
    expect(await db.query("select id from support_visits")).toHaveLength(10);
  }, 15000);
  it("allows only one winner for the last slot", async () => {
    const results = await Promise.all([
      book(1, "concourse", "one"),
      book(2, "concourse", "two"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.query("select id from support_visits")).toHaveLength(1);
  });
  it("rolls back an interrupted privacy erasure rather than leaving a revoked pass with retained details", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-28 12:00")], now);
    const { registration, pass } = await registerWithPass(db, now, {
      flightDate: "2026-10-28",
      flightNo: "KE123",
    });
    const brokenQuery = async <T>(
      connection: Db,
      sql: string,
      args: unknown[] = [],
    ) => {
      if (sql.startsWith("update registrations set name"))
        throw Error("injected erasure interruption");
      return connection.query<T>(sql, args);
    };
    const broken: Db = {
      ...db,
      query: (sql, args) => brokenQuery(db, sql, args),
      transaction: (work) =>
        db.transaction!((tx) =>
          work({ ...tx, query: (sql, args) => brokenQuery(tx, sql, args) }),
        ),
    };
    await expect(
      eraseRegistration(broken, registration.id, now, "revoked"),
    ).rejects.toThrow("injected erasure interruption");
    const [saved] = await db.query<{ state: string; registration_id: string }>(
      "select state,registration_id from passes where token_hash is not null and registration_id=$1",
      [registration.id],
    );
    expect(saved).toMatchObject({
      state: "active",
      registration_id: registration.id,
    });
    expect(pass.token).toBeTruthy();
  });
});
