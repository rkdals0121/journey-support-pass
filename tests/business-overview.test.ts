import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  businessOverview,
  businessOverviewHandler,
} from "@/lib/business-overview";
import { overviewQueueLink } from "@/lib/business-overview-model";
import { BUSINESS_AREAS } from "@/lib/operating-profile";
import { listServiceRequests } from "@/lib/service-requests";
import { seedZones } from "@/lib/zones";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { deskSession, sessionOf, kioskSession } from "./helpers/fixtures";
const now = kst("2026-10-26 00:20"),
  desk = deskSession(now);
let db: Db,
  counter = 0;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,calls,assist_requests,service_request_limits,events,access_logs,passes,registrations,flights,flight_polls restart identity cascade",
  );
});
async function insert({
  business = "cleaning-t1",
  state = "received",
  created = new Date(now.getTime() - 5 * 60000),
  updated = created,
  accepted = null,
  ended = null,
  result = null,
  expires = new Date(now.getTime() + 86400000),
  linked = false,
}: {
  business?: string | null;
  state?: string;
  created?: Date;
  updated?: Date;
  accepted?: Date | null;
  ended?: Date | null;
  result?: string | null;
  expires?: Date;
  linked?: boolean;
} = {}) {
  const [r] = await db.query<{ id: string }>(
    `insert into service_requests(receipt_hash,service,state,place_id,party,note,lang,source,created_at,updated_at,accepted_at,ended_at,expires_at,device_key,business_id,resolution_kind,resolution_message,registration_linked)
 values($1,'guidance',$2,'cc-center',1,'private passenger message','ko','web',$3,$4,$5,$6,$7,'private-device',$8,$9,$10,$11) returning id`,
    [
      "overview-" + ++counter,
      state,
      created,
      updated,
      accepted,
      ended,
      expires,
      business,
      result,
      result ? "private result message" : "",
      linked,
    ],
  );
  return r.id;
}
describe("business operations snapshot", () => {
  it("returns thirteen named rows and null durations on an empty queue", async () => {
    const s = await businessOverview(db, now);
    expect(s.businesses).toHaveLength(BUSINESS_AREAS.length + 1);
    expect(s.totals).toMatchObject({
      todayIntake: 0,
      active: 0,
      waiting: 0,
      attention: 0,
      todayCompleted: 0,
      medianAcceptSec: null,
      oldestWaitingSec: null,
    });
    expect(s.results).toEqual({
      advice: 0,
      referral: 0,
      handoff: 0,
      resolved: 0,
      unrecorded: 0,
    });
  });
  it("requires an authenticated desk session before reading or cleaning data", async () => {
    for (const s of [
      null,
      kioskSession(now, "cc-center"),
      sessionOf(now, { exp: now.getTime() }),
    ])
      expect((await businessOverviewHandler(db, s, now)).status).toBe(401);
    expect(
      (
        await businessOverviewHandler(
          db,
          sessionOf(now, { needsZone: true }),
          now,
        )
      ).status,
    ).toBe(409);
    expect(
      (await businessOverviewHandler(db, sessionOf(now), now)).status,
    ).toBe(403);
    expect((await businessOverviewHandler(db, desk, now)).status).toBe(200);
  });
  it("keeps yesterday's active work separate from today's intake at the Korean midnight boundary", async () => {
    await insert({
      created: kst("2026-10-25 23:55"),
      state: "assigned",
      updated: kst("2026-10-26 00:10"),
      accepted: kst("2026-10-26 00:05"),
    });
    await insert({ created: kst("2026-10-26 00:00"), linked: true });
    await insert({ created: kst("2026-10-26 00:21") });
    const s = await businessOverview(db, now);
    expect(s.date).toBe("2026-10-26");
    expect(s.totals).toMatchObject({
      todayIntake: 1,
      todayLinked: 1,
      active: 2,
      waiting: 1,
      attention: 1,
      oldestWaitingSec: 1200,
      medianAcceptSec: 600,
    });
  });
  it("counts completed outcomes by actual completion date without treating referral or handover as resolution", async () => {
    for (const result of ["advice", "referral", "handoff", "resolved", null])
      await insert({
        state: "done",
        created: kst("2026-10-25 23:50"),
        ended: kst("2026-10-26 00:10"),
        result,
      });
    await insert({ state: "cancelled", ended: kst("2026-10-26 00:12") });
    await insert({ state: "unavailable", ended: kst("2026-10-26 00:13") });
    await insert({
      state: "done",
      created: kst("2026-10-25 23:00"),
      ended: kst("2026-10-25 23:30"),
      result: "resolved",
    });
    const s = await businessOverview(db, now);
    expect(s.totals).toMatchObject({
      todayCompleted: 5,
      todayOtherClosed: 2,
      medianCompletionSec: 1200,
    });
    expect(s.results).toEqual({
      advice: 1,
      referral: 1,
      handoff: 1,
      resolved: 1,
      unrecorded: 1,
    });
  });
  it("shows stale waiting and in-progress work using the same queue attention rules", async () => {
    const id = await insert({
      created: kst("2026-10-25 23:45"),
      state: "serving",
      updated: kst("2026-10-25 23:45"),
      business: "shuttle",
    });
    await insert({ created: kst("2026-10-26 00:09"), business: "shuttle" });
    await insert({ created: kst("2026-10-26 00:11"), business: "shuttle" });
    const s = await businessOverview(db, now);
    expect(s.businesses.find((b) => b.businessId === "shuttle")).toMatchObject({
      todayIntake: 2,
      active: 3,
      waiting: 2,
      attention: 2,
    });
    const q = await listServiceRequests(db, desk, now, {
      business: "shuttle",
      scope: "attention",
    });
    expect(q.body).toMatchObject({ total: 2 });
    expect(JSON.stringify(q.body)).toContain(id);
  });
  it("groups unknown and unrecorded business values without returning those raw values", async () => {
    await insert({ business: null });
    await insert({ business: "private-unknown-business" });
    const s = await businessOverview(db, now);
    expect(
      s.businesses.find((b) => b.businessId === "unclassified")?.active,
    ).toBe(2);
    expect(JSON.stringify(s)).not.toContain("private-");
    const q = await listServiceRequests(db, desk, now, {
      business: "unclassified",
    });
    expect(q.body).toMatchObject({ total: 2 });
  });
  it("erases expired details and counts their finished outcome as unrecorded, not as a fabricated resolution", async () => {
    await insert({
      state: "done",
      ended: kst("2026-10-26 00:10"),
      result: "handoff",
      expires: kst("2026-10-26 00:15"),
    });
    const s = await businessOverview(db, now);
    expect(s.results).toMatchObject({ handoff: 0, resolved: 0, unrecorded: 1 });
    expect(
      s.businesses.find((b) => b.businessId === "unclassified")?.todayIntake,
    ).toBe(1);
  });
  it("does not count automatic expiry as completed service", async () => {
    await insert({ created: kst("2026-10-25 22:00") });
    const s = await businessOverview(db, now);
    expect(s.totals).toMatchObject({
      active: 0,
      todayCompleted: 0,
      todayOtherClosed: 1,
    });
    expect(Object.values(s.results).reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("returns only aggregate measures, never receipt, request ids or free text", async () => {
    const id = await insert();
    const text = JSON.stringify(await businessOverview(db, now));
    for (const hidden of [
      id,
      "receipt",
      "private passenger message",
      "private result message",
      "private-device",
      "placeId",
      "choices",
    ])
      expect(text).not.toContain(hidden);
  });
  it("drills into the same canonical business and queue scope", () => {
    expect(overviewQueueLink()).toBe("/staff/requests?scope=active");
    expect(overviewQueueLink("cleaning-t2", "attention")).toBe(
      "/staff/requests?scope=attention&business=cleaning-t2",
    );
    expect(overviewQueueLink("unclassified", "waiting")).toContain(
      "business=unclassified",
    );
  });
  it("includes original legacy calls and assistance exactly once without inventing their outcome", async () => {
    const created = new Date(now.getTime() - 10 * 60000),
      ended = new Date(now.getTime() - 2 * 60000);
    await db.query(
      "insert into calls(created_at,place_id,zone_id,accepted_at,accepted_zone,ended_at,end_kind) values($1,'cc-center','cc-end',$1,'cc-end',$2,'done')",
      [created, ended],
    );
    await db.query(
      "insert into assist_requests(created_at,place_id,state,assigned_zone,assigned_at,ended_at,end_kind) values($1,'cc-center','done','cc-end',$1,$2,'done')",
      [created, ended],
    );
    await insert();
    const s = await businessOverview(db, now);
    expect(s.totals).toMatchObject({
      todayIntake: 3,
      active: 1,
      todayCompleted: 2,
    });
    expect(s.results.unrecorded).toBe(2);
    expect(s.businesses.reduce((n, b) => n + b.todayIntake, 0)).toBe(
      s.totals.todayIntake,
    );
    expect(s.businesses.reduce((n, b) => n + b.active, 0)).toBe(
      s.totals.active,
    );
  });
  it("drills active counts into an active-only queue rather than recent completed rows", async () => {
    await insert();
    await insert({ state: "done", ended: now, result: "advice" });
    const s = await businessOverview(db, now),
      q = await listServiceRequests(db, desk, now, {
        business: "cleaning-t1",
        scope: "active",
      });
    expect(q.body).toMatchObject({
      total: s.businesses.find((b) => b.businessId === "cleaning-t1")!.active,
    });
    expect(q.body).toMatchObject({ total: 1 });
  });
});
