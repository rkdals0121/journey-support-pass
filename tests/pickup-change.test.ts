import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import {
  sessionOf,
  deskSession,
  kioskSession,
  addFlights,
  flightRow,
  registerWithPass,
} from "./helpers/fixtures";
import {
  createServiceRequest,
  actOnServiceRequest,
  changeRequestPlace,
  cancelServiceRequest,
  serviceRequestHistory,
  registeredRequestProgress,
  expireServiceRequests,
  listServiceRequests,
} from "@/lib/service-requests";
import { mutateResource, resourceSnapshot } from "@/lib/dispatch-resources";
import { eraseRegistration } from "@/lib/purge";
import type { ServiceRequestView } from "@/lib/service-request-model";
import type { ApiResult } from "@/lib/api/dto";
const now = kst("2026-10-26 09:20"),
  staff = sessionOf(now),
  desk = deskSession(now),
  other = sessionOf(now, { zoneId: "cc-mid" });
let db: Db,
  n = 0;
const view = (r: ApiResult) => r.body.request as ServiceRequestView;
const key = (number: number) => number.toString(16).padStart(64, "0");
async function make(service = "robot", token?: string) {
  const receipt = key(++n),
    res = await createServiceRequest(
      db,
      null,
      {
        receipt,
        service,
        registrationToken: token,
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "요청 내용",
        lang: "ko",
        consent: true,
      },
      "pickup:phone",
      now,
    );
  expect(res.status).toBe(200);
  return { receipt, request: view(res) };
}
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
    { action, version: r.version, ...extra },
    now,
  );
const change = (
  r: ServiceRequestView,
  receipt: string,
  extra: Record<string, unknown> = {},
) =>
  changeRequestPlace(
    db,
    null,
    { receipt, version: r.version, placeId: "cc-125", ...extra },
    now,
  );
const history = async (id: string) =>
  (await serviceRequestHistory(db, staff, id, now)).body.history as {
    action: string;
    reason: string;
  }[];
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,dispatch_resources,service_request_limits,registrations,passes,flights,flight_polls,events,access_logs cascade",
  );
  n = 0;
});
describe("confirmed pickup changes", () => {
  it("immediately corrects unassigned pickup without a second request or changed expiry", async () => {
    const { receipt, request: r } = await make(),
      result = await change(r, receipt);
    expect(result.status).toBe(200);
    const updated = view(result);
    expect(updated).toMatchObject({
      id: r.id,
      placeId: "cc-125",
      pendingPlaceId: null,
      state: "received",
      version: r.version + 1,
      expiresAt: r.expiresAt,
    });
    expect((await history(r.id)).at(-1)?.action).toBe("pickup_changed");
    expect(await db.query("select id from service_requests")).toHaveLength(1);
  });
  it("requires the request receipt and validates version action and pickup codes", async () => {
    const { receipt, request: r } = await make();
    expect(
      (
        await changeRequestPlace(
          db,
          null,
          { receipt: "invalid", version: 0, placeId: "cc-125" },
          now,
        )
      ).status,
    ).toBe(404);
    for (const extra of [
      { version: -1 },
      { version: "0" },
      { version: undefined },
      { action: "unknown" },
      { placeId: "unknown" },
    ])
      expect((await change(r, receipt, extra)).status).toBe(400);
    expect((await change(r, receipt, { version: r.version + 1 })).status).toBe(
      409,
    );
  });
  it("keeps shared kiosk pickup locked while allowing the phone receipt holder to move", async () => {
    const { receipt, request: r } = await make();
    const result = await changeRequestPlace(
      db,
      kioskSession(now, "cc-center"),
      { receipt, version: r.version, placeId: "cc-125" },
      now,
    );
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("location_locked");
    expect((await change(r, receipt)).status).toBe(200);
  });
  it("preserves the confirmed location after assignment until the owner accepts", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    r = view(await change(r, receipt));
    expect(r).toMatchObject({
      placeId: "cc-center",
      pendingPlaceId: "cc-125",
      state: "assigned",
    });
    expect(r.pendingPlaceRequestedAt).toBe(now.toISOString());
    expect((await act(r, "travel")).status).toBe(409);
    const accepted = await act(r, "accept_place");
    expect(accepted.status).toBe(200);
    r = view(accepted);
    expect(r).toMatchObject({
      placeId: "cc-125",
      pendingPlaceId: null,
      state: "assigned",
      assignedZone: staff.zoneId,
    });
    expect((await history(r.id)).map((h) => h.action)).toEqual([
      "created",
      "assign",
      "pickup_requested",
      "pickup_accepted",
    ]);
  });
  it("returns an already-arrived request to assigned and clears arrival time while keeping its equipment", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    const gear = await mutateResource(
      db,
      desk,
      {
        action: "create",
        label: "모의 장비",
        kind: "robot",
        zoneId: "cc-center",
      },
      now,
    );
    await mutateResource(
      db,
      desk,
      {
        action: "allocate",
        requestId: r.id,
        version: r.version,
        resourceId: gear.body.id,
      },
      now,
    );
    const [version] = await db.query<{ version: number }>(
      "select version from service_requests where id=$1",
      [r.id],
    );
    r = { ...r, version: version.version };
    r = view(await act(r, "travel"));
    r = view(await act(r, "arrive"));
    r = view(await change(r, receipt));
    r = view(await act(r, "accept_place", desk));
    expect(r.state).toBe("assigned");
    expect((await resourceSnapshot(db))[0].requestId).toBe(r.id);
    const [raw] = await db.query(
      "select arrived_at,accepted_at from service_requests where id=$1",
      [r.id],
    );
    expect(raw.arrived_at).toBeNull();
    expect(raw.accepted_at).not.toBeNull();
  });
  it("requires the owner or desk and a rejection reason", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    r = view(await change(r, receipt));
    expect((await act(r, "accept_place", other)).status).toBe(403);
    expect((await act(r, "reject_place")).status).toBe(400);
    expect(
      (await act(r, "reject_place", staff, { reason: "x".repeat(121) })).status,
    ).toBe(400);
    const rejected = await act(r, "reject_place", staff, {
      reason: "해당 장소는 담당 구역 밖입니다",
    });
    expect(rejected.status).toBe(200);
    r = view(rejected);
    expect(r).toMatchObject({
      placeId: "cc-center",
      pendingPlaceId: null,
      state: "assigned",
    });
    expect(r.reason).toContain("담당 구역 밖");
    expect((await history(r.id)).at(-1)).toMatchObject({
      action: "pickup_rejected",
    });
  });
  it("lets the requester withdraw a proposal without changing the confirmed pickup", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    r = view(await change(r, receipt));
    r = view(await change(r, receipt, { action: "withdraw" }));
    expect(r).toMatchObject({
      placeId: "cc-center",
      pendingPlaceId: null,
      state: "assigned",
    });
    expect((await history(r.id)).at(-1)?.action).toBe("pickup_withdrawn");
  });
  it("keeps network retries idempotent and does not undo a confirmed change", async () => {
    const { receipt, request: created } = await make();
    const assigned = view(await act(created, "assign"));
    const proposed = view(await change(assigned, receipt));
    const retried = view(await change(assigned, receipt));
    expect(retried.version).toBe(proposed.version);
    const confirmed = view(await act(proposed, "accept_place"));
    const lostResponse = view(await change(assigned, receipt));
    expect(lostResponse.version).toBe(confirmed.version);
    expect(lostResponse.placeId).toBe("cc-125");
    const withdrawn = await change(confirmed, receipt, { action: "withdraw" });
    expect(view(withdrawn).version).toBe(confirmed.version);
  });
  it("rejects stale decisions when the requester replaces the proposed point", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    r = view(await change(r, receipt));
    const stale = r;
    r = view(await change(r, receipt, { placeId: "t1-info" }));
    expect((await act(stale, "accept_place")).status).toBe(409);
    expect(r.pendingPlaceId).toBe("t1-info");
    expect((await change(r, receipt, { placeId: "cc-center" })).status).toBe(
      400,
    );
  });
  it("does not let travel race past a same-version location proposal", async () => {
    const { receipt, request: created } = await make();
    const r = view(await act(created, "assign"));
    const results = await Promise.all([change(r, receipt), act(r, "travel")]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  });
  it("preserves a pending request through handoff and blocks unsafe reassignment", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    r = view(await change(r, receipt));
    expect((await act(r, "reopen", desk)).status).toBe(409);
    r = view(
      await act(r, "transfer", desk, { zoneId: "cc-mid", reason: "교대" }),
    );
    expect(r.pendingPlaceId).toBe("cc-125");
    expect((await act(r, "accept_place", staff)).status).toBe(403);
    expect((await act(r, "accept_place", other)).status).toBe(200);
  });
  it("blocks arrival response start and equipment changes while a proposal is pending", async () => {
    const { receipt, request: created } = await make();
    let r = view(await act(created, "assign"));
    r = view(await act(r, "travel"));
    r = view(await change(r, receipt));
    expect((await act(r, "arrive")).status).toBe(409);
    const otherJob = await make("guidance");
    let g = view(await act(otherJob.request, "assign"));
    g = view(await change(g, otherJob.receipt));
    expect((await act(g, "serve")).status).toBe(409);
    const [raw] = await db.query<{ version: number }>(
      "select version from service_requests where id=$1",
      [r.id],
    );
    expect(
      (
        await mutateResource(
          db,
          desk,
          {
            action: "allocate",
            requestId: r.id,
            version: raw.version,
            resourceId: null,
          },
          now,
        )
      ).status,
    ).toBe(409);
  });
  it("does not accept pickup changes after assistance starts or after termination", async () => {
    const { receipt, request: created } = await make("guidance");
    let r = view(await act(created, "assign"));
    r = view(await act(r, "serve"));
    expect((await change(r, receipt)).body.code).toBe("location_stage");
    r = view(await act(r, "complete"));
    expect((await change(r, receipt)).status).toBe(409);
  });
  it("clears pending pickup on cancellation expiry and unavailable completion", async () => {
    for (const ending of ["cancel", "expired", "unavailable"]) {
      const { receipt, request: created } = await make();
      let r = view(await act(created, "assign"));
      r = view(await change(r, receipt));
      if (ending === "cancel")
        expect(
          view(await cancelServiceRequest(db, receipt, now)).pendingPlaceId,
        ).toBeNull();
      else if (ending === "unavailable")
        expect(
          view(await act(r, "unavailable", desk, { reason: "운영 종료" }))
            .pendingPlaceId,
        ).toBeNull();
      else
        await expireServiceRequests(db, new Date(now.getTime() + 4 * 3600000));
      const [row] = await db.query(
        "select pending_place_id,pending_place_at from service_requests where id=$1",
        [r.id],
      );
      expect(row).toEqual({ pending_place_id: null, pending_place_at: null });
    }
  });
  it("erases pending location and free-text history when registration is erased", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-26 18:00")], now);
    const { registration, pass } = await registerWithPass(db, now, {
      flightDate: "2026-10-26",
    });
    const { receipt, request: created } = await make("robot", pass.token);
    let r = view(await act(created, "assign"));
    r = view(await change(r, receipt));
    const progress = await registeredRequestProgress(db, pass.token, now);
    expect(progress.body.requests).toMatchObject([
      { locationChangePending: true },
    ]);
    expect(JSON.stringify(progress.body)).not.toMatch(
      /pendingPlace|cc-125|reason/,
    );
    await eraseRegistration(db, registration.id, now);
    const [row] = await db.query(
      "select pending_place_id,pending_place_at from service_requests where id=$1",
      [r.id],
    );
    expect(row).toEqual({ pending_place_id: null, pending_place_at: null });
    expect((await history(r.id)).every((h) => !h.reason)).toBe(true);
  });
  it("rolls back a pickup proposal if its work history cannot be written", async () => {
    const { receipt, request: created } = await make();
    const r = view(await act(created, "assign"));
    await db.exec(
      "alter table service_request_history add constraint pickup_history_test check(action<>'pickup_requested')",
    );
    try {
      await expect(change(r, receipt)).rejects.toThrow();
    } finally {
      await db.exec(
        "alter table service_request_history drop constraint pickup_history_test",
      );
    }
    const listed = await listServiceRequests(db, staff, now),
      current = (listed.body.requests as ServiceRequestView[]).find(
        (j) => j.id === r.id,
      )!;
    expect(current.pendingPlaceId).toBeNull();
    expect(current.version).toBe(r.version);
  });
});
