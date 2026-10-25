import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { migrate } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import { deskSession, sessionOf, kioskSession } from "./helpers/fixtures";
import {
  mutateResource,
  listResources,
  resourceSnapshot,
} from "@/lib/dispatch-resources";
import {
  createServiceRequest,
  actOnServiceRequest,
  cancelServiceRequest,
  serviceRequestHistory,
  expireServiceRequests,
} from "@/lib/service-requests";
import type { DispatchResource } from "@/lib/resource-model";
import type { ServiceRequestView } from "@/lib/service-request-model";
import type { ApiResult } from "@/lib/api/dto";
const now = kst("2026-10-26 10:00"),
  desk = deskSession(now),
  staff = sessionOf(now),
  other = sessionOf(now, { zoneId: "cc-mid" });
let db: Db;
const request = (res: ApiResult) => res.body.request as ServiceRequestView;
const receipt = (n: number) => n.toString(16).padStart(64, "0");
const mutate = (body: Record<string, unknown>, s = desk) =>
  mutateResource(db, s, body, now);
async function gear(label = "모의 로봇 01", kind = "robot") {
  const created = await mutate({
    action: "create",
    label,
    kind,
    zoneId: "cc-center",
  });
  expect(created.status).toBe(200);
  return (await resourceSnapshot(db)).find((r) => r.id === created.body.id)!;
}
async function job(n = 1, service = "robot") {
  const created = request(
    await createServiceRequest(
      db,
      null,
      {
        receipt: receipt(n),
        service,
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "",
        lang: "ko",
        consent: true,
      },
      `resource:device${n}`,
      now,
    ),
  );
  return request(
    await actOnServiceRequest(
      db,
      staff,
      created.id,
      { action: "assign", version: created.version },
      now,
    ),
  );
}
const allocate = (
  j: ServiceRequestView,
  g: DispatchResource | null,
  s = desk,
) =>
  mutate(
    {
      action: "allocate",
      requestId: j.id,
      version: j.version,
      resourceId: g?.id ?? null,
    },
    s,
  );
async function current(id: string) {
  const [row] = await db.query<{ version: number; resource_id: string | null }>(
    "select version,resource_id from service_requests where id=$1",
    [id],
  );
  return row;
}
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,dispatch_resources,service_request_limits cascade",
  );
});
describe("internal resource dispatch", () => {
  it("creates an empty explicit inventory and restricts access", async () => {
    expect((await listResources(db, staff, now)).body.resources).toEqual([]);
    expect((await listResources(db, null, now)).status).toBe(401);
    expect(
      (await listResources(db, kioskSession(now, "cc-center"), now)).status,
    ).toBe(401);
    expect(
      (await listResources(db, { ...staff, needsZone: true }, now)).status,
    ).toBe(409);
    expect(
      (
        await mutate(
          { action: "create", label: "x", kind: "robot", zoneId: "cc-center" },
          staff,
        )
      ).status,
    ).toBe(403);
  });
  it("validates inventory kinds labels zones and duplicate names", async () => {
    const g = await gear();
    expect((await gear("모의 이동지원 01", "mobility")).kind).toBe("mobility");
    expect(
      (
        await mutate({
          action: "create",
          label: g.label,
          kind: "robot",
          zoneId: "cc-center",
        })
      ).status,
    ).toBe(409);
    for (const extra of [
      { label: " " },
      { label: "x".repeat(41) },
      { kind: "guidance" },
      { zoneId: "unknown" },
    ]) {
      expect(
        (
          await mutate({
            action: "create",
            label: "new",
            kind: "robot",
            zoneId: "cc-center",
            ...extra,
          })
        ).status,
      ).toBe(400);
    }
  });
  it("allocates atomically and records a work-history event", async () => {
    const g = await gear(),
      j = await job();
    expect((await allocate(j, g)).status).toBe(200);
    expect((await current(j.id)).resource_id).toBe(g.id);
    const rows = await resourceSnapshot(db);
    expect(rows[0].requestId).toBe(j.id);
    const history = (await serviceRequestHistory(db, staff, j.id, now)).body
      .history as { action: string; reason: string }[];
    expect(history.at(-1)).toMatchObject({
      action: "resource_assign",
      reason: "장비 배차: " + g.label,
    });
  });
  it("allows only one winner when two requests seek the same device", async () => {
    const g = await gear(),
      a = await job(1),
      b = await job(2);
    const results = await Promise.all([allocate(a, g), allocate(b, g)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await db.query("select id from service_requests where resource_id=$1", [
          g.id,
        ])
      ).length,
    ).toBe(1);
  });
  it("protects devices from duplicate leases even outside the allocation helper", async () => {
    const g = await gear(),
      a = await job(1),
      b = await job(2);
    await allocate(a, g);
    await expect(
      db.query("update service_requests set resource_id=$2 where id=$1", [
        b.id,
        g.id,
      ]),
    ).rejects.toThrow();
  });
  it("rejects maintenance offline and incompatible devices", async () => {
    const g = await gear(),
      j = await job(),
      m = await gear("이동지원 장비", "mobility");
    expect((await allocate(j, m)).status).toBe(400);
    expect(
      (
        await mutate({
          action: "status",
          id: g.id,
          version: g.version,
          status: "maintenance",
        })
      ).status,
    ).toBe(200);
    expect((await allocate(j, g)).status).toBe(409);
    const updated = (await resourceSnapshot(db)).find((r) => r.id === g.id)!;
    await mutate({
      action: "status",
      id: g.id,
      version: updated.version,
      status: "offline",
    });
    expect((await allocate(j, g)).status).toBe(409);
  });
  it("denies unrelated staff and allows the owning zone", async () => {
    const g = await gear(),
      j = await job();
    expect((await allocate(j, g, other)).status).toBe(403);
    expect((await allocate(j, g, staff)).status).toBe(200);
    expect(
      (
        await mutate(
          { action: "status", id: g.id, version: g.version, status: "offline" },
          staff,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects malformed payloads and unsupported operations without database errors", async () => {
    for (const body of [
      { action: "allocate", requestId: "x", resourceId: null, version: 0 },
      {
        action: "allocate",
        requestId: crypto.randomUUID(),
        resourceId: "x",
        version: 0,
      },
      {
        action: "status",
        id: crypto.randomUUID(),
        version: 0,
        status: "broken",
      },
      { action: "create", label: "x", kind: "robot" },
      { action: "unknown" },
    ])
      expect((await mutate(body)).status).toBe(400);
    expect(
      (await mutateResource(db, null, { action: "create" }, now)).status,
    ).toBe(401);
  });
  it("rejects guidance equipment and devices based in inactive zones", async () => {
    const g = await gear(),
      j = await job(1, "guidance");
    expect((await allocate(j, g)).status).toBe(400);
    const robot = await job(2);
    await db.query("update zones set active=false where id='cc-center'");
    try {
      expect((await allocate(robot, g)).status).toBe(409);
      expect((await resourceSnapshot(db))[0].status).toBe("offline");
    } finally {
      await db.query("update zones set active=true where id='cc-center'");
    }
  });
  it("guards inventory versions and releases unavailable requests", async () => {
    const g = await gear(),
      j = await job();
    expect(
      (
        await mutate({
          action: "status",
          id: g.id,
          version: g.version + 1,
          status: "offline",
        })
      ).status,
    ).toBe(409);
    await allocate(j, g);
    expect(
      (
        await actOnServiceRequest(
          db,
          desk,
          j.id,
          {
            version: (await current(j.id)).version,
            action: "unavailable",
            reason: "장비 운영 점검",
          },
          now,
        )
      ).status,
    ).toBe(200);
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
  });
  it("uses request versions to prevent replacing newer decisions", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    expect((await allocate(j, null)).status).toBe(409);
    expect(
      (await allocate({ ...j, version: (await current(j.id)).version }, null))
        .status,
    ).toBe(200);
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
  });
  it("does not change the state of an allocated resource", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    expect(
      (
        await mutate({
          action: "status",
          id: g.id,
          version: g.version,
          status: "maintenance",
        })
      ).status,
    ).toBe(409);
    expect((await resourceSnapshot(db))[0].status).toBe("ready");
  });
  it("serializes a status change against a concurrent allocation", async () => {
    const g = await gear(),
      j = await job();
    const results = await Promise.all([
      mutate({
        action: "status",
        id: g.id,
        version: g.version,
        status: "maintenance",
      }),
      allocate(j, g),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const [row] = await resourceSnapshot(db);
    expect(row.status === "ready" || row.requestId === null).toBe(true);
  });
  it("releases capacity on passenger cancellation", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    expect((await cancelServiceRequest(db, receipt(1), now)).status).toBe(200);
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
    expect((await allocate(await job(2), g)).status).toBe(200);
  });
  it("preserves equipment through handoff and releases capacity on completion", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    let r = { ...j, version: (await current(j.id)).version };
    r = request(
      await actOnServiceRequest(
        db,
        desk,
        r.id,
        {
          version: r.version,
          action: "transfer",
          zoneId: "cc-mid",
          reason: "교대",
        },
        now,
      ),
    );
    expect((await current(j.id)).resource_id).toBe(g.id);
    for (const action of ["travel", "arrive", "serve", "complete"]) {
      r = request(
        await actOnServiceRequest(
          db,
          other,
          r.id,
          { version: r.version, action },
          now,
        ),
      );
    }
    expect(r.state).toBe("done");
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
    expect((await allocate(await job(2), g)).status).toBe(200);
  });
  it("releases equipment on reopen and prevents replacement after departure", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    let r = request(
      await actOnServiceRequest(
        db,
        desk,
        j.id,
        { version: (await current(j.id)).version, action: "reopen" },
        now,
      ),
    );
    expect((await current(j.id)).resource_id).toBeNull();
    r = request(
      await actOnServiceRequest(
        db,
        staff,
        r.id,
        { version: r.version, action: "assign" },
        now,
      ),
    );
    await allocate(r, g);
    r = { ...r, version: (await current(j.id)).version };
    r = request(
      await actOnServiceRequest(
        db,
        staff,
        r.id,
        { version: r.version, action: "travel" },
        now,
      ),
    );
    expect((await allocate(r, null)).status).toBe(409);
  });
  it("releases timed-out requests when inventory is refreshed", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    const later = new Date(now.getTime() + 4 * 3600000);
    expect((await listResources(db, desk, later)).status).toBe(200);
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
  });
  it("does not commit allocation if atomic history writing fails", async () => {
    const g = await gear(),
      j = await job();
    await db.exec(
      "alter table service_request_history add constraint reject_resource_test check(action<>'resource_assign')",
    );
    try {
      await expect(allocate(j, g)).rejects.toThrow();
    } finally {
      await db.exec(
        "alter table service_request_history drop constraint reject_resource_test",
      );
    }
    expect((await current(j.id)).resource_id).toBeNull();
    expect((await current(j.id)).version).toBe(j.version);
  });
  it("scrubs allocation free text at expiry and supports repeated migration", async () => {
    const g = await gear(),
      j = await job();
    await allocate(j, g);
    await migrate(db);
    await migrate(db);
    await expireServiceRequests(db, new Date(now.getTime() + 25 * 3600000));
    expect((await resourceSnapshot(db))[0].requestId).toBeNull();
    expect(
      await db.query(
        "select reason from service_request_history where request_id=$1 and reason<>''",
        [j.id],
      ),
    ).toEqual([]);
  });
});
