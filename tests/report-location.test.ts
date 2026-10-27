import { beforeAll, beforeEach, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { seedZones } from "@/lib/zones";
import { createServiceRequest } from "@/lib/service-requests";
import { placeOf } from "@/lib/airport";
import type { ServiceRequestView } from "@/lib/service-request-model";
import { serviceDetailsLines } from "@/lib/service-tasks";
let db: Db;
const now = kst("2026-10-27 12:00");
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits restart identity cascade",
  );
});
const fields = {
  facility: "남자화장실",
  issue: "변기가 막혔어요",
  reportArea: "T2",
  reportLevel: "2",
  reportLocation: "동편 엘리베이터 맞은편",
};
const body = {
  receipt: "b".repeat(64),
  service: "guidance",
  topicId: "facility",
  placeId: "report-T2",
  choices: [],
  party: 1,
  note: "",
  consent: true,
  serviceDetails: { task: "cleaning", fields },
};
it("routes by the reported terminal and preserves the real floor and landmark without a passenger meeting point", async () => {
  const res = await createServiceRequest(db, null, body, "report", now);
  expect(res.status).toBe(200);
  const r = res.body.request as ServiceRequestView;
  expect(r.businessId).toBe("cleaning-t2");
  expect(r.place).toBe("제2터미널 2층 · 동편 엘리베이터 맞은편");
  expect(placeOf(r.placeId)).toBeNull();
  expect(serviceDetailsLines(r.serviceDetails!)).toEqual([
    { label: "시설 이름", value: fields.facility },
    { label: "불편한 내용", value: fields.issue },
  ]);
});
it("rejects missing details, unsupported floors and terminal mismatches", async () => {
  for (const changed of [
    { reportLocation: "" },
    { reportLevel: "99" },
    { reportArea: "T1" },
  ]) {
    const result = await createServiceRequest(
      db,
      null,
      {
        ...body,
        serviceDetails: { task: "cleaning", fields: { ...fields, ...changed } },
      },
      "invalid",
      now,
    );
    expect(result.status).toBe(400);
  }
  expect(
    (
      await createServiceRequest(
        db,
        null,
        { ...body, placeId: "cc-130" },
        "mixed",
        now,
      )
    ).status,
  ).toBe(400);
});
it("prevents report-only markers from becoming physical mobility pickups and avoids wheelchair destinations", async () => {
  const mobility = {
    ...body,
    service: "mobility",
    topicId: "mobility",
    serviceDetails: { task: "mobility-wheelchair", fields: {} },
  };
  expect(
    (await createServiceRequest(db, null, mobility, "wrong-marker", now))
      .status,
  ).toBe(400);
  expect(
    (
      await createServiceRequest(
        db,
        null,
        { ...mobility, placeId: "cc-130", destinationId: "cc-125" },
        "wheelchair",
        now,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await createServiceRequest(
        db,
        null,
        { ...mobility, placeId: "cc-130" },
        "wheelchair-ok",
        now,
      )
    ).status,
  ).toBe(200);
});
