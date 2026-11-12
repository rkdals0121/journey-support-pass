import { describe, expect, it } from "vitest";
import { passengerLabel, SERVICE_CATALOG } from "@/lib/service-catalog";

describe("여객에게 보여 주는 서비스 이름", () => {
  it.each([
    ["mobility", "이동 도움받기"], ["guidance", "탑승구·시설 찾기"],
    ["facility", "시설 불편 알리기"], ["traffic", "교통·주차 이용"], ["other", "그 밖의 도움"],
  ] as const)("%s는 직원용 이름 대신 쉬운 이름을 쓴다", (id, expected) => {
    expect(passengerLabel({ id, label: "직원용 이름" })).toBe(expected);
  });
  it("따로 정한 여객 이름이 없는 서비스는 전달받은 이름을 유지한다", () => {
    for (const id of ["robot", "lost-property"] as const) {
      expect(passengerLabel({ id, label: "그대로 보여 줄 이름" })).toBe("그대로 보여 줄 이름");
    }
  });
  it("공용 서비스 목록의 직원용 이름과 순서를 바꾸지 않는다", () => {
    const before = structuredClone(SERVICE_CATALOG);
    SERVICE_CATALOG.forEach(passengerLabel);
    expect(SERVICE_CATALOG).toEqual(before);
  });
});
