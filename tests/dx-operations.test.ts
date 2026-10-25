import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { migrate } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import {
  sessionOf,
  deskSession,
  addFlights,
  flightRow,
  registerWithPass,
  kioskSession,
} from "./helpers/fixtures";
import {
  createServiceRequest,
  actOnServiceRequest,
  listServiceRequests,
  serviceRequestHistory,
  registeredRequestProgress,
  expireServiceRequests,
} from "@/lib/service-requests";
import {
  nextRequestAction,
  requestStateLabel,
  type ServiceRequestView,
} from "@/lib/service-request-model";
import { createCall, acceptCall, getCallAt } from "@/lib/calls";
import { createAssist, advanceAssist, latestAssistOf } from "@/lib/assist";
import { todaySummary } from "@/lib/metrics";
import { eraseRegistration } from "@/lib/purge";
import type { ApiResult } from "@/lib/api/dto";
const now = kst("2026-10-25 14:00");
const desk = deskSession(now),
  staff = sessionOf(now),
  other = sessionOf(now, { zoneId: "cc-mid" });
let db: Db;
const receipt = (n = 1) => n.toString(16).padStart(64, "0");
const view = (result: ApiResult) =>
  (result.body as { request: ServiceRequestView }).request;
const make = async (n = 1, extra: Record<string, unknown> = {}) =>
  createServiceRequest(
    db,
    null,
    {
      receipt: receipt(n),
      service: "guidance",
      placeId: "cc-center",
      party: 1,
      choices: ["gd_large"],
      note: "지원 요청",
      lang: "ko",
      consent: true,
      ...extra,
    },
    "ops:phone",
    now,
  );
const act = (
  r: ServiceRequestView,
  action: string,
  s = staff,
  extra: Record<string, unknown> = {},
  at = now,
) =>
  actOnServiceRequest(
    db,
    s,
    r.id,
    { version: r.version, action, ...extra },
    at,
  );
const list = async (at = now, history = false, offset = 0) =>
  (await listServiceRequests(db, staff, at, { history, offset })).body as {
    requests: ServiceRequestView[];
    total: number;
  };
async function registered() {
  await addFlights(db, [flightRow("KE123", "2026-10-25 20:00")], now);
  return registerWithPass(db, now, { flightDate: "2026-10-25" });
}
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits,calls,assist_requests,passes,registrations,events,access_logs,flights,flight_polls restart identity cascade",
  );
});
describe("DX operational integration", () => {
  it("records creation once even when the accepted response is retried", async () => {
    const r = view(await make());
    await make();
    expect(
      (await serviceRequestHistory(db, staff, r.id, now)).body.history,
    ).toMatchObject([{ action: "created", version: 0, state: "received" }]);
    expect(
      await db.query("select * from service_request_history"),
    ).toHaveLength(1);
  });
  it("allows desk dispatch to another work zone and records actor separately", async () => {
    const r = view(await make());
    const assigned = view(await act(r, "assign", desk, { zoneId: "cc-mid" }));
    expect(assigned.assignedZone).toBe("cc-mid");
    expect(
      (await serviceRequestHistory(db, desk, r.id, now)).body.history,
    ).toMatchObject([
      {},
      { action: "assign", actorZone: desk.zoneId, assignedZone: "cc-mid" },
    ]);
    expect((await act(assigned, "serve", staff)).status).toBe(403);
  });
  it("rejects another-zone dispatch by ordinary staff and invalid target zones", async () => {
    const r = view(await make());
    expect((await act(r, "assign", staff, { zoneId: "cc-mid" })).status).toBe(
      403,
    );
    for (const zoneId of ["missing", "kiosk", "common"])
      expect((await act(r, "assign", desk, { zoneId })).status).toBe(400);
  });
  it("shortens staff guidance to acceptance, response and completion", async () => {
    let r = view(await make());
    r = view(await act(r, "assign"));
    expect(nextRequestAction(r)?.action).toBe("serve");
    r = view(await act(r, "serve"));
    r = view(await act(r, "complete"));
    expect(r.state).toBe("done");
  });
  it("retains travel and arrival for a visiting robot", async () => {
    let r = view(await make(1, { service: "robot" }));
    r = view(await act(r, "assign"));
    expect((await act(r, "serve")).status).toBe(409);
    expect(nextRequestAction(r)?.label).toContain("로봇");
    r = view(await act(r, "travel"));
    expect(requestStateLabel(r)).toContain("로봇 이동");
    r = view(await act(r, "arrive"));
    expect((await act(r, "serve")).status).toBe(200);
  });
  it("distinguishes mobility service from reaching the pickup", async () => {
    let r = view(await make(1, { service: "mobility" }));
    for (const step of ["assign", "travel", "arrive", "serve"])
      r = view(await act(r, step));
    expect(requestStateLabel(r)).toBe("이동지원 중");
  });
  it("records a handoff without restarting acceptance/service timestamps", async () => {
    let r = view(await make());
    r = view(await act(r, "assign"));
    r = view(await act(r, "serve"));
    const at = new Date(now.getTime() + 60000);
    const moved = view(
      await act(
        r,
        "transfer",
        desk,
        { zoneId: "cc-mid", reason: "교대 인계" },
        at,
      ),
    );
    expect(moved).toMatchObject({
      state: "serving",
      assignedZone: "cc-mid",
      version: 3,
    });
    expect(
      (
        await db.query<{ accepted_at: Date; started_at: Date }>(
          "select accepted_at,started_at from service_requests",
        )
      )[0],
    ).toEqual({ accepted_at: now, started_at: now });
    expect((await act(moved, "complete", staff, {}, at)).status).toBe(403);
    expect((await act(moved, "complete", other, {}, at)).status).toBe(200);
    expect(
      (await serviceRequestHistory(db, desk, r.id, at)).body.history,
    ).toMatchObject([
      {},
      {},
      {},
      {
        action: "transfer",
        reason: "교대 인계",
        actorZone: desk.zoneId,
        assignedZone: "cc-mid",
      },
      {},
    ]);
  });
  it("requires desk ownership, a changed target and a reason for handoff", async () => {
    const r = view(await act(view(await make()), "assign"));
    expect(
      (await act(r, "transfer", staff, { zoneId: "cc-mid", reason: "교대" }))
        .status,
    ).toBe(403);
    expect((await act(r, "transfer", desk, { zoneId: "cc-mid" })).status).toBe(
      400,
    );
    expect(
      (await act(r, "transfer", desk, { zoneId: staff.zoneId, reason: "교대" }))
        .status,
    ).toBe(400);
  });
  it("allows only one winner when two operators act on the same version", async () => {
    const r = view(await make());
    const results = await Promise.all([
      act(r, "assign", staff),
      act(r, "assign", other),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(
      await db.query("select * from service_request_history"),
    ).toHaveLength(2);
  });
  it("rolls back state changes if the atomic history insert fails", async () => {
    const r = view(await make());
    await db.exec(
      "alter table service_request_history add constraint audit_test check (action <> 'assign')",
    );
    try {
      await expect(act(r, "assign")).rejects.toThrow();
      expect(
        (
          await db.query<{ state: string }>(
            "select state from service_requests",
          )
        )[0].state,
      ).toBe("received");
    } finally {
      await db.exec(
        "alter table service_request_history drop constraint audit_test",
      );
    }
  });
  it("normalizes and handles previous calls in the same queue", async () => {
    const c = await createCall(db, "cc-center", null, "guide", now);
    let r = (await list()).requests.find((r) => r.id === `call:${c!.id}`)!;
    expect(r).toMatchObject({
      queue: "call",
      service: "guidance",
      state: "received",
    });
    expect((await act(r, "assign")).status).toBe(200);
    r = (await list()).requests[0];
    expect(r.state).toBe("serving");
    expect((await act(r, "complete")).status).toBe(200);
    expect((await getCallAt(db, c!.id, "cc-center"))?.state).toBe("done");
  });
  it("normalizes previous mobility and keeps its original passenger status in sync", async () => {
    const { registration } = await registered();
    const a = await createAssist(db, registration.id, "cc-center", now);
    let r = (await list()).requests.find((r) => r.id === `assist:${a!.id}`)!;
    for (const action of ["assign", "travel", "complete"]) {
      expect((await act(r, action)).status).toBe(200);
      r = (await list()).requests.find((x) => x.id === r.id)!;
    }
    expect((await latestAssistOf(db, registration.id, now))?.state).toBe(
      "done",
    );
  });
  it("does not count old accepted calls that timed out as completed", async () => {
    const c = await createCall(db, "cc-center", null, "guide", now);
    await acceptCall(db, c!.id, staff.zoneId, now);
    const at = new Date(now.getTime() + 91 * 60000);
    const result = await list(at);
    expect(result.requests[0].state).toBe("expired");
    expect((await todaySummary(db, at)).operations).toMatchObject({
      done: 0,
      expired: 1,
    });
  });
  it("does not count old assigned mobility timeouts as completed", async () => {
    const { registration } = await registered();
    const a = await createAssist(db, registration.id, "cc-center", now);
    await advanceAssist(db, a!.id, staff.zoneId, "assign", now);
    const at = new Date(now.getTime() + 181 * 60000);
    expect((await list(at)).requests[0].state).toBe("expired");
    expect((await todaySummary(db, at)).operations.done).toBe(0);
  });
  it("aggregates all three sources once in the shared dashboard", async () => {
    await make();
    await createCall(db, "cc-108", null, "guide", now);
    const { registration } = await registered();
    await createAssist(db, registration.id, "cc-center", now);
    const s = (await todaySummary(db, now)).operations;
    expect(s).toMatchObject({
      total: 3,
      linked: 1,
      byQueue: { integrated: 1, call: 1, assist: 1 },
      byService: { guidance: 2, robot: 0, mobility: 1 },
    });
  });
  it("finds completed records beyond the recent thirty minute list", async () => {
    let r = view(await make());
    for (const step of ["assign", "serve", "complete"])
      r = view(await act(r, step));
    const at = new Date(now.getTime() + 31 * 60000);
    expect((await list(at)).requests).toHaveLength(0);
    expect((await list(at, true)).requests).toHaveLength(1);
    expect((await list(at, true, 200)).requests).toHaveLength(0);
    expect((await list(at, true, 200)).total).toBe(1);
  });
  it("scrubs handoff free text when the request retention deadline ends", async () => {
    let r = view(await make());
    r = view(await act(r, "assign"));
    await act(r, "transfer", desk, { zoneId: "cc-mid", reason: "인계 내용" });
    await expireServiceRequests(db, new Date(now.getTime() + 86400001));
    expect(
      await db.query("select * from service_request_history where reason<>''"),
    ).toHaveLength(0);
    expect(
      (await list(new Date(now.getTime() + 86400001), true)).requests[0],
    ).toMatchObject({ note: "", choices: [], place: "" });
  });
  it("scrubs linked history reasons when the registration is erased", async () => {
    const { registration, pass } = await registered();
    let r = view(await make(1, { registrationToken: pass.token }));
    r = view(await act(r, "assign"));
    await act(r, "transfer", desk, { zoneId: "cc-mid", reason: "인계 내용" });
    await eraseRegistration(db, registration.id, now);
    expect(
      await db.query("select * from service_request_history where reason<>''"),
    ).toHaveLength(0);
  });
  it("keeps history behind staff authentication", async () => {
    const r = view(await make());
    expect((await serviceRequestHistory(db, null, r.id, now)).status).toBe(401);
    expect(
      (
        await serviceRequestHistory(
          db,
          kioskSession(now, "cc-center"),
          r.id,
          now,
        )
      ).status,
    ).toBe(401);
  });
  it("shows results through the original registration capability without exposing staff notes", async () => {
    const { pass } = await registered();
    let r = view(await make(1, { registrationToken: pass.token }));
    for (const step of ["assign", "serve", "complete"])
      r = view(await act(r, step));
    const result = await registeredRequestProgress(db, pass.token, now);
    expect(result.body.requests).toMatchObject([
      { state: "done", service: "guidance" },
    ]);
    expect(JSON.stringify(result.body)).not.toMatch(
      /actorZone|reason|지원 요청/,
    );
    expect((await registeredRequestProgress(db, "invalid", now)).status).toBe(
      410,
    );
  });
  it("blocks another new request while the same registration has an old request for that service", async () => {
    const { registration, pass } = await registered();
    await createAssist(db, registration.id, "cc-center", now);
    expect(
      (await make(1, { registrationToken: pass.token, service: "mobility" }))
        .status,
    ).toBe(409);
    expect(
      (await make(2, { registrationToken: pass.token, service: "robot" }))
        .status,
    ).toBe(200);
  });
  it("keeps anonymous registration linkage counts after personal links are erased", async () => {
    const { registration, pass } = await registered();
    await make(1, { registrationToken: pass.token });
    await eraseRegistration(db, registration.id, now);
    expect((await todaySummary(db, now)).operations.linked).toBe(1);
    expect(
      (
        await db.query<{ registration_id: string | null }>(
          "select registration_id from service_requests",
        )
      )[0].registration_id,
    ).toBeNull();
  });
  it("flags unattended and stalled work using operational review thresholds", async () => {
    const r = view(await make());
    const later = new Date(now.getTime() + 11 * 60000);
    expect((await todaySummary(db, later)).operations.awaitingAttention).toBe(
      1,
    );
    await act(r, "assign", staff, {}, later);
    expect(
      (await todaySummary(db, new Date(now.getTime() + 20 * 60000))).operations
        .awaitingAttention,
    ).toBe(0);
    expect(
      (await todaySummary(db, new Date(now.getTime() + 42 * 60000))).operations
        .awaitingAttention,
    ).toBe(1);
  });
  it("rejects closing another zone's old call through the unified API", async () => {
    await createCall(db, "cc-center", null, "guide", now);
    let r = (await list()).requests[0];
    await act(r, "assign");
    r = (await list()).requests[0];
    expect((await act(r, "complete", other)).status).toBe(403);
    expect((await act(r, "complete", staff)).status).toBe(200);
  });
  it("reapplying the additive schema does not invent past workflow events", async () => {
    const r = view(await make());
    await act(r, "assign");
    await migrate(db);
    expect(
      (await serviceRequestHistory(db, staff, r.id, now)).body.history,
    ).toMatchObject([{ action: "created" }, { action: "assign" }]);
  });
});
