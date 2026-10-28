import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import { deskSession, kioskSession, sessionOf } from "./helpers/fixtures";
import type { Db } from "@/lib/db";
import { bookVisit, visitSlots, visitStatus, changeVisit, updateHubRule, crewShift, staffVisits, staffVisitAction, experienceSummary } from "@/lib/support-visits";
import type { VisitView } from "@/lib/service-hubs";
const now = kst("2026-10-28 09:15"), start = kst("2026-10-28 09:30").toISOString();
let db: Db;
const receipt = (n: number) => n.toString(16).padStart(64, "0");
const book = (n = 1, over: Record<string, unknown> = {}) => bookVisit(db, { receipt: receipt(n), consent: true, hubId: "concourse", service: "robot", startAt: start, task: "directions", party: 1, ...over }, `device:${n}`, now);
const get = (r: { body: Record<string, unknown> }) => r.body.visit as VisitView;
const act = (v: VisitView, n: number, action: string, over: Record<string, unknown> = {}) => changeVisit(db, { receipt: receipt(n), version: v.version, action, ...over }, `device:${n}`, now);
beforeAll(async () => { db = await createTestDb(); await seedZones(db, () => "x:y"); });
beforeEach(async () => { await db.exec("truncate support_visits,support_hub_rules,support_crew,support_experience_events,service_requests,service_request_limits restart identity cascade"); });
describe("appointment capacity and operating restrictions", () => {
  it("allows only one winner for the final seat and preserves retry identity", async () => {
    const results = await Promise.all([book(1), book(2), book(3)]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(2);
    const winner = results.findIndex(r => r.status === 200) + 1;
    expect(get(await book(winner)).id).toBe(get(results[winner - 1]).id);
  });
  it("cancellation frees capacity without changing other appointments", async () => {
    const v = get(await book());
    expect((await act(v, 1, "cancel")).status).toBe(200);
    expect((await book(2)).status).toBe(200);
  });
  it("requires valid consent, services, future slots and configured hubs", async () => {
    for (const over of [{ consent: false }, { hubId: "unknown" }, { task: "wheelchair" }, { party: 0 }]) expect((await book(1, over)).status).toBe(400);
    expect((await book(1, { startAt: kst("2026-10-28 09:17").toISOString() })).status).toBe(409);
    expect((await book(1, { startAt: kst("2026-10-28 18:00").toISOString() })).status).toBe(409);
  });
  it("honours paused, charging and exhausted rules with desk-only versioned edits", async () => {
    const rule = { hubId: "concourse", service: "robot", openHour: 9, closeHour: 18, capacity: 1, battery: 100, state: "paused", reason: "혼잡", availableAfter: null, version: 0 };
    expect((await updateHubRule(db, sessionOf(now), rule, now)).status).toBe(403);
    expect((await updateHubRule(db, deskSession(now), rule, now)).status).toBe(200);
    expect((await book()).status).toBe(409);
    expect((await updateHubRule(db, deskSession(now), rule, now)).status).toBe(409);
    expect((await updateHubRule(db, deskSession(now), { ...rule, version: 1, state: "charging", battery: 10, availableAfter: kst("2026-10-28 11:00").toISOString() }, now)).status).toBe(200);
    expect((await book()).status).toBe(409);
    expect((await book(2, { startAt: kst("2026-10-28 11:00").toISOString() })).status).toBe(200);
  });
  it("rescheduling is atomic and keeps the old seat when the target is full", async () => {
    const v = get(await book());
    expect((await book(2, { startAt: kst("2026-10-28 10:00").toISOString() })).status).toBe(200);
    expect((await act(v, 1, "reschedule", { hubId: "concourse", startAt: kst("2026-10-28 10:00").toISOString() })).status).toBe(409);
    expect(new Date(get(await visitStatus(db, receipt(1), now)).startAt).getTime()).toBe(Date.parse(start));
    expect((await act(v, 1, "reschedule", { hubId: "t1-departure", startAt: kst("2026-10-28 10:30").toISOString() })).status).toBe(200);
  });
  it("expires missed appointments and blocks early check-in", async () => {
    const v = get(await book(1, { startAt: kst("2026-10-28 12:00").toISOString() }));
    expect((await act(v, 1, "checkin")).status).toBe(409);
    expect(get(await visitStatus(db, receipt(1), kst("2026-10-28 12:31"))).state).toBe("missed");
  });
  it("shows real remaining capacity in the offered slots", async () => {
    await book();
    const slots = (await visitSlots(db, "concourse", "robot", "2026-10-28", now)).body.slots as { label: string; remaining: number }[];
    expect(slots.find(s => s.label === "09:30")?.remaining).toBe(0);
    expect(slots.find(s => s.label === "10:00")?.remaining).toBe(1);
  });
});
describe("robot self-response and retained staff handover", () => {
  it("finishes a robot response without creating a staff request", async () => {
    let v = get(await book()); v = get(await act(v, 1, "checkin")); v = get(await act(v, 1, "respond"));
    expect((await act(v, 1, "complete")).status).toBe(409);
    expect(get(await act(v, 1, "complete", { confirmed: true })).state).toBe("done");
    expect(await db.query("select id from service_requests")).toHaveLength(0);
  });
  it("hands the same details to one actual integrated request", async () => {
    let v = get(await book(1, { choices: ["mov_no_stairs"], recognition: "파란 모자", party: 3 }));
    v = get(await act(v, 1, "checkin")); v = get(await act(v, 1, "handover"));
    expect(v.state).toBe("handed_over"); expect(v.requestId).toBeTruthy();
    const [request] = await db.query<{ party: number; note: string; choices: string[] }>("select party,note,choices from service_requests where id=$1", [v.requestId]);
    expect(request.party).toBe(3); expect(request.note).toContain("파란 모자"); expect(request.choices).toContain("mov_no_stairs");
    expect((await act(v, 1, "handover")).status).toBe(409);
    expect(await db.query("select id from service_requests")).toHaveLength(1);
  });
  it("rejects stale actions and arbitrary lookup capabilities", async () => {
    const v = get(await book()); await act(v, 1, "checkin");
    expect((await act(v, 1, "cancel")).status).toBe(409);
    expect((await visitStatus(db, receipt(999), now)).status).toBe(404);
  });
});
describe("crew and shift ownership", () => {
  it("does not give kiosk sessions employee visibility", async () => {
    expect((await staffVisits(db, kioskSession(now, "cc-center"), "one", now)).status).toBe(401);
  });
  it("claims once, prevents overloaded crew, and requires a transfer before leaving", async () => {
    const desk = deskSession(now);
    const one = (await crewShift(db, desk, "one", { label: "담당 A", state: "available" }, now)).body.crew as { id: string };
    const two = (await crewShift(db, desk, "two", { label: "담당 B", state: "available" }, now)).body.crew as { id: string };
    let v = get(await book()); v = get(await act(v, 1, "checkin"));
    const outcomes = await Promise.all([staffVisitAction(db, desk, "one", { id: v.id, version: v.version, action: "claim" }, now), staffVisitAction(db, desk, "two", { id: v.id, version: v.version, action: "claim" }, now)]);
    expect(outcomes.filter(r => r.status === 200)).toHaveLength(1);
    v = get(await visitStatus(db, receipt(1), now));
    const ownerKey = v.assignedCrew === one.id ? "one" : "two";
    expect((await crewShift(db, desk, ownerKey, { label: "교대", state: "away" }, now)).status).toBe(409);
    expect((await staffVisitAction(db, desk, ownerKey, { id: v.id, version: v.version, action: "transfer", target: v.assignedCrew === one.id ? two.id : one.id, reason: "교대" }, now)).status).toBe(200);
    expect((await crewShift(db, desk, ownerKey, { label: "교대", state: "away" }, now)).status).toBe(200);
  });
  it("measures robot completion separately from staff handovers", async () => {
    let v = get(await book()); v = get(await act(v, 1, "checkin")); v = get(await act(v, 1, "respond")); await act(v, 1, "complete", { confirmed: true });
    const summary = await experienceSummary(db, deskSession(now), now);
    expect((summary.body.visits as { robotResolved: number }).robotResolved).toBe(1);
  });
});

describe("appointment lifecycle maintenance",()=>{
 it("reconciles the linked staff completion and releases its crew",async()=>{
  let v=get(await book());v=get(await act(v,1,"checkin"));v=get(await act(v,1,"handover"));
  await crewShift(db,deskSession(now),"one",{label:"담당",state:"available"},now);
  await staffVisitAction(db,deskSession(now),"one",{action:"claim",id:v.id,version:v.version},now);
  await db.query("update service_requests set state='done',ended_at=$2 where id=$1",[v.requestId,now]);
  expect(get(await visitStatus(db,receipt(1),now)).state).toBe("done");
  expect((await crewShift(db,deskSession(now),"one",{label:"담당",state:"away"},now)).status).toBe(200);
 });
 it("clears ended personal details after 24 hours and audits automatic expiry",async()=>{
  const v=get(await book(1,{recognition:"빨간 모자",choices:["mov_no_stairs"]}));await act(v,1,"cancel");
  const later=kst("2026-10-29 10:00");const clean=get(await visitStatus(db,receipt(1),later));expect(clean.recognition).toBe("");expect(clean.choices).toEqual([]);
  await book(2);const expired=await visitStatus(db,receipt(2),later);expect(get(expired).state).toBe("missed");expect(expired.body.history).toEqual(expect.arrayContaining([expect.objectContaining({action:"missed"})]));
 });
});
