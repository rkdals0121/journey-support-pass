import { describe, expect, it } from "vitest";
import {
  boardingCloseAt,
  isCancelled,
  isDelayed,
  isDeparted,
  isUrgent,
  minutesToClose,
  pollState,
} from "@/lib/timing";
import { config } from "@/lib/config";
import { kst } from "./helpers/db";

const flight = (sched: string, est: string | null = null, status = "") => ({
  schedAt: kst(sched),
  estAt: est ? kst(est) : null,
  status,
});

describe("탑승 마감 추정", () => {
  it("출발 10분 전", () => {
    expect(boardingCloseAt(flight("2026-10-05 14:30"))).toEqual(kst("2026-10-05 14:20"));
  });

  it("마감 30분 이내면 임박", () => {
    const f = flight("2026-10-05 14:30");
    expect(minutesToClose(f, kst("2026-10-05 13:50"))).toBe(30);
    expect(isUrgent(f, kst("2026-10-05 13:50"))).toBe(true);
    expect(minutesToClose(f, kst("2026-10-05 13:49"))).toBe(31);
    expect(isUrgent(f, kst("2026-10-05 13:49"))).toBe(false);
  });

  it("지연되면 변경 시각을 따른다", () => {
    const f = flight("2026-10-05 14:30", "2026-10-05 15:10");
    expect(boardingCloseAt(f)).toEqual(kst("2026-10-05 15:00"));
    expect(isDelayed(f)).toBe(true);
    expect(isDelayed(flight("2026-10-05 14:30", "2026-10-05 14:30"))).toBe(false);
  });

  it("마감이 지나면 음수", () => {
    expect(minutesToClose(flight("2026-10-05 14:30"), kst("2026-10-05 14:25"))).toBe(-5);
  });

  it("자정을 넘겨도 계산된다", () => {
    expect(minutesToClose(flight("2026-10-06 00:20"), kst("2026-10-05 23:50"))).toBe(20);
  });

  it("초 단위는 내림한다", () => {
    const now = new Date(kst("2026-10-05 13:50").getTime() + 30_000);
    expect(minutesToClose(flight("2026-10-05 14:30"), now)).toBe(29);
  });

  it("결항은 임박으로 보지 않는다", () => {
    const f = flight("2026-10-05 14:30", null, "결항");
    expect(isCancelled(f)).toBe(true);
    expect(isUrgent(f, kst("2026-10-05 14:10"))).toBe(false);
  });

  it("상태 문구로 출발 여부를 안다", () => {
    expect(isDeparted(flight("2026-10-05 14:30", null, "출발"))).toBe(true);
    expect(isDeparted(flight("2026-10-05 14:30", null, "탑승중"))).toBe(false);
  });
});

describe("운항 정보 신선도", () => {
  const now = kst("2026-10-05 14:50");

  const ago = (min: number, extraMs = 0) => new Date(now.getTime() - min * 60_000 - extraMs);

  it("한국 시각으로 기준 시각을 적는다", () => {
    expect(pollState(kst("2026-10-05 14:45"), now)).toEqual({
      label: "운항 정보 14:45 기준",
      stale: false,
      aged: false,
    });
  });

  it("15분보다 오래되면 전광판을 한 번 더 보라고 안내한다", () => {
    expect(pollState(ago(15), now)).toMatchObject({ aged: false, stale: false });
    expect(pollState(ago(15, 1000), now)).toMatchObject({ aged: true, stale: false });
  });

  it("수집 간격에 15분을 더한 시간을 넘기면 수집이 멈춘 것으로 본다", () => {
    expect(config.staleMin).toBe(config.pollMin + 15);
    expect(pollState(ago(config.staleMin), now)).toMatchObject({ stale: false, aged: true });
    expect(pollState(ago(config.staleMin, 1000), now)).toMatchObject({ stale: true, aged: false });
  });

  it("수집 기록이 없으면 늦은 것으로 본다", () => {
    expect(pollState(null, now)).toEqual({ label: "운항 정보 없음", stale: true, aged: false });
  });
});
