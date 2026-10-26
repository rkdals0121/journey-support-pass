import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  createServiceRequest,
  serviceRequestStatus,
  cancelServiceRequest,
  listServiceRequests,
  actOnServiceRequest,
  expireServiceRequests,
  REQUEST_TTL_MS,
} from "@/lib/service-requests";
import type { ServiceRequestView } from "@/lib/service-request-model";
import type { ApiResult } from "@/lib/api/dto";
import type { Db } from "@/lib/db";
import { migrate } from "@/lib/db";
import { seedZones } from "@/lib/zones";
import { eraseRegistration } from "@/lib/purge";
import { createTestDb, kst } from "./helpers/db";
import {
  addFlights,
  flightRow,
  registerWithPass,
  sessionOf,
  deskSession,
  kioskSession,
} from "./helpers/fixtures";
const now = kst("2026-10-25 14:00");
let db: Db;
const staff = sessionOf(now),
  other = sessionOf(now, { zoneId: "cc-mid" }),
  desk = deskSession(now);
const receipt = (n: number) => n.toString(16).padStart(64, "0");
const body = (n = 1) => ({
  receipt: receipt(n),
  placeId: "cc-center",
  service: "guidance",
  choices: ["gd_large"],
  party: 2,
  note: "천천히 안내해 주세요",
  lang: "ko",
  consent: true,
});
const get = (r: ApiResult) =>
  (r.body as { request: ServiceRequestView }).request;
const create = (
  n = 1,
  extra: Record<string, unknown> = {},
  device = "ip:phone",
) => createServiceRequest(db, null, { ...body(n), ...extra }, device, now);
const act = (
  r: ServiceRequestView,
  action: string,
  s = staff,
  extra: Record<string, unknown> = {},
) =>
  actOnServiceRequest(
    db,
    s,
    r.id,
    { version: r.version, action, ...extra },
    now,
  );
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits,assist_requests,calls,events,access_logs,passes,registrations,flights,flight_polls restart identity cascade",
  );
});
describe("DX independent and pre-registered requests", () => {
  it("accepts a confirmed gate clue as an exact pilot pickup and finds it in staff search", async () => {
    const r = await create(1, {
      placeId: "gate-127",
      service: "mobility",
      topicId: "mobility",
    });
    expect(r.status).toBe(200);
    expect(get(r)).toMatchObject({
      placeId: "gate-127",
      businessId: "shuttle",
    });
    expect(get(r).place).toContain("127번");
    expect(
      (await listServiceRequests(db, desk, now, { search: "127번" })).body,
    ).toMatchObject({ total: 1 });
    expect((await create(2, { placeId: "gate-999" })).status).toBe(400);
  });
  it("stores structured enquiry type and terminal-specific business without changing the passenger note", async () => {
    const r = await create(1, {
      topicId: "facility",
      placeId: "t2-arrivals-demo",
    });
    expect(r.status).toBe(200);
    expect(get(r)).toMatchObject({
      topicId: "facility",
      businessId: "cleaning-t2",
      note: body().note,
    });
    const listed = await listServiceRequests(db, desk, now);
    expect(
      (listed.body as { requests: ServiceRequestView[] }).requests[0],
    ).toMatchObject({ topicId: "facility", businessId: "cleaning-t2" });
    expect(
      (await listServiceRequests(db, desk, now, { topic: "facility" })).body,
    ).toMatchObject({ total: 1 });
    expect(
      (await listServiceRequests(db, desk, now, { topic: "mobility" })).body,
    ).toMatchObject({ total: 0 });
    expect(
      (await listServiceRequests(db, desk, now, { topic: "injected" })).status,
    ).toBe(400);
  });
  it("rejects unknown or incompatible structured request types", async () => {
    expect((await create(1, { topicId: "not-real" })).status).toBe(400);
    expect(
      (await create(2, { topicId: "facility", service: "robot" })).status,
    ).toBe(400);
    expect((await create(3, { businessId: "unknown" })).status).toBe(400);
  });
  it("only saves valid mobility destinations within a terminal and security boundary", async () => {
    expect(
      (
        await create(1, {
          service: "mobility",
          topicId: "mobility",
          placeId: "t1-info",
          destinationId: "t2-help",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await create(2, {
          service: "mobility",
          placeId: "t1-info",
          destinationId: "t1-center",
        })
      ).status,
    ).toBe(400);
    expect((await create(3, { destinationId: "cc-103" })).status).toBe(400);
    const r = await create(4, {
      service: "mobility",
      topicId: "mobility",
      placeId: "t2-help",
      destinationId: "t2-arrivals-demo",
    });
    expect(r.status).toBe(200);
    expect(get(r).destinationId).toBe("t2-arrivals-demo");
  });
  it("clears destination when the pickup is changed and erases metadata after retention", async () => {
    const r = await create(1, {
      service: "mobility",
      topicId: "mobility",
      placeId: "cc-center",
      destinationId: "cc-103",
    });
    expect(get(r).destinationId).toBe("cc-103");
    await db.query(
      "update service_requests set place_id='cc-108' where id=$1",
      [get(r).id],
    );
    expect(
      get(await serviceRequestStatus(db, receipt(1), now)).destinationId,
    ).toBeUndefined();
    await expireServiceRequests(
      db,
      new Date(now.getTime() + REQUEST_TTL_MS + 1),
    );
    expect(
      (
        await db.query(
          "select topic_id,business_id,destination_id from service_requests where id=$1",
          [get(r).id],
        )
      )[0],
    ).toEqual({ topic_id: null, business_id: null, destination_id: null });
  });
  it("erases structured destination and topic when linked details are cleared", async () => {
    const r = await create(1, {
      service: "mobility",
      topicId: "mobility",
      placeId: "cc-center",
      destinationId: "cc-103",
    });
    await db.query("update service_requests set place_id='' where id=$1", [
      get(r).id,
    ]);
    expect(
      (
        await db.query(
          "select topic_id,business_id,destination_id from service_requests where id=$1",
          [get(r).id],
        )
      )[0],
    ).toEqual({ topic_id: null, business_id: null, destination_id: null });
  });
  it("accepts without flight, documents or pre-registration and hides the receipt hash", async () => {
    const r = await create();
    expect(r.status).toBe(200);
    expect(get(r)).toMatchObject({
      state: "received",
      placeId: "cc-center",
      party: 2,
      source: "web",
      choices: ["gd_large"],
    });
    expect(JSON.stringify(r.body)).not.toContain(receipt(1));
    expect(JSON.stringify(r.body)).not.toContain("receipt_hash");
    expect((await db.query("select id from registrations")).length).toBe(0);
  });
  it("retries the same receipt without duplicating or changing the original content", async () => {
    const first = await create();
    const second = await create(1, { note: "different" });
    expect(get(second).id).toBe(get(first).id);
    expect(get(second).note).not.toBe("different");
    expect((await db.query("select id from service_requests")).length).toBe(1);
  });
  it("does not reveal another request to an unknown receipt", async () => {
    await create();
    expect((await serviceRequestStatus(db, receipt(2), now)).status).toBe(404);
    expect((await serviceRequestStatus(db, "short", now)).status).toBe(404);
  });
  it.each([
    { consent: false },
    { placeId: "not-a-place" },
    { service: "medical" },
    { party: 0 },
    { party: 21 },
    { party: 1.5 },
    { note: "x".repeat(201) },
    { receipt: "short" },
  ])("validates user input %j", async (extra) => {
    expect((await create(1, extra)).status).toBe(400);
    expect((await db.query("select id from service_requests")).length).toBe(0);
  });
  it("uses authenticated kiosk location rather than a user-supplied place", async () => {
    const r = await createServiceRequest(
      db,
      kioskSession(now, "t1-info"),
      body(),
      "ip:kiosk",
      now,
    );
    expect(get(r)).toMatchObject({ placeId: "t1-info", source: "kiosk" });
  });
  it("ignores untrusted source flags and permits desk-assisted source only for a desk session", async () => {
    expect(
      get(await create(1, { assisted: true, source: "kiosk" })).source,
    ).toBe("web");
    const r = await createServiceRequest(
      db,
      desk,
      { ...body(2), assisted: true },
      "ip:desk",
      now,
    );
    expect(get(r).source).toBe("assisted");
  });
  it("links saved needs but does not require check-in or proof", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-25 18:00")], now);
    const { pass } = await registerWithPass(db, now, {
      flightDate: "2026-10-25",
      choices: ["mov_no_stairs"],
      proof: false,
    });
    const r = await create(1, {
      registrationToken: pass.token,
      choices: undefined,
    });
    expect(r.status).toBe(200);
    expect(get(r).source).toBe("preregistered");
    expect(get(r).choices).toContain("mov_no_stairs");
    expect((await create(2, { registrationToken: pass.token })).status).toBe(
      409,
    );
  });
  it("rejects an invalid prior token explicitly instead of claiming to link it", async () => {
    expect((await create(1, { registrationToken: "not-real" })).status).toBe(
      410,
    );
  });
  it("limits rapid anonymous submissions using a database quota", async () => {
    for (let n = 1; n <= 20; n++) expect((await create(n)).status).toBe(200);
    expect((await create(21)).status).toBe(429);
    expect((await create(1)).status).toBe(200);
  });
  it("cannot exceed quota with concurrent submissions", async () => {
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) => create(i + 1)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(20);
    expect((await db.query("select id from service_requests")).length).toBe(20);
  });
});
describe("DX handling, ownership and expiry", () => {
  it("requires staff authentication and a selected zone", async () => {
    expect((await listServiceRequests(db, null, now)).status).toBe(401);
    expect(
      (await listServiceRequests(db, kioskSession(now, "t1-info"), now)).status,
    ).toBe(401);
    expect(
      (await listServiceRequests(db, sessionOf(now, { needsZone: true }), now))
        .status,
    ).toBe(409);
  });
  it("shares one request through assignment, arrival, service and completion", async () => {
    let r = get(await create());
    for (const action of ["assign", "travel", "arrive", "serve", "complete"]) {
      const result = await act(r, action);
      expect(result.status).toBe(200);
      r = get(result);
    }
    expect(r.state).toBe("done");
    expect(get(await serviceRequestStatus(db, receipt(1), now)).state).toBe(
      "done",
    );
    expect(
      (
        await db.query<{ arrived_at: Date; started_at: Date; ended_at: Date }>(
          "select arrived_at,started_at,ended_at from service_requests",
        )
      )[0].arrived_at,
    ).toBeTruthy();
  });
  it("allows only one winner when staff accept concurrently", async () => {
    const r = get(await create());
    const results = await Promise.all([
      act(r, "assign"),
      act(r, "assign", other),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("rejects out-of-order and other-zone changes", async () => {
    const r = get(await create());
    expect((await act(r, "complete")).status).toBe(409);
    const assigned = get(await act(r, "assign"));
    expect((await act(assigned, "travel", other)).status).toBe(403);
  });
  it("makes cancellation idempotent and blocks an outdated staff action", async () => {
    const r = get(await create());
    expect((await cancelServiceRequest(db, receipt(1), now)).status).toBe(200);
    expect(get(await cancelServiceRequest(db, receipt(1), now)).state).toBe(
      "cancelled",
    );
    expect((await act(r, "assign")).status).toBe(409);
  });
  it("does not cancel a service that already started", async () => {
    let r = get(await create());
    for (const a of ["assign", "travel", "arrive", "serve"])
      r = get(await act(r, a));
    expect((await cancelServiceRequest(db, receipt(1), now)).status).toBe(409);
  });
  it("requires a reason for unavailable and returns it to the passenger", async () => {
    const r = get(await create());
    expect((await act(r, "unavailable", desk)).status).toBe(400);
    expect(
      get(
        await act(r, "unavailable", desk, {
          reason: "이 구역에서는 지원할 수 없습니다",
        }),
      ).state,
    ).toBe("unavailable");
    expect(
      get(await serviceRequestStatus(db, receipt(1), now)).reason,
    ).toContain("이 구역");
  });
  it("lets only the desk release an assignment and invalidates stale versions", async () => {
    const assigned = get(await act(get(await create()), "assign"));
    expect((await act(assigned, "reopen", staff)).status).toBe(403);
    const reopened = get(await act(assigned, "reopen", desk));
    expect(reopened).toMatchObject({ state: "received", assignedZone: null });
    expect((await act(assigned, "travel")).status).toBe(409);
  });
  it("expires without pretending to complete, redacts contents and denies receipt access", async () => {
    await create();
    const later = new Date(now.getTime() + REQUEST_TTL_MS + 1);
    await expireServiceRequests(db, later);
    const [r] = await db.query<{
      state: string;
      note: string;
      choices: string[];
      device_key: string;
    }>("select state,note,choices,device_key from service_requests");
    expect(r).toMatchObject({
      state: "expired",
      note: "",
      choices: [],
      device_key: "",
    });
    expect((await serviceRequestStatus(db, receipt(1), later)).status).toBe(
      410,
    );
    expect((await listServiceRequests(db, staff, later)).body).toMatchObject({
      requests: [],
    });
  });
  it("redacts pickup and needs even when legacy device and note fields are empty", async () => {
    await create(1, { note: "" }, "");
    await expireServiceRequests(
      db,
      new Date(now.getTime() + REQUEST_TTL_MS + 1),
    );
    expect(
      (await db.query("select place_id,choices from service_requests"))[0],
    ).toMatchObject({ place_id: "", choices: [] });
  });
  it("erases a linked request snapshot when the passenger deletes pre-registration", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-25 18:00")], now);
    const { registration, pass } = await registerWithPass(db, now, {
      flightDate: "2026-10-25",
    });
    await create(1, { registrationToken: pass.token });
    await eraseRegistration(db, registration.id, now);
    const [r] = await db.query<{
      registration_id: null;
      note: string;
      state: string;
    }>("select registration_id,note,state from service_requests");
    expect(r).toMatchObject({
      registration_id: null,
      note: "",
      state: "cancelled",
    });
    expect((await serviceRequestStatus(db, receipt(1), now)).status).toBe(410);
  });
  it("migration can run again with existing requests intact", async () => {
    const r = get(await create());
    await migrate(db);
    expect(get(await serviceRequestStatus(db, receipt(1), now)).id).toBe(r.id);
  });
  it("times out an unanswered request before the retention deadline without counting it as completed", async () => {
    await create();
    const later = new Date(now.getTime() + 61 * 60 * 1000);
    const r = get(await serviceRequestStatus(db, receipt(1), later));
    expect(r.state).toBe("expired");
    expect(r.reason).toContain("시간");
    const list = await listServiceRequests(db, staff, later);
    expect(list.body).toMatchObject({ summary: { done: 0, expired: 1 } });
  });
  it("permits editing saved needs instead of silently re-adding deselected options", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-25 18:00")], now);
    const { pass } = await registerWithPass(db, now, {
      flightDate: "2026-10-25",
      choices: ["gd_large", "mov_no_stairs"],
    });
    expect(
      get(await create(1, { registrationToken: pass.token, choices: [] }))
        .choices,
    ).toEqual([]);
  });
  it("rejects malformed UUIDs without issuing invalid database queries", async () => {
    expect(
      (
        await actOnServiceRequest(
          db,
          staff,
          "-".repeat(36),
          { version: 0, action: "assign" },
          now,
        )
      ).status,
    ).toBe(400);
  });
  it("reports separate timing metrics for actual accepted and arrived requests", async () => {
    const r = get(await create());
    const accepted = get(
      await actOnServiceRequest(
        db,
        staff,
        r.id,
        { version: r.version, action: "assign" },
        new Date(now.getTime() + 60000),
      ),
    );
    const traveling = get(
      await actOnServiceRequest(
        db,
        staff,
        r.id,
        { version: accepted.version, action: "travel" },
        new Date(now.getTime() + 90000),
      ),
    );
    await actOnServiceRequest(
      db,
      staff,
      r.id,
      { version: traveling.version, action: "arrive" },
      new Date(now.getTime() + 180000),
    );
    expect(
      (await listServiceRequests(db, staff, new Date(now.getTime() + 180000)))
        .body,
    ).toMatchObject({
      summary: {
        done: 0,
        active: 1,
        medianAcceptSec: 60,
        medianArrivalSec: 120,
      },
    });
  });
});
