import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createTestDb, kst } from "./helpers/db";
import { deskSession, sessionOf } from "./helpers/fixtures";
import { seedZones } from "@/lib/zones";
import type { Db } from "@/lib/db";
import { migrate } from "@/lib/db";
import { createServiceRequest } from "@/lib/service-requests";
import { expireServiceRequests } from "@/lib/request-retention";
import { bridgeConfig, integrationReadiness } from "@/lib/integration-config";
import {
  enqueueIntegration,
  processIntegrationJobs,
  integrationCallback,
  integrationOverview,
} from "@/lib/external-integrations";
const now = kst("2026-10-27 14:00"),
  desk = deskSession(now);
const env = {
  EXTERNAL_CONNECTION_MODE: "sandbox",
  EXTERNAL_AGENCY_ADAPTER: "jsp-gateway-v1",
  EXTERNAL_AGENCY_URL: "https://sandbox.example.com/jobs",
  EXTERNAL_AGENCY_TOKEN: "test-token-1234567890",
  EXTERNAL_AGENCY_WEBHOOK_SECRET: "test-signature-secret-123456789012345",
  EXTERNAL_ALLOWED_HOSTS: "sandbox.example.com",
};
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits restart identity cascade",
  );
});
async function request() {
  const r = await createServiceRequest(
    db,
    null,
    {
      receipt: "a".repeat(64),
      service: "guidance",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "private note",
      lang: "ko",
      consent: true,
    },
    "test-device",
    now,
  );
  expect(r.status).toBe(200);
  return r.body.request as { id: string; version: number };
}
async function queue() {
  const r = await request();
  const result = await enqueueIntegration(
    db,
    desk,
    { requestId: r.id, version: r.version, channel: "agency" },
    now,
    env,
  );
  expect(result.status).toBe(200);
  return { r, job: result.body.job as { id: string } };
}
const ack = vi.fn(async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  return Response.json({
    jobId: body.jobId,
    status: "accepted",
    externalId: "TEST-1",
  });
});
async function callback(
  jobId: string,
  status: string,
  sequence: number,
  over: Record<string, unknown> = {},
) {
  const raw = JSON.stringify({
    jobId,
    status,
    sequence,
    externalId: "TEST-1",
    ...over,
  });
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const sig =
    "sha256=" +
    createHmac("sha256", env.EXTERNAL_AGENCY_WEBHOOK_SECRET)
      .update(timestamp + "." + raw)
      .digest("hex");
  return integrationCallback(db, "agency", raw, timestamp, sig, now, env);
}
describe("external sandbox bridge", () => {
  it("stops changed request versions before retrying", async () => {
    await queue();
    await db.query("update service_requests set version=version+1");
    const send = vi.fn(ack);
    await processIntegrationJobs(db, now, env, send as typeof fetch);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await db.query("select state from integration_jobs"))[0].state,
    ).toBe("stopped");
  });
  it("requires allocated matching hardware and stops a changed allocation", async () => {
    const r = await request();
    await db.query(
      "update service_requests set service='robot',state='assigned' where id=$1",
      [r.id],
    );
    const robotEnv = {
      ...env,
      EXTERNAL_ROBOT_URL: env.EXTERNAL_AGENCY_URL,
      EXTERNAL_ROBOT_ADAPTER: "jsp-gateway-v1",
      EXTERNAL_ROBOT_TOKEN: env.EXTERNAL_AGENCY_TOKEN,
      EXTERNAL_ROBOT_WEBHOOK_SECRET: env.EXTERNAL_AGENCY_WEBHOOK_SECRET,
    };
    expect(
      (
        await enqueueIntegration(
          db,
          desk,
          { requestId: r.id, version: r.version, channel: "robot" },
          now,
          robotEnv,
        )
      ).status,
    ).toBe(409);
    const [gear] = await db.query<{ id: string }>(
      "insert into dispatch_resources(label,kind,zone_id,created_at,updated_at) values('integration-test-robot','robot','desk-t1',$1,$1) on conflict(label) do update set updated_at=$1 returning id",
      [now],
    );
    await db.query("update service_requests set resource_id=$2 where id=$1", [
      r.id,
      gear.id,
    ]);
    const mapped = {
      ...robotEnv,
      EXTERNAL_RESOURCE_MAP: JSON.stringify({ [gear.id]: "ROBOT-TEST-1" }),
    };
    expect(
      (
        await enqueueIntegration(
          db,
          desk,
          { requestId: r.id, version: r.version, channel: "robot" },
          now,
          mapped,
        )
      ).status,
    ).toBe(200);
    await db.query("update service_requests set resource_id=null where id=$1", [
      r.id,
    ]);
    const send = vi.fn(ack);
    await processIntegrationJobs(db, now, mapped, send as typeof fetch);
    expect(send).not.toHaveBeenCalled();
  });
  it("defaults to disconnected and blocks live commands and unsafe configuration", async () => {
    expect(
      integrationReadiness({}).every((c) => c.state === "not_configured"),
    ).toBe(true);
    for (const over of [
      { EXTERNAL_CONNECTION_MODE: "live" },
      { EXTERNAL_AGENCY_URL: "http://sandbox.example.com/jobs" },
      { EXTERNAL_AGENCY_URL: "https://127.0.0.1/jobs" },
      { EXTERNAL_ALLOWED_HOSTS: "different.example.com" },
      { EXTERNAL_AGENCY_URL: "https://sandbox.example.com/jobs?secret=x" },
    ])
      expect(bridgeConfig("agency", { ...env, ...over })).toHaveProperty(
        "state",
        "blocked",
      );
    expect(await processIntegrationJobs(db, now, {})).toEqual({
      processed: 0,
      mode: "disabled",
    });
  });
  it("requires desk authorization, active version and explicit configuration", async () => {
    const r = await request();
    const body = { requestId: r.id, version: r.version, channel: "agency" };
    expect((await enqueueIntegration(db, null, body, now, env)).status).toBe(
      401,
    );
    expect(
      (await enqueueIntegration(db, sessionOf(now), body, now, env)).status,
    ).toBe(403);
    expect((await enqueueIntegration(db, desk, body, now, {})).status).toBe(
      503,
    );
    expect(
      (await enqueueIntegration(db, desk, { ...body, version: 99 }, now, env))
        .status,
    ).toBe(409);
    expect((await integrationOverview(db, null)).status).toBe(401);
  });
  it("deduplicates queueing and uses a stable retry key without passenger secrets", async () => {
    const { r, job } = await queue();
    expect(
      (
        await enqueueIntegration(
          db,
          desk,
          { requestId: r.id, version: r.version, channel: "agency" },
          now,
          env,
        )
      ).body.job,
    ).toMatchObject({ id: job.id });
    const sent: string[] = [];
    const transport = vi.fn(async (_u: unknown, init?: RequestInit) => {
      sent.push(JSON.stringify(init));
      return sent.length === 1
        ? new Response("", { status: 503 })
        : ack(_u, init);
    });
    await processIntegrationJobs(db, now, env, transport as typeof fetch);
    await processIntegrationJobs(
      db,
      new Date(now.getTime() + 60000),
      env,
      transport as typeof fetch,
    );
    expect(sent).toHaveLength(2);
    for (const payload of sent) {
      expect(payload).toContain(job.id);
      expect(payload).not.toContain("private note");
      expect(payload).not.toContain("receipt");
      expect(payload).not.toContain("registration");
    }
    expect(
      (await db.query("select state,attempts from integration_jobs"))[0],
    ).toMatchObject({ state: "acknowledged", attempts: 2 });
  });
  it("does not double-send concurrently claimed work", async () => {
    await queue();
    const send = vi.fn(ack);
    await Promise.all([
      processIntegrationJobs(db, now, env, send as typeof fetch),
      processIntegrationJobs(db, now, env, send as typeof fetch),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("stops requests cancelled before transmission", async () => {
    await queue();
    await db.query("update service_requests set state='cancelled'");
    const send = vi.fn(ack);
    await processIntegrationJobs(db, now, env, send as typeof fetch);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await db.query("select state from integration_jobs"))[0].state,
    ).toBe("stopped");
  });
  it("rejects invalid acknowledgements without retrying", async () => {
    await queue();
    await processIntegrationJobs(db, now, env, (async () =>
      Response.json({
        jobId: "wrong",
        status: "accepted",
        externalId: "TEST-1",
      })) as typeof fetch);
    expect(
      (await db.query("select state,last_error from integration_jobs"))[0],
    ).toMatchObject({ state: "failed", last_error: "invalid_acknowledgement" });
  });
  it("rejects unsigned events and applies signed events once without changing the passenger request", async () => {
    const { job } = await queue();
    await processIntegrationJobs(db, now, env, ack as typeof fetch);
    expect(
      (await integrationCallback(db, "agency", "{}", "0", "bad", now, env))
        .status,
    ).toBe(401);
    expect((await callback(job.id, "in_progress", 2)).body.applied).toBe(true);
    expect((await callback(job.id, "in_progress", 1)).body.applied).toBe(false);
    expect((await callback(job.id, "completed", 3)).body.applied).toBe(true);
    expect((await callback(job.id, "in_progress", 4)).body.applied).toBe(false);
    expect(
      (await db.query("select state from service_requests"))[0].state,
    ).toBe("received");
  });
  it("rejects wrong external ids and stale signatures", async () => {
    const { job } = await queue();
    await processIntegrationJobs(db, now, env, ack as typeof fetch);
    expect(
      (await callback(job.id, "completed", 1, { externalId: "wrong" })).body
        .applied,
    ).toBe(false);
    const raw = JSON.stringify({ jobId: job.id });
    const ts = String(Math.floor(now.getTime() / 1000) - 301),
      sig =
        "sha256=" +
        createHmac("sha256", env.EXTERNAL_AGENCY_WEBHOOK_SECRET)
          .update(ts + "." + raw)
          .digest("hex");
    expect(
      (await integrationCallback(db, "agency", raw, ts, sig, now, env)).status,
    ).toBe(401);
  });
  it("clears external references at the parent retention deadline", async () => {
    await queue();
    await processIntegrationJobs(db, now, env, ack as typeof fetch);
    await expireServiceRequests(db, new Date(now.getTime() + 86400001));
    expect(
      (
        await db.query(
          "select state,external_id,last_error from integration_jobs",
        )
      )[0],
    ).toMatchObject({ state: "stopped", external_id: null, last_error: "" });
  });
  it("terminates an exhausted crashed worker lease and migrates repeatedly", async () => {
    await queue();
    await db.query(
      "update integration_jobs set state='sending',attempts=5,lease_until=$1",
      [now],
    );
    await processIntegrationJobs(db, now, env, ack as typeof fetch);
    expect(
      (await db.query("select state from integration_jobs"))[0].state,
    ).toBe("failed");
    await migrate(db);
    expect(
      (await db.query("select count(*)::int as n from integration_jobs"))[0].n,
    ).toBe(1);
  });
});
