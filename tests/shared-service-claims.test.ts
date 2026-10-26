import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import type { Db } from "@/lib/db";
import { migrate } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import {
  addFlights,
  flightRow,
  registerWithPass,
  kioskSession,
  sessionOf,
} from "./helpers/fixtures";
import {
  createServiceRequest,
  cancelServiceRequest,
  listServiceRequests,
  expireServiceRequests,
} from "@/lib/service-requests";
import { createCall, cancelCall, acceptCall } from "@/lib/calls";
import { createAssist, cancelAssist } from "@/lib/assist";
import { callHandler } from "@/lib/api/kiosk";
import { assistRequestHandler } from "@/lib/api/entry";
import { eraseRegistration } from "@/lib/purge";
import {
  historicalServiceConflicts,
  isServiceClaimConflict,
  claimAware,
} from "@/lib/service-claims";
const now = kst("2026-10-26 09:00"),
  staff = sessionOf(now),
  kiosk = kioskSession(now, "cc-108");
let db: Db,
  counter = 0;
const receipt = () => (++counter).toString(16).padStart(64, "0");
async function registered() {
  return registerWithPass(db, now, { flightDate: "2026-10-26" });
}
const make = (token?: string, service = "guidance", connection = db) =>
  createServiceRequest(
    connection,
    null,
    {
      receipt: receipt(),
      registrationToken: token,
      service,
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "",
      lang: "ko",
      consent: true,
    },
    "claim:phone",
    now,
  );
const live = () =>
  db.query<{ id: string; service: string; registration_id: string }>(
    "select id,service,registration_id from request_work_ledger where state in ('received','assigned','en_route','arrived','serving')",
  );
const claims = () =>
  db.query<{
    registration_id: string;
    service: string;
    owner_id: string | null;
  }>("select * from active_service_claims");
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate calls,assist_requests,service_requests,service_request_limits,registrations,passes,events,access_logs,flights,flight_polls restart identity cascade",
  );
  await addFlights(db, [flightRow("KE123", "2026-10-26 18:00")], now);
  counter = 0;
});
describe("shared active service claims", () => {
  it("lets only one registered guidance writer win across old and new paths", async () => {
    const { registration, pass } = await registered();
    const results = await Promise.all([
      make(pass.token),
      callHandler(db, kiosk, { token: pass.token }, now),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await live()).toHaveLength(1);
    expect(await claims()).toHaveLength(1);
    expect((await claims())[0]).toMatchObject({
      registration_id: registration.id,
      service: "guidance",
    });
  });
  it("lets only one mobility writer win across old and new paths", async () => {
    const { pass } = await registered();
    const results = await Promise.all([
      make(pass.token, "mobility"),
      assistRequestHandler(db, kiosk, { token: pass.token }, now),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await live()).toHaveLength(1);
    expect(await claims()).toHaveLength(1);
  });
  it("rejects the cached mobility endpoint after an integrated request already exists", async () => {
    const { pass } = await registered();
    expect((await make(pass.token, "mobility")).status).toBe(200);
    const result = await assistRequestHandler(
      db,
      kiosk,
      { token: pass.token },
      now,
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("duplicate_service");
    expect(await db.query("select id from assist_requests")).toHaveLength(0);
  });
  it("closes the check-then-insert window without keeping quota or orphan alerts", async () => {
    const { registration, pass } = await registered();
    let inserted = false;
    const proxy: Db = {
      exec: db.exec.bind(db),
      query: async <T>(sql: string, params?: unknown[]) => {
        if (sql.includes("with quota as") && !inserted) {
          inserted = true;
          await createCall(db, "cc-108", registration.id, "guide", now);
        }
        return db.query<T>(sql, params);
      },
    };
    const result = await make(pass.token, "guidance", proxy);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("duplicate_service");
    expect(
      await db.query("select used from service_request_limits"),
    ).toHaveLength(0);
    expect(
      await db.query("select request_id from request_alerts"),
    ).toHaveLength(0);
    expect(await live()).toHaveLength(1);
  });
  it("protects raw old inserts even when application prechecks are bypassed", async () => {
    const { registration, pass } = await registered();
    await make(pass.token);
    await expect(
      db.query(
        "insert into calls(created_at,place_id,zone_id,registration_id,screen) values($1,'cc-108','cc-center',$2,'guide')",
        [now, registration.id],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "active_service_claims_pkey",
    });
  });
  it("does not relink an anonymous kiosk call to a registration with an active same-service request", async () => {
    const anonymous = await createCall(db, "cc-108", null, "guide", now);
    const { pass } = await registered();
    await make(pass.token);
    expect(
      (await callHandler(db, kiosk, { token: pass.token }, now)).status,
    ).toBe(409);
    expect(
      (
        await db.query("select registration_id from calls where id=$1", [
          anonymous!.id,
        ])
      )[0].registration_id,
    ).toBeNull();
    expect(await claims()).toHaveLength(1);
  });
  it("keeps idempotent source retries and does not orphan a claim on a skipped insert", async () => {
    const { registration, pass } = await registered();
    const first = await createCall(db, "cc-108", registration.id, "guide", now);
    expect(
      (await createCall(db, "cc-108", registration.id, "guide", now))?.id,
    ).toBe(first?.id);
    expect(await claims()).toHaveLength(1);
    await cancelCall(db, first!.id, "cc-108", now);
    const made = await make(pass.token),
      j = made.body.request as { id: string };
    const second = await registered();
    await db.query(
      `insert into service_requests(receipt_hash,registration_id,service,place_id,party,lang,source,created_at,updated_at,expires_at,device_key)
      select receipt_hash,$2,service,place_id,party,lang,source,created_at,updated_at,expires_at,device_key
      from service_requests where id=$1 on conflict do nothing`,
      [j.id, second.registration.id],
    );
    expect(await claims()).toHaveLength(1);
    expect((await claims())[0].registration_id).toBe(registration.id);
  });
  it("releases registered requests on cancellation across all three sources", async () => {
    const { registration, pass } = await registered();
    await make(pass.token);
    expect(await claims()).toHaveLength(1);
    await cancelServiceRequest(db, counter.toString(16).padStart(64, "0"), now);
    expect(await claims()).toHaveLength(0);
    const call = await createCall(db, "cc-108", registration.id, "guide", now);
    await cancelCall(db, call!.id, "cc-108", now);
    expect(await claims()).toHaveLength(0);
    await createAssist(db, registration.id, "cc-center", now);
    await cancelAssist(db, registration.id, now);
    expect(await claims()).toHaveLength(0);
    expect((await make(pass.token)).status).toBe(200);
  });
  it("reassigns a waiting legacy call to the next passenger without leaking the old claim", async () => {
    const first = await registered(),
      second = await registered();
    const call = await createCall(
      db,
      "cc-108",
      first.registration.id,
      "guide",
      now,
    );
    const replaced = await createCall(
      db,
      "cc-108",
      second.registration.id,
      "guide",
      now,
    );
    expect(replaced?.id).toBe(call?.id);
    expect(await claims()).toHaveLength(1);
    expect((await claims())[0].registration_id).toBe(second.registration.id);
    expect((await make(first.pass.token)).status).toBe(200);
  });
  it("permits different services and independently submitted anonymous requests", async () => {
    const { registration } = await registered();
    await createCall(db, "cc-108", registration.id, "guide", now);
    await createAssist(db, registration.id, "cc-center", now);
    expect(await claims()).toHaveLength(2);
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(200);
  });
  it("does not release a claim during ordinary acceptance or arrival changes", async () => {
    const { registration } = await registered();
    const call = await createCall(db, "cc-108", registration.id, "guide", now);
    await acceptCall(db, call!.id, "cc-end", now);
    expect((await claims())[0].owner_id).toBe("call:" + call!.id);
  });
  it("releases request claims when personal registration information is erased or an active source is deleted", async () => {
    const { registration, pass } = await registered();
    await make(pass.token);
    await eraseRegistration(db, registration.id, now);
    expect(await claims()).toHaveLength(0);
    const next = await registered();
    const call = await createCall(
      db,
      "cc-108",
      next.registration.id,
      "guide",
      now,
    );
    await db.query("delete from calls where id=$1", [call!.id]);
    expect(await claims()).toHaveLength(0);
  });
  it("releases timed-out integrated requests", async () => {
    const { pass } = await registered();
    await make(pass.token);
    await expireServiceRequests(db, new Date(now.getTime() + 3600001));
    expect(await claims()).toHaveLength(0);
  });
  it("quarantines historic duplicates without deleting or completing any request", async () => {
    const { registration, pass } = await registered();
    const first = await createCall(db, "cc-108", registration.id, "guide", now);
    await db.exec(
      "alter table calls disable trigger active_service_claim_trigger",
    );
    let second: string;
    try {
      const [row] = await db.query<{ id: string }>(
        "insert into calls(created_at,place_id,zone_id,registration_id,screen) values($1,'cc-125','cc-mid',$2,'guide') returning id",
        [now, registration.id],
      );
      second = row.id;
      await db.exec("truncate active_service_claims");
    } finally {
      await db.exec(
        "alter table calls enable trigger active_service_claim_trigger",
      );
    }
    await migrate(db);
    await migrate(db);
    expect(await live()).toHaveLength(2);
    expect((await claims())[0].owner_id).toBeNull();
    expect(
      await historicalServiceConflicts(db, [
        "call:" + first!.id,
        "call:" + second,
      ]),
    ).toEqual({ ["call:" + first!.id]: 2, ["call:" + second]: 2 });
    expect(
      (
        await callHandler(
          db,
          { ...kiosk, placeId: "t1-info" },
          { token: pass.token },
          now,
        )
      ).status,
    ).toBe(409);
    const listed = await listServiceRequests(db, staff, now);
    expect(JSON.stringify(listed.body.historicalConflicts)).not.toContain(
      registration.id,
    );
    await cancelCall(db, first!.id, "cc-108", now);
    expect((await claims())[0].owner_id).toBeNull();
    await cancelCall(db, second, "cc-125", now);
    expect(await claims()).toHaveLength(0);
    expect((await make(pass.token)).status).toBe(200);
  });
  it("recognizes only the shared claim constraint and never hides unrelated database failures", async () => {
    expect(
      isServiceClaimConflict({
        code: "23505",
        constraint: "active_service_claims_pkey",
      }),
    ).toBe(true);
    expect(
      isServiceClaimConflict({ code: "23505", constraint: "another_index" }),
    ).toBe(false);
    await expect(
      claimAware(async () => {
        throw new Error("database disconnected");
      }),
    ).rejects.toThrow("database disconnected");
  });
});
