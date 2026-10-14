import { describe, expect, it } from "vitest";
import {
  boardingCloseAt,
  isCancelled,
  isDelayed,
  isDeparted,
  isUrgent,
  minutesToClose,
  pollState,
  staleNow,
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
      staleInMs: (config.staleMin - 5) * 60_000,
    });
  });

  it("수집 간격의 두 배에 15분을 더한 시간을 넘기면 수집이 멈춘 것으로 본다", () => {
    // 무료 요금제 예약은 그 시간대 안의 아무 때나 돌아 정상 간격이 두 배 가까이 될 수 있다.
    expect(config.staleMin).toBe(config.pollMin * 2 + 15);
    expect(pollState(ago(15, 1000), now).stale).toBe(false);
    expect(pollState(ago(config.staleMin), now).stale).toBe(false);
    expect(pollState(ago(config.staleMin, 1000), now)).toEqual({ label: "운항 정보 12:34 기준", stale: true, staleInMs: -1000 });
  });

  it("싣는 칸은 기준 글자, 지금 오래됐는지, 언제 오래되는지 세 가지뿐이다", () => {
    expect(Object.keys(pollState(ago(20), now)).sort()).toEqual(["label", "stale", "staleInMs"]);
    expect(Object.keys(pollState(null, now)).sort()).toEqual(["label", "stale", "staleInMs"]);
  });

  it("언제 오래된 정보가 되는지를 시각이 아니라 남은 시간(ms)으로 알린다", () => {
    // 휴대전화에 남겨 둔 화면은 만든 뒤 흐른 시간이 이 값을 넘으면 스스로 전광판 안내를 띄운다.
    expect(pollState(ago(20), now).staleInMs).toBe((config.staleMin - 20) * 60_000);
    expect(pollState(ago(config.staleMin), now).staleInMs).toBe(0);
    // stale 과 같은 기준이다. 남은 시간이 0 보다 작아지는 때가 곧 stale 이 되는 때다.
    for (const min of [0, 30, config.staleMin - 1, config.staleMin, config.staleMin + 1, 600]) {
      const p = pollState(ago(min, 500), now);
      expect(p.stale).toBe(p.staleInMs! < 0);
    }
  });

  it("수집 기록이 없으면 늦은 것으로 본다", () => {
    expect(pollState(null, now)).toEqual({ label: "운항 정보 없음", stale: true, staleInMs: null });
  });
});

describe("화면에서 다시 보는 운항 정보 신선도", () => {
  const MIN = 60_000;
  // 서버가 08:00(한국 시각)에 만든 화면. 그때 운항 정보는 오래되기까지 10분이 남았다.
  const generatedAt = kst("2026-10-05 08:00").getTime();
  const fresh = { poll: { stale: false, staleInMs: 10 * MIN }, generatedAt };

  it("서버가 이미 오래됐다고 했으면 시각과 상관없이 오래된 것이다", () => {
    const g = { poll: { stale: true, staleInMs: -1000 }, generatedAt };
    expect(staleNow(g, null, null)).toBe(true);
    expect(staleNow(g, generatedAt, null)).toBe(true);
    expect(staleNow({ poll: { stale: true, staleInMs: null }, generatedAt }, generatedAt + 60 * MIN, null)).toBe(true);
  });

  it("화면이 막 떠 지금 시각을 모르면 서버가 정한 그대로 둔다", () => {
    expect(staleNow(fresh, null, null)).toBe(false);
  });

  it("남겨 둔 화면은 서버가 만든 시각부터 흐른 시간이 남은 시간을 넘으면 오래된 것이다", () => {
    expect(staleNow(fresh, generatedAt + 5 * MIN, null)).toBe(false);
    // 서버와 같은 기준이다. 꼭 남은 시간만큼 흐른 때는 아직 아니고, 그보다 조금이라도 지나면 오래된 것이다.
    expect(staleNow(fresh, generatedAt + 10 * MIN, null)).toBe(false);
    expect(staleNow(fresh, generatedAt + 10 * MIN + 1, null)).toBe(true);
    // 몇 시간 뒤 인터넷 없이 연 화면
    expect(staleNow(fresh, generatedAt + 5 * 60 * MIN, null)).toBe(true);
  });

  it("휴대전화 시계가 늦어 서버가 만든 시각보다 앞서 보여도 오래되지 않은 것으로 본다", () => {
    expect(staleNow(fresh, generatedAt - 60 * MIN, null)).toBe(false);
  });

  it("이 화면에서 다시 받은 내용은 서버 시각이 아니라 받은 때(fetchedAt)부터 센다", () => {
    // 휴대전화 시계가 서버보다 한 시간 빠르다. 서버 시각과 견주면 막 받은 내용도 오래된 것으로 잘못 본다.
    const fetchedAt = generatedAt + 60 * MIN;
    expect(staleNow(fresh, fetchedAt + 5 * MIN, fetchedAt)).toBe(false);
    expect(staleNow(fresh, fetchedAt + 10 * MIN, fetchedAt)).toBe(false);
    expect(staleNow(fresh, fetchedAt + 11 * MIN, fetchedAt)).toBe(true);
    // 휴대전화 시계가 늦어도 받은 때부터 센다. 서버 시각과 견주면 오래된 내용을 새것으로 잘못 본다.
    const lateFetchedAt = generatedAt - 60 * MIN;
    expect(staleNow(fresh, lateFetchedAt + 11 * MIN, lateFetchedAt)).toBe(true);
  });

  it("수집한 적이 없어 남은 시간이 없으면(null) 서버가 정한 stale 만 따른다", () => {
    expect(staleNow({ poll: { stale: false, staleInMs: null }, generatedAt }, generatedAt + 5 * 60 * MIN, null)).toBe(false);
  });

  it("남은 시간을 싣기 전에 남겨 둔 화면(칸이 없다)도 멈추지 않고 서버가 정한 stale 만 따른다", () => {
    const saved = JSON.parse(JSON.stringify({ poll: { label: "운항 정보 07:50 기준", stale: false }, generatedAt }));
    expect(() => staleNow(saved, generatedAt + 5 * 60 * MIN, null)).not.toThrow();
    expect(staleNow(saved, generatedAt + 5 * 60 * MIN, null)).toBe(false);
    expect(staleNow(saved, generatedAt + 5 * 60 * MIN, generatedAt)).toBe(false);
  });
});
