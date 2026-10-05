import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kstDate, normalizeRow, parseKst, parseResponse } from "@/lib/flights/normalize";

const raw = fs.readFileSync(path.join(__dirname, "fixtures", "departures.json"), "utf-8");

describe("시각 해석", () => {
  it("YYYYMMDDHHmm 을 한국 시각으로 읽는다", () => {
    expect(parseKst("202609231430")?.toISOString()).toBe("2026-09-23T05:30:00.000Z");
  });

  it("형식이 다르면 null", () => {
    expect(parseKst("")).toBeNull();
    expect(parseKst("abc")).toBeNull();
    expect(parseKst("20260923")).toBeNull();
    expect(parseKst("202613991430")).toBeNull();
  });

  it("한국 날짜를 돌려준다", () => {
    expect(kstDate(new Date("2026-09-23T15:30:00Z"))).toBe("2026-09-24");
    expect(kstDate(new Date("2026-09-23T14:59:00Z"))).toBe("2026-09-23");
  });
});

describe("응답 해석", () => {
  it("items 배열을 꺼낸다", () => {
    expect(parseResponse(raw)).toHaveLength(5);
  });

  it("items.item 형태와 객체 하나도 배열로 만든다", () => {
    const wrap = (items: unknown) => JSON.stringify({ response: { body: { items } } });
    expect(parseResponse(wrap({ item: [{ flightId: "A" }, { flightId: "B" }] }))).toHaveLength(2);
    expect(parseResponse(wrap({ item: { flightId: "A" } }))).toHaveLength(1);
    expect(parseResponse(wrap(""))).toHaveLength(0);
    expect(parseResponse(JSON.stringify({ response: { body: {} } }))).toHaveLength(0);
  });

  it("JSON 이 아니면 오류", () => {
    expect(() => parseResponse("<html>SERVICE ERROR</html>")).toThrow();
  });
});

describe("행 변환", () => {
  const rows = parseResponse(raw).map(normalizeRow);

  it("기본 항목", () => {
    expect(rows[0]).toMatchObject({
      flightDate: "2026-09-18",
      flightNo: "MH039",
      masterNo: "",
      airline: "말레이시아 항공",
      destCode: "KUL",
      destName: "쿠알라룸푸르",
      terminal: "T1",
      gate: 24,
      status: "",
    });
    expect(rows[0]?.schedAt.toISOString()).toBe("2026-09-17T15:10:00.000Z");
  });

  it("공동운항은 운항 편명을 남긴다", () => {
    expect(rows[1]).toMatchObject({ flightNo: "QR4497", masterNo: "MH039" });
  });

  it("터미널 코드를 바꾼다", () => {
    expect(rows[2]?.terminal).toBe("CONCOURSE");
    expect(rows[3]?.terminal).toBe("T2");
  });

  it("변경 시각과 상태", () => {
    expect(rows[2]?.estAt?.toISOString()).toBe("2026-09-17T15:40:00.000Z");
    expect(rows[2]?.status).toBe("지연");
    expect(rows[3]?.estAt).toBeNull();
  });

  it("탑승구가 비어 있으면 null", () => {
    expect(rows[2]?.gate).toBe(112);
    expect(rows[3]?.gate).toBeNull();
  });

  it("편명이 없는 행은 버린다", () => {
    expect(rows[4]).toBeNull();
  });

  it("편명은 공백 없이 대문자로", () => {
    expect(normalizeRow({ flightId: " ke 081 ", scheduleDateTime: "202609181000" })?.flightNo).toBe("KE081");
  });
});
