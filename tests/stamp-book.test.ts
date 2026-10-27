import { describe, expect, it } from "vitest";
import { CHECKPOINTS, EMPTY, GOAL, THEMES, THEME_IDS, checkpointOf, checkpointUrl, makeCertId, nextStop } from "@/lib/stamp-book";

describe("스탬프북", () => {
  it("QR 주소와 손으로 누른 번호에서 체크포인트를 찾는다", () => {
    expect(checkpointOf(checkpointUrl("https://x.app", 2))).toBe(2);
    expect(checkpointOf(" k7q ")).toBe(0);
    expect(checkpointOf("https://x.app/p/ABC")).toBe(-1);
    expect(checkpointOf("")).toBe(-1);
  });

  it("테마마다 체크포인트 수만큼 이름이 있다", () => {
    for (const id of THEME_IDS) expect(THEMES[id].stops).toHaveLength(GOAL);
    expect(new Set(CHECKPOINTS.map((c) => c.code)).size).toBe(GOAL);
  });

  it("경로형 다음 거점은 아직 안 찍은 가장 앞 거점이다", () => {
    expect(nextStop(EMPTY)).toBe(0);
    expect(nextStop({ ...EMPTY, stamps: { 0: 1, 2: 1 } })).toBe(1);
    expect(nextStop({ ...EMPTY, stamps: Object.fromEntries(CHECKPOINTS.map((_, i) => [i, 1])) })).toBe(-1);
  });

  it("인증 ID 는 테마 머리 글자와 해, 헷갈리지 않는 네 글자다", () => {
    expect(makeCertId("flight", new Date(2026, 9, 27), () => 0)).toBe("FL-2026-2222");
    expect(makeCertId("explorer", new Date(2026, 0, 1))).toMatch(/^EX-2026-[2-9A-HJ-NP-Z]{4}$/);
  });
});
