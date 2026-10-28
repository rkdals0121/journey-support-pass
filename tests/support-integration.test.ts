import { eraseRegistration } from "@/lib/purge";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, kst } from "./helpers/db";
import {
  deskSession,
  sessionOf,
  registerWithPass,
  addFlights,
  flightRow,
} from "./helpers/fixtures";
import { seedZones } from "@/lib/zones";
import { migrate, type Db } from "@/lib/db";
import { maintainAlertQueue } from "@/lib/request-alerts";
import { kioskVisitAction } from "@/lib/support-visits";
import type { VisitView } from "@/lib/service-hubs";
import {
  bookVisit,
  changeVisit,
  visitStatus,
  staffVisits,
  staffVisitAction,
  updateHubRule,
} from "@/lib/support-visits";
import {
  actOnServiceRequest,
  createServiceRequest,
  listServiceRequests,
} from "@/lib/service-requests";
let db: Db;
const now = kst("2026-10-28 09:15"),
  receipt = (n: number) => n.toString(16).padStart(64, "0");
const get = (r: { body: Record<string, unknown> }) => r.body.visit as VisitView;
const book = (n = 1, time = "09:30", extra: Record<string, unknown> = {}) =>
  bookVisit(
    db,
    {
      receipt: receipt(n),
      consent: true,
      hubId: "concourse",
      service: "robot",
      task: "directions",
      party: 1,
      startAt: kst("2026-10-28 " + time).toISOString(),
      ...extra,
    },
    "browser:" + n,
    now,
  );
const act = (n: number, v: VisitView, action: string, at = now) =>
  changeVisit(
    db,
    {
      receipt: receipt(n),
      version: v.version,
      action,
      confirmed: action === "complete",
    },
    "browser:" + n,
    at,
  );
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate support_visits,support_hub_rules,support_crew,support_experience_events,service_requests,service_request_limits,dispatch_resources restart identity cascade",
  );
});

describe("audit regressions: one operational journey", () => {
  it("keeps one reference, schedules the reservation separately and alerts on arrival", async () => {
    let v = get(await book());
    expect(v.requestId).toBe(v.id);
    expect(
      (await db.query<{ kind: string }>("select kind from request_alerts"))[0]
        .kind,
    ).toBe("reservation");
    const before = await listServiceRequests(db, deskSession(now), now, {});
    expect((before.body.requests as unknown[]).length).toBe(0);
    v = get(await act(1, v, "checkin"));
    expect(
      (await db.query<{ kind: string }>("select kind from request_alerts"))[0]
        .kind,
    ).toBe("arrival");
    const after = await listServiceRequests(db, deskSession(now), now, {});
    expect(after.body.requests).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: v.id })]),
    );
    expect(get(await book()).id).toBe(v.id);
    expect(await db.query("select id from service_requests")).toHaveLength(1);
  });
  it("F01: does not run adjacent appointments on the same prototype unit", async () => {
    let one = get(await book()),
      two = get(await book(2, "10:00"));
    one = get(await act(1, one, "checkin"));
    expect((await act(1, one, "respond")).status).toBe(200);
    two = get(await act(2, two, "checkin", kst("2026-10-28 09:45")));
    expect((await act(2, two, "respond", kst("2026-10-28 09:45"))).status).toBe(
      409,
    );
    expect(get(await visitStatus(db, receipt(2), now)).state).toBe(
      "checked_in",
    );
    expect(
      await db.query("select id from support_visits where state='responding'"),
    ).toHaveLength(1);
  });
  it("keeps the unit occupied for its five-minute return allowance", async () => {
    let one = get(await book());
    one = get(await act(1, one, "checkin"));
    one = get(await act(1, one, "respond"));
    await act(1, one, "complete");
    let two = get(await book(2));
    two = get(await act(2, two, "checkin", kst("2026-10-28 09:16")));
    expect((await act(2, two, "respond", kst("2026-10-28 09:16"))).status).toBe(
      409,
    );
    expect((await act(2, two, "respond", kst("2026-10-28 09:21"))).status).toBe(
      200,
    );
  });
  it("F02: applies the same pause to reservations and on-site robot calls", async () => {
    await updateHubRule(
      db,
      deskSession(now),
      {
        hubId: "concourse",
        service: "robot",
        openHour: 9,
        closeHour: 18,
        capacity: 0,
        state: "paused",
        battery: 10,
        availableAfter: null,
        reason: "충전·혼잡 중지",
        version: 0,
      },
      now,
    );
    expect((await book()).status).toBe(409);
    const called = await createServiceRequest(
      db,
      null,
      {
        receipt: receipt(2),
        placeId: "cc-center",
        service: "robot",
        topicId: "robot",
        choices: [],
        party: 1,
        note: "",
        consent: true,
        lang: "ko",
        serviceDetails: { task: "robot-visit", fields: {} },
      },
      "onsite",
      now,
    );
    expect(called.status).toBe(409);
    expect(called.body.code).toBe("support_unavailable");
    expect(called.body.staffHref).toContain("guidance");
  });
  it("F04: one claim assigns the actual work and prevents a second staff claim", async () => {
    let v = get(await book());
    v = get(await act(1, v, "checkin"));
    const claimed = await staffVisitAction(
      db,
      deskSession(now),
      "one",
      { action: "claim", id: v.id, version: v.version },
      now,
    );
    expect(claimed.status).toBe(200);
    v = get(claimed);
    const [work] = await db.query<{
      state: string;
      assigned_crew: string;
      id: string;
    }>("select id,state,assigned_crew from service_requests where id=$1", [
      v.id,
    ]);
    expect(work.id).toBe(v.id);
    expect(work.state).toBe("assigned");
    expect(work.assigned_crew).toBe(v.assignedCrew);
    expect(
      (
        await staffVisitAction(
          db,
          deskSession(now),
          "two",
          { action: "claim", id: v.id, version: v.version },
          now,
        )
      ).status,
    ).toBe(409);
  });
  it("uses the same crew from the integrated work screen and rejects another operator's progress", async () => {
    let v = get(await book());
    v = get(await act(1, v, "checkin"));
    v = get(await act(1, v, "handover"));
    let [job] = await db.query<{ version: number }>(
      "select version from service_requests where id=$1",
      [v.id],
    );
    const accepted = await actOnServiceRequest(
      db,
      deskSession(now),
      v.id,
      { action: "assign", version: job.version },
      now,
      { crewKey: "one" },
    );
    expect(accepted.status).toBe(200);
    [job] = await db.query("select version from service_requests where id=$1", [
      v.id,
    ]);
    expect(
      (
        await actOnServiceRequest(
          db,
          deskSession(now),
          v.id,
          { action: "serve", version: job.version },
          now,
          { crewKey: "two" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await actOnServiceRequest(
          db,
          deskSession(now),
          v.id,
          { action: "serve", version: job.version },
          now,
          { crewKey: "one" },
        )
      ).status,
    ).toBe(200);
  });
  it("releases expired crew ownership and queues a new handover notification", async () => {
    let v = get(await book());
    v = get(await act(1, v, "checkin"));
    await staffVisitAction(
      db,
      deskSession(now),
      "one",
      { action: "claim", id: v.id, version: v.version },
      now,
    );
    const later = kst("2026-10-28 10:16"),
      result = await staffVisits(db, deskSession(later), "two", later);
    expect((result.body.visits as VisitView[])[0].assignedCrew).toBeNull();
    expect(
      (await db.query<{ kind: string }>("select kind from request_alerts"))[0]
        .kind,
    ).toBe("handover");
  });
  it("F06: distinguishes a late arrival from an early arrival", async () => {
    const v = get(await book()),
      late = await act(1, v, "checkin", kst("2026-10-28 09:46"));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("visit_late");
    expect(late.body.error).toContain("다른 시간");
  });
  it("F13: filters active work before pagination even with 150 historical rows", async () => {
    await db.query(
      "insert into support_visits(receipt_hash,hub_id,service,start_at,seat,state,task,party,created_at,updated_at,ended_at,device_key) select lpad(gs::text,64,'0'),'concourse','robot',$1,1,'cancelled','directions',1,$1,$2,$2,'fixture' from generate_series(1,150) gs",
      [kst("2026-10-28 09:00"), now],
    );
    const v = get(await book());
    const active = await staffVisits(db, deskSession(now), "one", now);
    expect((active.body.visits as VisitView[]).map((x) => x.id)).toEqual([
      v.id,
    ]);
    expect(active.body.total).toBe(1);
    const history = await staffVisits(db, deskSession(now), "one", now, {
      state: "all",
      offset: 20,
      limit: 20,
    });
    expect(history.body.total).toBe(151);
    expect(history.body.hasMore).toBe(true);
    const searched = await staffVisits(db, deskSession(now), "one", now, {
      state: "all",
      search: v.id,
    });
    expect(searched.body.visits as VisitView[]).toHaveLength(1);
  });
  it("does not let a kiosk session become an employee", async () => {
    expect(
      (
        await staffVisitAction(
          db,
          sessionOf(now, { isKiosk: true }),
          "one",
          { action: "claim", id: crypto.randomUUID(), version: 0 },
          now,
        )
      ).status,
    ).toBe(401);
  });
});

describe("upgrade, kiosk scope and failure recovery", () => {
  it("rolls back a booking when fulfilment creation fails", async () => {
    const broken: Db = {
      ...db,
      transaction: async (work) =>
        db.transaction!(async (tx) =>
          work({
            ...tx,
            query: async (sql, params) => {
              if (sql.startsWith("insert into service_requests"))
                throw Error("injected write failure");
              return tx.query(sql, params);
            },
          }),
        ),
    };
    await expect(
      bookVisit(
        broken,
        {
          receipt: receipt(1),
          consent: true,
          hubId: "concourse",
          service: "robot",
          task: "directions",
          party: 1,
          startAt: kst("2026-10-28 09:30").toISOString(),
        },
        "failure",
        now,
      ),
    ).rejects.toThrow("injected write failure");
    expect(await db.query("select id from support_visits")).toHaveLength(0);
  });
  it("uses the scheduled alert worker to release expired staff ownership", async () => {
    let v = get(await book());
    v = get(await act(1, v, "checkin"));
    await staffVisitAction(
      db,
      deskSession(now),
      "one",
      { action: "claim", id: v.id, version: v.version },
      now,
    );
    await maintainAlertQueue(db, kst("2026-10-28 10:16"));
    expect(
      (
        await db.query<{ assigned_crew: string | null }>(
          "select assigned_crew from service_requests where id=$1",
          [v.id],
        )
      )[0].assigned_crew,
    ).toBeNull();
  });
  it("keeps unavailable inventory out of future appointments without treating busy as broken", async () => {
    const v = get(await book());
    await db.query(
      "update dispatch_resources set status='maintenance' where hub_id='concourse'",
    );
    expect((await book(2, "10:00")).status).toBe(409);
    await db.query(
      "update dispatch_resources set status='ready' where hub_id='concourse'",
    );
    expect((await book(2, "10:00")).status).toBe(200);
    expect(v.id).toBeTruthy();
  });
  it("finds today's reference only at the installed meeting point and never exposes a private receipt", async () => {
    const v = get(await book()),
      kiosk = sessionOf(now, { isKiosk: true, placeId: "cc-center" });
    const result = await kioskVisitAction(
      db,
      kiosk,
      { action: "lookup", reference: v.id.slice(0, 8).toUpperCase() },
      "kiosk",
      now,
    );
    expect(result.status).toBe(200);
    expect(result.body.receipt).toBeUndefined();
    expect(get(result).id).toBe(v.id);
    expect(
      (
        await kioskVisitAction(
          db,
          sessionOf(now, { isKiosk: true, placeId: "t2-help" }),
          { action: "lookup", reference: v.id.slice(0, 8) },
          "kiosk",
          now,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await kioskVisitAction(
          db,
          kiosk,
          { action: "checkin", id: v.id, version: v.version },
          "kiosk",
          now,
        )
      ).status,
    ).toBe(200);
  });
  it("upgrades an existing reservation in place and preserves its reference and capability", async () => {
    const v = get(await book());
    await db.query("delete from service_requests where id=$1", [v.id]);
    await db.query("update support_visits set request_id=null where id=$1", [
      v.id,
    ]);
    await migrate(db);
    await migrate(db);
    const upgraded = get(await visitStatus(db, receipt(1), now));
    expect(upgraded.id).toBe(v.id);
    expect(upgraded.requestId).toBe(v.id);
    expect(
      await db.query("select id from service_requests where visit_id=$1", [
        v.id,
      ]),
    ).toHaveLength(1);
    expect((await act(1, upgraded, "checkin")).status).toBe(200);
  });
});

describe("single record through human completion and legacy handover", () => {
  it("preserves one public reference through staff completion and records handover metrics", async () => {
    let v = get(await book());
    v = get(await act(1, v, "checkin"));
    v = get(await act(1, v, "handover"));
    await staffVisitAction(
      db,
      deskSession(now),
      "one",
      { action: "claim", id: v.id, version: v.version },
      now,
    );
    for (const action of ["serve", "complete"]) {
      const [job] = await db.query<{ version: number }>(
        "select version from service_requests where id=$1",
        [v.id],
      );
      const result = await actOnServiceRequest(
        db,
        deskSession(now),
        v.id,
        {
          action,
          version: job.version,
          ...(action === "complete"
            ? {
                resolution: {
                  kind: "resolved",
                  confirmed: true,
                  message: "지원 완료",
                },
              }
            : {}),
        },
        now,
        { crewKey: "one" },
      );
      expect(result.status).toBe(200);
    }
    v = get(await visitStatus(db, receipt(1), now));
    expect(v.state).toBe("done");
    expect(v.handedOverAt).toBeTruthy();
    expect(v.requestId).toBe(v.id);
    expect(await db.query("select id from service_requests")).toHaveLength(1);
  });
  it("preserves pre-upgrade handovers whose fulfilment ID differs from the appointment", async () => {
    let v = get(await book());
    v = get(await act(1, v, "checkin"));
    v = get(await act(1, v, "handover"));
    const oldJobId = crypto.randomUUID();
    await db.query("delete from service_request_history where request_id=$1", [
      v.id,
    ]);
    await db.query("delete from request_alerts where request_id=$1", [v.id]);
    await db.query("update service_requests set id=$2 where id=$1", [
      v.id,
      oldJobId,
    ]);
    await db.query("update support_visits set request_id=$2 where id=$1", [
      v.id,
      oldJobId,
    ]);
    await migrate(db);
    v = get(await visitStatus(db, receipt(1), now));
    expect(v.requestId).toBe(oldJobId);
    expect(
      (
        await staffVisitAction(
          db,
          deskSession(now),
          "one",
          { action: "claim", id: v.id, version: v.version },
          now,
        )
      ).status,
    ).toBe(200);
    const [job] = await db.query<{ assigned_crew: string; version: number }>(
      "select assigned_crew,version from service_requests where id=$1",
      [oldJobId],
    );
    expect(job.assigned_crew).toBeTruthy();
  });
});

it("erases registered support snapshots and free-text histories together", async () => {
  await addFlights(db, [flightRow("KE123", "2026-10-28 12:00")], now);
  const { registration, pass } = await registerWithPass(db, now, {
    flightDate: "2026-10-28",
    flightNo: "KE123",
  });
  let v = get(
    await book(1, "09:30", {
      registrationToken: pass.token,
      recognition: "private coat",
    }),
  );
  expect(v.registrationId).toBe(registration.id);
  expect(v.choices.length).toBeGreaterThan(0);
  v = get(await act(1, v, "checkin"));
  await staffVisitAction(
    db,
    deskSession(now),
    "one",
    { action: "delay", id: v.id, version: v.version, reason: "private delay" },
    now,
  );
  await eraseRegistration(db, registration.id, now, "revoked");
  const [snapshot] = await db.query<{
    recognition: string;
    notice: string;
    choices: string[];
    registration_id: null;
    state: string;
  }>(
    "select recognition,notice,choices,registration_id,state from support_visits where id=$1",
    [v.id],
  );
  expect(snapshot).toMatchObject({
    recognition: "",
    notice: "",
    choices: [],
    registration_id: null,
    state: "cancelled",
  });
  expect(
    await db.query(
      "select visit_id from support_visit_history where reason<>'' and visit_id=$1",
      [v.id],
    ),
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ note: string }>(
        "select note from service_requests where id=$1",
        [v.id],
      )
    )[0].note,
  ).toBe("");
});
