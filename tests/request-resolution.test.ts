import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  createServiceRequest,
  actOnServiceRequest,
  serviceRequestStatus,
  serviceRequestHistory,
  expireServiceRequests,
  registeredRequestProgress,
  listServiceRequests,
} from "@/lib/service-requests";
import { parseResolution, RESOLUTION_KINDS } from "@/lib/request-resolution";
import type { ServiceRequestView } from "@/lib/service-request-model";
import type { Db } from "@/lib/db";
import type { ApiResult } from "@/lib/api/dto";
import { seedZones } from "@/lib/zones";
import { eraseRegistration } from "@/lib/purge";
import { createTestDb, kst } from "./helpers/db";
import {
  sessionOf,
  deskSession,
  addFlights,
  flightRow,
  registerWithPass,
} from "./helpers/fixtures";
const now = kst("2026-10-26 14:00"),
  staff = sessionOf(now),
  desk = deskSession(now),
  other = sessionOf(now, { zoneId: "cc-mid" });
let db: Db;
const receipt = "a".repeat(64),
  get = (r: ApiResult) => (r.body as { request: ServiceRequestView }).request;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits,assist_requests,calls,events,access_logs,passes,registrations,flights,flight_polls restart identity cascade",
  );
});
const act = (
  r: ServiceRequestView,
  action: string,
  extra: Record<string, unknown> = {},
  s = staff,
) =>
  actOnServiceRequest(
    db,
    s,
    r.id,
    { version: r.version, action, ...extra },
    now,
  );
async function create(extra: Record<string, unknown> = {}) {
  const result = await createServiceRequest(
    db,
    null,
    {
      receipt,
      service: "guidance",
      topicId: "facility",
      placeId: "cc-center",
      party: 1,
      note: "",
      choices: [],
      lang: "ko",
      consent: true,
      ...extra,
    },
    "test-device",
    now,
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return get(result);
}
async function serving(extra: Record<string, unknown> = {}) {
  let r = await create(extra);
  r = get(await act(r, "assign"));
  return get(await act(r, "serve"));
}
const resolution = (kind = "handoff") => ({
  kind,
  businessId: "cleaning-t1",
  message: "담당 직원이 문의를 인계받았습니다.",
  confirmed: true,
});
describe("department classification and actual handling results", () => {
  it("requires a result for a referral enquiry and leaves it open when missing", async () => {
    const r = await serving();
    expect((await act(r, "complete")).status).toBe(400);
    expect(get(await serviceRequestStatus(db, receipt, now)).state).toBe(
      "serving",
    );
  });
  it.each(RESOLUTION_KINDS)(
    "persists %s as a distinct public outcome with an atomic audit entry",
    async (kind) => {
      const r = await serving();
      const completed = await act(r, "complete", {
        resolution: resolution(kind),
      });
      expect(completed.status).toBe(200);
      expect(get(completed)).toMatchObject({
        state: "done",
        resolution: {
          kind,
          businessId: "cleaning-t1",
          message: resolution().message,
        },
      });
      expect(
        get(await serviceRequestStatus(db, receipt, now)).resolution,
      ).toEqual(get(completed).resolution);
      const h = await serviceRequestHistory(db, desk, r.id, now);
      expect(JSON.stringify(h.body)).toContain(resolution().message);
    },
  );
  it("requires direct confirmation for handover and actual resolution", async () => {
    const r = await serving();
    for (const kind of ["handoff", "resolved"]) {
      expect(
        (
          await act(r, "complete", {
            resolution: { ...resolution(kind), confirmed: false },
          })
        ).status,
      ).toBe(400);
    }
    expect(get(await serviceRequestStatus(db, receipt, now)).state).toBe(
      "serving",
    );
  });
  it("rejects invalid, oversized, empty and incomplete results", () => {
    for (const value of [
      null,
      [],
      { ...resolution(), kind: "magic" },
      { ...resolution(), message: " " },
      { ...resolution(), message: "x".repeat(241) },
      { ...resolution(), businessId: "fake" },
      { ...resolution(), businessId: null },
    ])
      expect(typeof parseResolution(value)).toBe("string");
  });
  it("keeps ownership and version checks for completion", async () => {
    const r = await serving();
    expect(
      (await act(r, "complete", { resolution: resolution() }, other)).status,
    ).toBe(403);
    const results = await Promise.all([
      act(r, "complete", { resolution: resolution("advice") }),
      act(r, "complete", { resolution: resolution("referral") }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await act(
          get(results.find((r) => r.status === 200)!),
          "classify_business",
          { businessId: "shuttle", reason: "수정" },
          desk,
        )
      ).status,
    ).toBe(409);
  });
  it("allows a desk to correct classification with an audited reason, without changing assignment or passenger topic", async () => {
    const r = await serving();
    const changed = await act(
      r,
      "classify_business",
      { businessId: "shuttle", reason: "교통 문의로 확인" },
      desk,
    );
    expect(changed.status).toBe(200);
    expect(get(changed)).toMatchObject({
      businessId: "shuttle",
      topicId: "facility",
      assignedZone: r.assignedZone,
      state: "serving",
    });
    expect(
      (await listServiceRequests(db, desk, now, { business: "shuttle" })).body,
    ).toMatchObject({ total: 1 });
    expect(
      (await listServiceRequests(db, desk, now, { business: "cleaning-t1" }))
        .body,
    ).toMatchObject({ total: 0 });
    expect(
      (await listServiceRequests(db, desk, now, { business: "injected" }))
        .status,
    ).toBe(400);
    const h = await serviceRequestHistory(db, desk, r.id, now);
    expect(JSON.stringify(h.body)).toContain("교통 문의로 확인");
    expect(
      (
        await act(
          r,
          "classify_business",
          { businessId: "shuttle", reason: "중복" },
          desk,
        )
      ).status,
    ).toBe(409);
  });
  it("rejects unowned classification, unknown businesses and missing reasons", async () => {
    const r = await serving();
    expect(
      (
        await act(
          r,
          "classify_business",
          { businessId: "shuttle", reason: "변경" },
          other,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await act(r, "classify_business", {
          businessId: "fake",
          reason: "변경",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await act(r, "classify_business", {
          businessId: "shuttle",
          reason: " ",
        })
      ).status,
    ).toBe(400);
  });
  it("does not let a resolution bypass state transitions", async () => {
    const r = await create();
    expect((await act(r, "assign", { resolution: resolution() })).status).toBe(
      400,
    );
    expect(
      (await act(r, "complete", { resolution: resolution() })).status,
    ).toBe(409);
  });
  it("rolls completion and result back if audit recording fails", async () => {
    const r = await serving();
    await db.exec(
      "create or replace function fail_resolution_audit() returns trigger language plpgsql as $$ begin if NEW.action='complete' then raise exception 'audit unavailable'; end if; return NEW; end $$;create trigger fail_resolution_audit before insert on service_request_history for each row execute function fail_resolution_audit()",
    );
    try {
      await expect(
        act(r, "complete", { resolution: resolution() }),
      ).rejects.toThrow("audit unavailable");
      expect(get(await serviceRequestStatus(db, receipt, now))).toMatchObject({
        state: "serving",
        version: r.version,
      });
      expect(
        get(await serviceRequestStatus(db, receipt, now)).resolution,
      ).toBeUndefined();
    } finally {
      await db.exec(
        "drop trigger fail_resolution_audit on service_request_history;drop function fail_resolution_audit()",
      );
    }
  });
  it("erases public results and audit messages at retention", async () => {
    const r = await serving();
    await act(r, "complete", { resolution: resolution() });
    await expireServiceRequests(db, new Date(now.getTime() + 25 * 3600000));
    const [row] = await db.query<{
      resolution_kind: string | null;
      resolution_message: string;
    }>(
      "select resolution_kind,resolution_message from service_requests where id=$1",
      [r.id],
    );
    expect(row).toEqual({ resolution_kind: null, resolution_message: "" });
    expect(
      JSON.stringify(
        await db.query(
          "select reason from service_request_history where request_id=$1",
          [r.id],
        ),
      ),
    ).not.toContain(resolution().message);
  });
  it("shows results on the valid registration and removes them on immediate privacy erasure", async () => {
    await addFlights(db, [flightRow("KE123", "2026-10-26 17:00")], now);
    const reg = await registerWithPass(db, now, { flightDate: "2026-10-26" });
    const r = await serving({ registrationToken: reg.pass.token });
    const completed = await act(r, "complete", { resolution: resolution() });
    expect(completed.status).toBe(200);
    const progress = await registeredRequestProgress(db, reg.pass.token, now);
    expect(JSON.stringify(progress.body)).toContain(resolution().message);
    await eraseRegistration(db, reg.registration.id, now);
    expect(
      (
        await db.query<{
          resolution_kind: string | null;
          resolution_message: string;
        }>(
          "select resolution_kind,resolution_message from service_requests where id=$1",
          [r.id],
        )
      )[0],
    ).toEqual({ resolution_kind: null, resolution_message: "" });
  });
});
