import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import {
  sessionOf,
  addFlights,
  flightRow,
  registerWithPass,
} from "./helpers/fixtures";
import { listServiceRequests } from "@/lib/service-requests";
import { createCall } from "@/lib/calls";
import { createAssist,advanceAssist } from "@/lib/assist";
import { queueQuery, type QueueOptions } from "@/lib/request-queue";
const now = kst("2026-10-26 12:00"),
  staff = sessionOf(now);
let db: Db,
  counter = 0;
async function insert(
  extra: {
    age?: number;
    state?: string;
    place?: string;
    pending?: string;
    zone?: string;
    service?: string;
    source?: string;
  } = {},
) {
  const age = extra.age ?? 1,
    created = new Date(now.getTime() - age * 60000),
    state = extra.state ?? "received";
  const [row] = await db.query<{ id: string }>(
    `insert into service_requests(receipt_hash,service,state,place_id,party,note,lang,source,assigned_zone,created_at,updated_at,expires_at,device_key,ended_at,pending_place_id,pending_place_at)
    values($1,$2,$3,$4,1,'비공개 건강 메모','ko',$5,$6,$7,$7,$8,'queue-test',$9,$10,$11) returning id`,
    [
      "queue-" + ++counter,
      extra.service ?? "guidance",
      state,
      extra.place ?? "cc-center",
      extra.source ?? "web",
      extra.zone ?? null,
      created,
      new Date(now.getTime() + 86400000),
      ["done", "cancelled"].includes(state) ? created : null,
      extra.pending ?? null,
      extra.pending ? created : null,
    ],
  );
  return row.id;
}
const list = async (options: QueueOptions = {}) => {
  const result = await listServiceRequests(db, staff, now, options);
  expect(result.status).toBe(200);
  return result.body as {
    requests: { id: string }[];
    total: number;
    summary: { total: number };
    limit: number;
  };
};
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits,calls,assist_requests,registrations,passes,flights,flight_polls cascade",
  );
  counter = 0;
});
describe("whole-queue filtering and priority", () => {
  it("does not flag freshly started retained mobility using its older assignment time",async()=>{
    const createdAt=new Date(now.getTime()-50*60000),assignedAt=new Date(now.getTime()-45*60000);
    await addFlights(db,[flightRow("KE123","2026-10-26 18:00")],createdAt);
    const {registration}=await registerWithPass(db,createdAt,{flightDate:"2026-10-26"});
    const a=await createAssist(db,registration.id,"cc-center",createdAt);
    await advanceAssist(db,a!.id,staff.zoneId,"assign",assignedAt);
    expect((await list({scope:"attention"})).total).toBe(1);
    await advanceAssist(db,a!.id,staff.zoneId,"move",now);
    expect((await list({scope:"attention"})).total).toBe(0);
    const [row]=await db.query<{updated_at:Date;started_at:Date}>("select updated_at,started_at from request_work_ledger where id=$1",["assist:"+a!.id]);
    expect(row.updated_at).toEqual(now);expect(row.started_at).toEqual(now);
  });
  it("finds a matching pickup beyond the original two-hundred-row page", async () => {
    await db.query(
      `insert into service_requests(receipt_hash,service,place_id,party,lang,source,created_at,updated_at,expires_at,device_key)
      select 'bulk-'||n,'guidance',case when n=230 then 't1-info' else 'cc-center' end,1,'ko','web',
       $1::timestamptz-n*interval '1 second',$1::timestamptz-n*interval '1 second',$1::timestamptz+interval '24 hours','bulk'
      from generate_series(1,230) n`,
      [now],
    );
    expect((await list()).requests).toHaveLength(200);
    const filtered = await list({ search: "t1-info", limit: 25 });
    expect(filtered.total).toBe(1);
    expect(filtered.requests).toHaveLength(1);
  });
  it("uses the same filters for result count and every page", async () => {
    for (let i = 0; i < 28; i++) await insert({ service: "robot" });
    await insert();
    const first = await list({ service: "robot", limit: 25 }),
      next = await list({ service: "robot", limit: 25, offset: 25 });
    expect(first.total).toBe(28);
    expect(next.total).toBe(28);
    expect(first.requests).toHaveLength(25);
    expect(next.requests).toHaveLength(3);
    expect(
      new Set([...first.requests, ...next.requests].map((r) => r.id)).size,
    ).toBe(28);
  });
  it("sorts location review overdue unassigned and active work deterministically", async () => {
    const pending = await insert({
      state: "assigned",
      age: 1,
      pending: "t1-info",
      zone: staff.zoneId,
    });
    const lateActive = await insert({
      state: "assigned",
      age: 40,
      zone: staff.zoneId,
    });
    const lateWaiting = await insert({ age: 20 });
    const waiting = await insert({ age: 5 });
    const active = await insert({
      state: "assigned",
      age: 1,
      zone: staff.zoneId,
    });
    const done = await insert({ state: "done", age: 3, zone: staff.zoneId });
    expect(
      (await list({ order: "priority" })).requests.map((r) => r.id),
    ).toEqual([pending, lateActive, lateWaiting, waiting, active, done]);
  });
  it("keeps FIFO and newest options distinct", async () => {
    const old = await insert({ age: 8 }),
      fresh = await insert({ age: 1 });
    expect((await list({ order: "oldest" })).requests.map((r) => r.id)).toEqual(
      [old, fresh],
    );
    expect((await list({ order: "newest" })).requests.map((r) => r.id)).toEqual(
      [fresh, old],
    );
  });
  it("matches public pickup names in Korean English and the pending destination", async () => {
    const id = await insert({
      state: "assigned",
      pending: "t1-info",
      zone: staff.zoneId,
    });
    expect(
      (await list({ search: "t1-info" })).requests.map((r) => r.id),
    ).toEqual([id]);
    expect(
      (await list({ search: "제1여객터미널" })).requests.map((r) => r.id),
    ).toEqual([id]);
    expect((await list({ search: "T1" })).requests.map((r) => r.id)).toEqual([
      id,
    ]);
  });
  it("does not search health notes or interpret wildcard and SQL syntax", async () => {
    await insert();
    for (const search of ["비공개 건강", "%", "_", "' OR true --"])
      expect((await list({ search })).total).toBe(0);
  });
  it("matches an individual request identifier without exposing other requests", async () => {
    const id = await insert();
    await insert();
    expect(
      (await list({ search: id.toUpperCase() })).requests.map((r) => r.id),
    ).toEqual([id]);
  });
  it("applies service channel zone and owned-work filters as intersections", async () => {
    const owned = await insert({
      state: "assigned",
      zone: staff.zoneId,
      service: "robot",
      source: "assisted",
    });
    await insert({
      state: "assigned",
      zone: "cc-mid",
      service: "robot",
      source: "assisted",
    });
    await insert({ service: "robot", source: "web" });
    const result = await list({
      scope: "mine",
      service: "robot",
      source: "assisted",
      zone: staff.zoneId,
    });
    expect(result.requests.map((r) => r.id)).toEqual([owned]);
    expect(result.summary.total).toBe(3);
  });
  it("shares overdue thresholds with the operations summary", async () => {
    await insert({ age: 11 });
    await insert({ state: "assigned", age: 31, zone: staff.zoneId });
    await insert({ age: 1 });
    const result = await listServiceRequests(db, staff, now, {
      scope: "attention",
    });
    expect(result.body.total).toBe(2);
    expect(
      (result.body.summary as { awaitingAttention: number }).awaitingAttention,
    ).toBe(2);
  });
  it("filters all three authoritative queues without copying records", async () => {
    await insert();
    await createCall(db, "cc-108", null, "guide", now);
    await addFlights(db, [flightRow("KE123", "2026-10-26 18:00")], now);
    const { registration } = await registerWithPass(db, now, {
      flightDate: "2026-10-26",
    });
    await createAssist(db, registration.id, "cc-center", now);
    for (const queue of ["integrated", "call", "assist"])
      expect((await list({ queue })).total).toBe(1);
  });
  it("keeps history searchable by identifier after pickup details are erased", async () => {
    const id = await insert({ state: "done" });
    const later = new Date(now.getTime() + 25 * 3600000);
    const byId = await listServiceRequests(db, sessionOf(later), later, {
      history: true,
      search: id,
    });
    expect(byId.body.total).toBe(1);
    const byPickup = await listServiceRequests(db, sessionOf(later), later, {
      history: true,
      search: "cc-center",
    });
    expect(byPickup.body.total).toBe(0);
  });
  it("rejects unsupported filters page sizes and unsafe query shapes", async () => {
    for (const options of [
      { service: "invalid" },
      { scope: "any" },
      { order: "created_at desc; drop table zones" },
      { source: "unknown" },
      { limit: 1 },
      { search: "x".repeat(81) },
      { search: String.fromCharCode(0) },
      { zone: "a' OR true" },
    ]) {
      expect((await listServiceRequests(db, staff, now, options)).status).toBe(
        400,
      );
    }
    expect(() =>
      queueQuery({ search: 1 as unknown as string }, staff.zoneId, now),
    ).toThrow();
  });
});
