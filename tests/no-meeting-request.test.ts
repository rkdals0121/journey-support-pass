import { beforeAll, beforeEach, expect, it } from "vitest";
import { createTestDb, kst } from "./helpers/db";
import type { Db } from "@/lib/db";
import { NO_MEETING_PLACE, PICKUP_PLACES, placeOf } from "@/lib/airport";
import {
  createServiceRequest,
  changeRequestPlace,
} from "@/lib/service-requests";
import { seedZones } from "@/lib/zones";
import type { ServiceRequestView } from "@/lib/service-request-model";
const now = kst("2026-10-27 12:00");
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
const body = {
  receipt: "a".repeat(64),
  service: "guidance",
  topicId: "other",
  placeId: NO_MEETING_PLACE,
  party: 1,
  choices: [],
  note: "",
  consent: true,
  serviceDetails: {
    task: "other-request",
    fields: { purpose: "문의 내용 확인 요청" },
  },
};
it("records a non-physical request and lets staff classify it without asking for a pickup", async () => {
  const res = await createServiceRequest(
    db,
    null,
    { ...body, businessId: "cleaning-t2" },
    "no-meet",
    now,
  );
  expect(res.status).toBe(200);
  const req = res.body.request as ServiceRequestView;
  expect(req.place).toContain("만나지 않음");
  expect(req.businessId).toBe("passenger-terminal");
  expect(PICKUP_PLACES.some((p) => p.id === NO_MEETING_PLACE)).toBe(false);
  expect(placeOf(NO_MEETING_PLACE)).toBeNull();
  expect(
    (
      await changeRequestPlace(
        db,
        null,
        { receipt: body.receipt, version: req.version, placeId: "cc-130" },
        now,
      )
    ).status,
  ).not.toBe(200);
});
it("does not allow physical help to use the no-meeting routing marker", async () => {
  expect(
    (
      await createServiceRequest(
        db,
        null,
        {
          ...body,
          topicId: "mobility",
          service: "mobility",
          serviceDetails: { task: "mobility-wheelchair", fields: {} },
        },
        "bad-no-meet",
        now,
      )
    ).status,
  ).toBe(400);
});
