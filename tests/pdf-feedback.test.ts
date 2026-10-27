// 「수정 필요한 부분」 피드백: 시설 이용 불편을 이용 도움 / 점검 요청 / 청소로 나눈다.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { createServiceRequest } from "@/lib/service-requests";
import type { ServiceRequestView } from "@/lib/service-request-model";
import { parseServiceDetails, tasksFor } from "@/lib/service-tasks";
import { seedZones } from "@/lib/zones";
import { createTestDb, kst } from "./helpers/db";

const now = kst("2026-10-27 14:00");
const where = { reportArea: "T1", reportLevel: "3", reportLocation: "25번 게이트 앞" };

describe("시설 이용 불편의 세 가지", () => {
  it("청소, 이용 도움, 점검 요청 순으로 고른다", () => {
    expect(tasksFor("facility").map((t) => t.label)).toEqual(["청결·청소 요청", "시설 이용 도움 요청", "시설 점검 요청"]);
  });

  it("점검 요청은 고장·파손·안전 위험 가운데 하나를 고르게 한다", () => {
    const ok = parseServiceDetails({ task: "facility-inspection", fields: { facility: "에스컬레이터", problem: "hazard", issue: "손잡이가 빠졌어요", ...where } }, "facility", now);
    expect(typeof ok).not.toBe("string");
    const bad = parseServiceDetails({ task: "facility-inspection", fields: { facility: "에스컬레이터", problem: "기타", issue: "x", ...where } }, "facility", now);
    expect(bad).toBe("문제 종류을 다시 선택해 주세요");
    const missing = parseServiceDetails({ task: "facility-inspection", fields: { facility: "에스컬레이터", issue: "x", ...where } }, "facility", now);
    expect(missing).toBe("문제 종류을 입력해 주세요");
  });

  describe("접수", () => {
    let db: Db;
    beforeAll(async () => {
      db = await createTestDb();
      await seedZones(db, () => "x:y");
    });
    beforeEach(async () => {
      await db.exec("truncate service_requests,service_request_limits restart identity cascade");
    });
    const submit = (n: number, task: string, fields: Record<string, string>) =>
      createServiceRequest(
        db,
        null,
        {
          receipt: String(n).repeat(64),
          placeId: "report-T1",
          service: "guidance",
          topicId: "facility",
          serviceDetails: { task, fields: { ...fields, ...where } },
          party: 1,
          choices: [],
          note: "",
          lang: "ko",
          consent: true,
        },
        "ip:phone-" + n,
        now,
      );
    it("이용 도움과 점검 요청은 여객터미널 운영으로, 청소는 그 터미널 환경미화로 간다", async () => {
      const business = async (r: Awaited<ReturnType<typeof submit>>) => {
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        return (r.body as { request: ServiceRequestView }).request.businessId;
      };
      expect(await business(await submit(1, "facility-inspection", { facility: "자동문", problem: "broken", issue: "열리지 않아요" }))).toBe("passenger-terminal");
      expect(await business(await submit(2, "facility-access", { facility: "무인 발권기", issue: "버튼이 높아요" }))).toBe("passenger-terminal");
      expect(await business(await submit(3, "cleaning", { facility: "화장실", issue: "청소" }))).toBe("cleaning-t1");
    });
  });
});
