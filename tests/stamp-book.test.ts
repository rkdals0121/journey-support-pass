import { describe, expect, it } from "vitest";
import { CHECKPOINTS, GOAL, THEMES, THEME_IDS, checkpointOf, checkpointUrl, makeCertId } from "@/lib/stamp-book";

describe("스탬프북", () => {
  it("QR 주소와 손으로 누른 고유번호에서 체크포인트를 찾는다", () => {
    expect(checkpointOf(checkpointUrl("https://x.app", 2))).toBe(2);
    const serial = CHECKPOINTS[0].serial;
    expect(checkpointOf(` ${serial.slice(0, 3).toLowerCase()}-${serial.slice(3)} `)).toBe(0);
    // 체크포인트 이름(A01)만으로는 도장을 받을 수 없다
    expect(checkpointOf("A01")).toBe(-1);
    expect(checkpointOf("https://x.app/stamp/c/A01")).toBe(-1);
    expect(new Set(CHECKPOINTS.map((c) => c.serial)).size).toBe(CHECKPOINTS.length);
    expect(checkpointOf("https://x.app/p/ABC")).toBe(-1);
    expect(checkpointOf("")).toBe(-1);
  });

  it("테마마다 코스 도장 수만큼 이름이 있다", () => {
    for (const id of THEME_IDS) expect(THEMES[id].stops).toHaveLength(GOAL);
  });

  it("인증 ID 는 테마 머리 글자와 해, 헷갈리지 않는 네 글자다", () => {
    expect(makeCertId("flight", new Date(2026, 9, 27), () => 0)).toBe("FL-2026-2222");
    expect(makeCertId("explorer", new Date(2026, 0, 1))).toMatch(/^EX-2026-[2-9A-HJ-NP-Z]{4}$/);
  });
});
