import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import webpush from "web-push";
import { createTestDb, kst } from "./helpers/db";
import { deskSession, sessionOf } from "./helpers/fixtures";
import { seedZones } from "@/lib/zones";
import { configurePush } from "@/lib/staff-push";
import { processAlertQueue } from "@/lib/request-alerts";
import { bookVisit, changeVisit } from "@/lib/support-visits";
import type { Db } from "@/lib/db";
import type { VisitView } from "@/lib/service-hubs";
vi.mock("web-push", () => ({
  default: { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) },
}));
let db: Db;
const now = kst("2026-10-28 09:15"),
  receipt = "f".repeat(64);
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate support_visits,service_requests,request_push_subscriptions cascade",
  );
  vi.clearAllMocks();
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "test");
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "test");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:test@example.com");
});
afterEach(() => vi.unstubAllEnvs());
it("delivers reservation, arrival and human handover only to the matching zone and desk without personal details", async () => {
  for (const [n, s] of [
    sessionOf(now, { zoneId: "cc-center" }),
    deskSession(now),
    sessionOf(now, { zoneId: "t2-mid" }),
  ].entries())
    await configurePush(
      db,
      s,
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/" + n,
        keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      },
      now,
    );
  const booked = await bookVisit(
    db,
    {
      receipt,
      consent: true,
      hubId: "concourse",
      service: "robot",
      task: "directions",
      party: 2,
      recognition: "private recognition",
      startAt: kst("2026-10-28 09:30").toISOString(),
    },
    "device",
    now,
  );
  let v = booked.body.visit as VisitView;
  for (const [action, title] of [
    ["book", "새 만남 예약"],
    ["checkin", "예약한 여객 도착"],
    ["handover", "직원 지원 인계"],
  ]) {
    if (action !== "book") {
      const result = await changeVisit(
        db,
        { receipt, version: v.version, action },
        "device",
        now,
      );
      expect(result.status).toBe(200);
      v = result.body.visit as VisitView;
    }
    const before = vi.mocked(webpush.sendNotification).mock.calls.length;
    await processAlertQueue(db, now);
    const calls = vi.mocked(webpush.sendNotification).mock.calls.slice(before);
    expect(calls).toHaveLength(2);
    for (const [, payload] of calls) {
      const data = JSON.parse(String(payload));
      expect(data.title).toBe(title);
      expect(String(payload)).not.toContain("private recognition");
      expect(String(payload)).not.toContain(receipt);
    }
  }
});
