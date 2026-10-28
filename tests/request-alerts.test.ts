import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import webpush from "web-push";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import { sessionOf, kioskSession, deskSession } from "./helpers/fixtures";
import {
  createServiceRequest,
  actOnServiceRequest,
} from "@/lib/service-requests";
import { configurePush } from "@/lib/staff-push";
import {
  processAlertQueue,
  alertSnapshots,
  alertReceipt,
  recordAlertReceipt,
  acknowledgeAlert,
  maintainAlertQueue,
  alertOverview,
  retryAlerts,
} from "@/lib/request-alerts";
import type { Db } from "@/lib/db";
import type { ServiceRequestView } from "@/lib/service-request-model";
vi.mock("web-push", () => ({
  default: { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) },
}));
const now = kst("2026-10-26 08:15"),
  staff = sessionOf(now);
const sub = (id = "one") => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/" + id,
  keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
});
let db: Db,
  n = 0;
const later = (sec: number) => new Date(now.getTime() + sec * 1000);
async function make() {
  const result = await createServiceRequest(
    db,
    null,
    {
      receipt: (++n).toString(16).padStart(64, "0"),
      service: "guidance",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "여객 상세 내용",
      lang: "ko",
      consent: true,
    },
    "alert:device",
    now,
  );
  expect(result.status).toBe(200);
  return result.body.request as ServiceRequestView;
}
interface Delivery {
  id: string;
  state: string;
  attempts: number;
  received_at: Date | null;
  error_code: string;
}
const jobs = () =>
  db.query<Delivery>("select * from request_alert_deliveries order by id");
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits,request_push_subscriptions cascade",
  );
  n = 0;
  vi.clearAllMocks();
  vi.mocked(webpush.sendNotification).mockResolvedValue({
    statusCode: 201,
    body: "",
    headers: {},
  });
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "public-test-key");
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "private-test-key");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:operator@example.com");
});
afterEach(() => vi.unstubAllEnvs());
describe("durable request notifications", () => {
  it("limits operational diagnostics and manual retries to the desk", async () => {
    expect((await alertOverview(db, null, now)).status).toBe(401);
    expect((await alertOverview(db, staff, now)).status).toBe(403);
    expect((await retryAlerts(db, staff, now)).status).toBe(403);
    expect(
      (await retryAlerts(db, kioskSession(now, "cc-center"), now)).status,
    ).toBe(401);
  });
  it("shows provider device and human counts separately without disclosing payloads", async () => {
    await configurePush(db, staff, sub(), now);
    const first = await make();
    await make();
    await acknowledgeAlert(db, staff, first.id, now);
    await processAlertQueue(db, now);
    const overview = await alertOverview(db, deskSession(now), now);
    expect(overview.body).toMatchObject({
      total: 2,
      acknowledged: 1,
      unconfirmed: 1,
      accepted: 1,
      received: 0,
      devices: 1,
    });
    expect(JSON.stringify(overview.body)).not.toContain("endpoint");
    expect(JSON.stringify(overview.body)).not.toContain("여객 상세");
  });
  it("lets desk workers run the retry batch without pretending missing configuration is success", async () => {
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "");
    expect((await retryAlerts(db, deskSession(now), now)).body).toMatchObject({
      enabled: false,
      attempted: 0,
    });
  });
  it("enqueues an event and device targets in the same request insert", async () => {
    await configurePush(db, staff, sub(), now);
    const r = await make();
    expect(
      await db.query(
        "select request_id from request_alerts where request_id=$1",
        [r.id],
      ),
    ).toHaveLength(1);
    expect(await jobs()).toHaveLength(1);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    const snapshot = (await alertSnapshots(db, [r.id]))[r.id];
    expect(snapshot).toMatchObject({
      targets: 1,
      queued: 1,
      accepted: 0,
      received: 0,
    });
  });
  it("does not accept a request if durable alert enqueue fails", async () => {
    await db.exec(
      "alter table request_alerts add constraint enqueue_failure_test check(false)",
    );
    try {
      await expect(make()).rejects.toThrow();
    } finally {
      await db.exec(
        "alter table request_alerts drop constraint enqueue_failure_test",
      );
    }
    expect(await db.query("select id from service_requests")).toHaveLength(0);
    expect(
      await db.query("select used from service_request_limits"),
    ).toHaveLength(0);
  });
  it("keeps provider acceptance separate from receipt and human acknowledgment", async () => {
    await configurePush(db, staff, sub(), now);
    const r = await make();
    await processAlertQueue(db, now);
    let summary = (await alertSnapshots(db, [r.id]))[r.id];
    expect(summary).toMatchObject({
      accepted: 1,
      received: 0,
      acknowledgedAt: null,
    });
    const payload = JSON.parse(
      vi.mocked(webpush.sendNotification).mock.calls[0][1] as string,
    );
    expect(Object.keys(payload).sort()).toEqual([
      "body",
      "receivedToken",
      "tag",
      "title",
      "url",
    ]);
    expect(JSON.stringify(payload)).not.toContain("여객 상세");
    expect(
      (await recordAlertReceipt(db, payload.receivedToken, later(1))).status,
    ).toBe(200);
    summary = (await alertSnapshots(db, [r.id]))[r.id];
    expect(summary.received).toBe(1);
    expect(summary.acknowledgedAt).toBeNull();
    expect((await acknowledgeAlert(db, staff, r.id, later(2))).status).toBe(
      200,
    );
    expect((await alertSnapshots(db, [r.id]))[r.id].acknowledgedZone).toBe(
      staff.zoneId,
    );
    expect(
      (
        await db.query(
          "select version,state from service_requests where id=$1",
          [r.id],
        )
      )[0],
    ).toMatchObject({ version: 0, state: "received" });
  });
  it("protects receipt proofs from forgery expiry and premature acknowledgments", async () => {
    await configurePush(db, staff, sub(), now);
    await make();
    const [job] = await jobs();
    expect(
      (await recordAlertReceipt(db, alertReceipt(job.id), now)).status,
    ).toBe(410);
    expect((await recordAlertReceipt(db, "x", now)).status).toBe(400);
    expect(
      (await recordAlertReceipt(db, job.id + "." + "0".repeat(64), now)).status,
    ).toBe(403);
    await processAlertQueue(db, now);
    expect(
      (await recordAlertReceipt(db, alertReceipt(job.id), later(1))).status,
    ).toBe(200);
    expect(
      (await recordAlertReceipt(db, alertReceipt(job.id), later(2))).status,
    ).toBe(200);
    expect((await jobs())[0].received_at).toEqual(later(1));
    expect(
      (await recordAlertReceipt(db, alertReceipt(job.id), later(601))).status,
    ).toBe(410);
  });
  it("retries transient failures with backoff and stops at four attempts", async () => {
    await configurePush(db, staff, sub(), now);
    await make();
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 503 });
    await processAlertQueue(db, now);
    expect((await jobs())[0]).toMatchObject({
      state: "retry",
      attempts: 1,
      error_code: "http_503",
    });
    await processAlertQueue(db, later(14));
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    for (const sec of [15, 45, 105]) await processAlertQueue(db, later(sec));
    expect((await jobs())[0]).toMatchObject({ state: "failed", attempts: 4 });
    await processAlertQueue(db, later(200));
    expect(webpush.sendNotification).toHaveBeenCalledTimes(4);
  });
  it("does not resend when the browser proved receipt despite a provider timeout", async () => {
    await configurePush(db, staff, sub(), now);
    await make();
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      new Error("socket timeout"),
    );
    await processAlertQueue(db, now);
    const [job] = await jobs();
    await recordAlertReceipt(db, alertReceipt(job.id), later(1));
    await processAlertQueue(db, later(16));
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });
  it("retires gone subscriptions and treats 429 as transient", async () => {
    await configurePush(db, staff, sub(), now);
    await make();
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 410 });
    await processAlertQueue(db, now);
    expect((await jobs())[0].state).toBe("failed");
    expect(
      await db.query("select id from request_push_subscriptions"),
    ).toHaveLength(0);
    await configurePush(db, staff, sub("two"), now);
    await make();
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 429 });
    await processAlertQueue(db, now);
    expect((await jobs()).some((j) => j.state === "retry")).toBe(true);
  });
  it("claims each delivery once across concurrent workers", async () => {
    await configurePush(db, staff, sub(), now);
    await make();
    await Promise.all([processAlertQueue(db, now), processAlertQueue(db, now)]);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });
  it("recovers a crashed worker lease and caps abandoned attempts", async () => {
    await configurePush(db, staff, sub(), now);
    await make();
    await db.query(
      "update request_alert_deliveries set state='sending',attempts=1,lease_token=gen_random_uuid(),lease_until=$1",
      [later(30)],
    );
    await processAlertQueue(db, later(29));
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    await processAlertQueue(db, later(31));
    expect((await jobs())[0]).toMatchObject({ state: "sent", attempts: 2 });
    await db.query(
      "update request_alert_deliveries set state='sending',attempts=4,lease_until=$1",
      [later(40)],
    );
    await processAlertQueue(db, later(41));
    expect((await jobs())[0]).toMatchObject({
      state: "failed",
      error_code: "worker_timeout",
    });
  });
  it("stops queued sends after human confirmation without assigning a request", async () => {
    await configurePush(db, staff, sub(), now);
    const r = await make();
    await acknowledgeAlert(db, staff, r.id, now);
    await processAlertQueue(db, now);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect((await jobs())[0].state).toBe("cancelled");
    const first = (await alertSnapshots(db, [r.id]))[r.id];
    await acknowledgeAlert(db, { ...staff, zoneId: "cc-mid" }, r.id, later(1));
    expect((await alertSnapshots(db, [r.id]))[r.id]).toMatchObject({
      acknowledgedAt: first.acknowledgedAt,
      acknowledgedZone: staff.zoneId,
    });
  });
  it("stops after staff assignment expiry logout and zone switch", async () => {
    await configurePush(db, staff, sub(), now);
    const r = await make();
    await actOnServiceRequest(
      db,
      staff,
      r.id,
      { version: r.version, action: "assign" },
      now,
    );
    await processAlertQueue(db, now);
    expect((await jobs())[0].state).toBe("cancelled");
    await make();
    await processAlertQueue(db, later(601));
    expect((await jobs()).some((j) => j.state === "expired")).toBe(true);
    await make();
    await db.query("delete from request_push_subscriptions");
    await processAlertQueue(db, now);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    await configurePush(db, staff, sub("switch"), now);
    await make();
    await configurePush(db, { ...staff, zoneId: "cc-mid" }, sub("switch"), now);
    await processAlertQueue(db, now);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
  it("requires staff confirmation authentication and rejects non-request capabilities", async () => {
    const r = await make();
    for (const s of [
      null,
      kioskSession(now, "cc-center"),
      { ...staff, needsZone: true },
      { ...staff, exp: now.getTime() },
    ])
      expect((await acknowledgeAlert(db, s, r.id, now)).status).toBe(401);
    expect(
      (await acknowledgeAlert(db, staff, "not-a-request", now)).status,
    ).toBe(400);
  });
  it("does not pretend that missing push configuration or devices delivered an alert", async () => {
    const r = await make();
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "");
    expect(await processAlertQueue(db, now)).toMatchObject({
      enabled: false,
      attempted: 0,
    });
    expect((await alertSnapshots(db, [r.id]))[r.id]).toMatchObject({
      targets: 0,
      accepted: 0,
      received: 0,
    });
  });
  it("deletes device delivery metadata after 24 hours but preserves first-confirmation counts", async () => {
    await configurePush(db, staff, sub(), now);
    const r = await make();
    await acknowledgeAlert(db, staff, r.id, now);
    await maintainAlertQueue(db, later(86401));
    expect(await jobs()).toHaveLength(0);
    expect((await alertSnapshots(db, [r.id]))[r.id].acknowledgedZone).toBe(
      staff.zoneId,
    );
  });
});
