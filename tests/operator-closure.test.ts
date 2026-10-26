import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import {
  sessionOf,
  deskSession,
  addFlights,
  flightRow,
  registerWithPass,
} from "./helpers/fixtures";
import {
  createServiceRequest,
  actOnServiceRequest,
  serviceRequestHistory,
  changeRequestPlace,
  expireServiceRequests,
  registeredRequestProgress,
} from "@/lib/service-requests";
import { createCall, acceptCall, getCallAt, finishCall } from "@/lib/calls";
import { createAssist, advanceAssist, latestAssistOf } from "@/lib/assist";
import { mutateResource, resourceSnapshot } from "@/lib/dispatch-resources";
import { eraseRegistration, purge } from "@/lib/purge";
import { operationalSummary } from "@/lib/request-operations";
import type { ServiceRequestView } from "@/lib/service-request-model";
const now = kst("2026-10-26 09:40"),
  desk = deskSession(now),
  staff = sessionOf(now);
let db: Db,
  n = 0;
const summary = () =>
  operationalSummary(db, new Date(now.getTime() - 60000), now);
const receipt = () => (++n).toString(16).padStart(64, "0");
async function make(service = "guidance") {
  const key = receipt(),
    result = await createServiceRequest(
      db,
      null,
      {
        receipt: key,
        service,
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "",
        lang: "ko",
        consent: true,
      },
      "close:phone",
      now,
    );
  expect(result.status).toBe(200);
  return { key, request: result.body.request as ServiceRequestView };
}
async function current(id: string) {
  const [row] = await db.query<{ id: string; version: number; state: string }>(
    "select id,version,state from request_work_ledger where id=$1",
    [id],
  );
  return row;
}
const close = (
  r: { id: string; version: number },
  extra: Record<string, unknown> = {},
  s = desk,
  connection = db,
  at = now,
) =>
  actOnServiceRequest(
    connection,
    s,
    r.id,
    {
      version: r.version,
      action: "operator_cancel",
      confirmed: true,
      reason: "현장 확인 후 중복 접수 정리",
      ...extra,
    },
    at,
  );
async function registered() {
  return registerWithPass(db, now, { flightDate: "2026-10-26" });
}
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,dispatch_resources,service_request_limits,calls,assist_requests,registrations,passes,events,access_logs,flights,flight_polls cascade",
  );
  await addFlights(db, [flightRow("KE123", "2026-10-26 18:00")], now);
  n = 0;
});
describe("explicit operator closure", () => {
  it("rolls back retained cancellation if its operator record cannot be stored", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + call!.id);
    await db.exec(
      "alter table calls add constraint operator_audit_test check(operator_actor_zone is null)",
    );
    try {
      await expect(close(r)).rejects.toThrow();
    } finally {
      await db.exec("alter table calls drop constraint operator_audit_test");
    }
    expect((await current(r.id)).state).toBe("received");
    expect(
      (await serviceRequestHistory(db, desk, r.id, now)).body.history,
    ).toEqual([]);
  });
  it("keeps new request state intact if the operator audit trigger fails", async () => {
    const { request: r } = await make();
    await db.exec(
      "alter table service_request_history add constraint operator_audit_test check(action<>'operator_cancel')",
    );
    try {
      await expect(close(r)).rejects.toThrow();
    } finally {
      await db.exec(
        "alter table service_request_history drop constraint operator_audit_test",
      );
    }
    expect((await current(r.id)).state).toBe("received");
  });
  it("requires desk authority field confirmation and a bounded reason", async () => {
    const { request: r } = await make();
    expect((await close(r, {}, staff)).status).toBe(403);
    for (const extra of [
      { confirmed: false },
      { confirmed: "true" },
      { reason: " " },
      { reason: "x".repeat(121) },
    ])
      expect((await close(r, extra)).status).toBe(400);
    expect((await current(r.id)).state).toBe("received");
  });
  it("records new requests as cancelled rather than completed", async () => {
    const { request: r } = await make();
    const result = await close(r);
    expect(result.status).toBe(200);
    expect((await current(r.id)).state).toBe("cancelled");
    const totals = await summary();
    expect(totals.cancelled).toBe(1);
    expect(totals.done).toBe(0);
    const history = (await serviceRequestHistory(db, desk, r.id, now)).body
      .history as { action: string; actorZone: string; reason: string }[];
    expect(history.at(-1)).toMatchObject({
      action: "operator_cancel",
      actorZone: desk.zoneId,
      reason: "현장 확인 후 중복 접수 정리",
    });
  });
  it("clears a pending place and releases capacity without pretending completion", async () => {
    const { key, request: created } = await make("robot");
    let r = (
      await actOnServiceRequest(
        db,
        desk,
        created.id,
        { version: created.version, action: "assign" },
        now,
      )
    ).body.request as ServiceRequestView;
    const gear = await mutateResource(
      db,
      desk,
      {
        action: "create",
        label: "중단 검증 장비",
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
    r = { ...r, version: (await current(r.id)).version };
    const changed = await changeRequestPlace(
      db,
      null,
      { receipt: key, version: r.version, placeId: "cc-125" },
      now,
    );
    r = changed.body.request as ServiceRequestView;
    expect((await close(r)).status).toBe(200);
    const [row] = await db.query(
      "select pending_place_id,pending_place_at from service_requests where id=$1",
      [r.id],
    );
    expect(row).toEqual({ pending_place_id: null, pending_place_at: null });
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
  });
  it("closes retained calls atomically with a real operator record", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + call!.id);
    expect(
      (await serviceRequestHistory(db, desk, r.id, now)).body.history,
    ).toEqual([]);
    expect((await close(r)).status).toBe(200);
    expect((await getCallAt(db, call!.id, "cc-108"))?.state).toBe("cancelled");
    const history = (await serviceRequestHistory(db, desk, r.id, now)).body
      .history as { action: string; version: number; reason: string }[];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: "operator_cancel",
      version: r.version + 1,
      reason: "현장 확인 후 중복 접수 정리",
    });
    expect((await summary()).done).toBe(0);
  });
  it("closes retained mobility and updates the original passenger status and registration result", async () => {
    const { registration, pass } = await registered();
    const a = await createAssist(db, registration.id, "cc-center", now);
    const r = await current("assist:" + a!.id);
    expect((await close(r)).status).toBe(200);
    expect((await latestAssistOf(db, registration.id, now))?.state).toBe(
      "cancelled",
    );
    expect(
      (await registeredRequestProgress(db, pass.token, now)).body.requests,
    ).toMatchObject([{ state: "cancelled", service: "mobility" }]);
    expect(
      (await serviceRequestHistory(db, desk, r.id, now)).body.history,
    ).toHaveLength(1);
    expect(await db.query("select * from active_service_claims")).toHaveLength(
      0,
    );
  });
  it("enforces confirmation and desk authority on retained request paths too", async () => {
    const a = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + a!.id);
    expect((await close(r, {}, staff)).status).toBe(403);
    expect((await close(r, { confirmed: false })).status).toBe(400);
    expect((await close(r, { reason: "" })).status).toBe(400);
    expect((await current(r.id)).state).toBe("received");
  });
  it("uses a monotonic version even when an anonymous call gets its pass within five minutes", async () => {
    const a = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + a!.id);
    const { registration } = await registered();
    await createCall(
      db,
      "cc-108",
      registration.id,
      "guide",
      new Date(now.getTime() + 60000),
    );
    expect((await current(r.id)).version).toBeGreaterThan(r.version);
    expect((await close(r)).status).toBe(409);
    await db.query(
      "update calls set registration_id=registration_id where id=$1",
      [a!.id],
    );
    const unchanged = await current(r.id);
    await db.query(
      "update calls set registration_id=registration_id where id=$1",
      [a!.id],
    );
    expect((await current(r.id)).version).toBe(unchanged.version);
  });
  it("cannot race an old-path acceptance with a stale operator close", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + call!.id);
    let changed = false;
    const proxy: Db = {
      exec: db.exec.bind(db),
      query: async <T>(sql: string, params?: unknown[]) => {
        if (
          sql.includes("operator_closed_version=work_version+1") &&
          !changed
        ) {
          changed = true;
          await acceptCall(db, call!.id, staff.zoneId, now);
        }
        return db.query<T>(sql, params);
      },
    };
    expect((await close(r, {}, desk, proxy)).status).toBe(409);
    expect((await current(r.id)).state).toBe("serving");
    expect(
      (await serviceRequestHistory(db, desk, r.id, now)).body.history,
    ).toEqual([]);
  });
  it("uses atomic version guards for ordinary retained movement too", async () => {
    const { registration } = await registered(),
      a = await createAssist(db, registration.id, "cc-center", now);
    const id = "assist:" + a!.id;
    let r = await current(id);
    await actOnServiceRequest(
      db,
      staff,
      id,
      { version: r.version, action: "assign" },
      now,
    );
    r = await current(id);
    await advanceAssist(db, a!.id, staff.zoneId, "move", now);
    expect(
      (
        await actOnServiceRequest(
          db,
          staff,
          id,
          { version: r.version, action: "complete" },
          now,
        )
      ).status,
    ).toBe(409);
    expect((await current(id)).state).toBe("serving");
  });
  it("keeps the closure event version stable when free text expires", async () => {
    const call = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + call!.id);
    await close(r);
    const before = (await serviceRequestHistory(db, desk, r.id, now)).body
      .history as { version: number; reason: string }[];
    const at = new Date(now.getTime() + 25 * 3600000);
    await expireServiceRequests(db, at);
    const history = (await serviceRequestHistory(db, deskSession(at), r.id, at))
      .body.history as { version: number; reason: string }[];
    expect(history[0].version).toBe(before[0].version);
    expect(history[0].reason).toBe("");
  });
  it("erases retained closure reasons with registration data", async () => {
    const { registration } = await registered(),
      a = await createAssist(db, registration.id, "cc-center", now),
      r = await current("assist:" + a!.id);
    await close(r);
    await eraseRegistration(db, registration.id, now);
    expect(
      (await serviceRequestHistory(db, desk, r.id, now)).body.history,
    ).toMatchObject([{ reason: "", actorZone: desk.zoneId }]);
  });
  it("does not relabel already completed calls or automatic timeouts as operator closures", async () => {
    const a = await createCall(db, "cc-108", null, "guide", now);
    await finishCall(db, a!.id, staff.zoneId, now);
    expect((await close(await current("call:" + a!.id))).status).toBe(409);
    expect(
      (await serviceRequestHistory(db, desk, "call:" + a!.id, now)).body
        .history,
    ).toEqual([]);
    const b = await createCall(db, "cc-125", null, "guide", now),
      r = await current("call:" + b!.id),
      at = new Date(now.getTime() + 31 * 60000);
    expect((await close(r, {}, desk, db, at)).status).toBe(409);
    expect(
      (await serviceRequestHistory(db, desk, r.id, at)).body.history,
    ).toEqual([]);
  });
  it("rejects malformed legacy IDs and expired sessions without database casts", async () => {
    expect(
      (await close({ id: "call:" + "-".repeat(36), version: 0 })).status,
    ).toBe(400);
    const a = await createCall(db, "cc-108", null, "guide", now),
      r = await current("call:" + a!.id);
    expect((await close(r, {}, { ...desk, exp: now.getTime() })).status).toBe(
      401,
    );
  });
  it("purges old finished mobility metadata with the established retention window", async () => {
    const { registration } = await registered(),
      a = await createAssist(db, registration.id, "cc-center", now);
    await close(await current("assist:" + a!.id));
    await purge(db, new Date(now.getTime() + 91 * 86400000));
    expect(
      await db.query("select id from assist_requests where id=$1", [a!.id]),
    ).toHaveLength(0);
  });
});
