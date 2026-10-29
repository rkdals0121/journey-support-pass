import { beforeAll, beforeEach, expect, it } from "vitest";
import { boardingFlightHandler } from "@/lib/api/public";
import type { Db } from "@/lib/db";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, flightRow, resetData } from "./helpers/fixtures";

// 현장등록에서 탑승권 바코드·QR 로 항공편을 찾는다. 날짜와 편명만 쓴다.
const now = kst("2026-10-27 09:00");
let db: Db;
beforeAll(async () => { db = await createTestDb(); });
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("KE123", "2026-10-27 14:30", { destName: "도쿄", destCode: "NRT" })], now);
});

it("finds today's flight from the demo boarding pass code", async () => {
  const res = await boardingFlightHandler(db, "BP1:20261027:KE123:0123456789", now);
  expect(res.status).toBe(200);
  expect(res.body.flight).toMatchObject({ flightDate: "2026-10-27", flightNo: "KE123", destName: "도쿄", day: "today", time: "14:30" });
});

it("finds the flight from an IATA boarding pass barcode", async () => {
  // 항목: 형식 M1, 이름 20자, E, 예약번호 7자, 출발·도착, 항공사 3자, 편명 5자, 날짜(1월 1일부터 300일째 = 10월 27일), 좌석 등
  const bcbp = "M1" + "KIM/MINSU".padEnd(20) + "E" + "ABC1234" + "ICN" + "NRT" + "KE " + "00123" + "300" + "Y" + "012A" + "00001" + "1" + "00";
  const res = await boardingFlightHandler(db, bcbp, now);
  expect(res.status).toBe(200);
  expect(res.body.flight).toMatchObject({ flightNo: "KE123", flightDate: "2026-10-27" });
  expect(JSON.stringify(res.body)).not.toMatch(/KIM|ABC1234/);
});

it("says so when the code is not a boarding pass or the flight is not in today's departures", async () => {
  expect((await boardingFlightHandler(db, "hello", now)).body.code).toBe("boarding");
  expect((await boardingFlightHandler(db, 42, now)).body.code).toBe("boarding");
  expect((await boardingFlightHandler(db, "BP1:20261027:OZ999:0123456789", now)).body.code).toBe("flight");
});
