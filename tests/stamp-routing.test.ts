import { describe, expect, it } from "vitest";
import { stampEligibility, stampRoute } from "@/lib/stamp-routing";
import { SERVICE_HUBS } from "@/lib/service-hubs";
const ids = (gate: string, from: string) =>
  stampRoute(gate, from).indices.map((i) => SERVICE_HUBS[i].id);
describe("terminal and security aware stamp itineraries", () => {
  it("keeps T2 travellers in T2", () => {
    expect(ids("250", "t2-departure")).toEqual(["t2-departure", "t2-airside"]);
  });
  it("includes the concourse only for a concourse gate", () => {
    expect(ids("116", "t1-departure")).toEqual([
      "t1-departure",
      "t1-airside",
      "concourse",
    ]);
    expect(ids("25", "t1-departure")).not.toContain("concourse");
  });
  it("never sends airside travellers back through security", () => {
    expect(ids("25", "t1-airside")).toEqual(["t1-airside"]);
    expect(ids("116", "concourse")).toEqual(["concourse"]);
  });
  it("rejects cross terminal and reverse concourse routes", () => {
    expect(stampRoute("250", "t1-airside").reason).toBeTruthy();
    expect(stampRoute("25", "concourse").reason).toBeTruthy();
  });
  it("does not create an automatically completed empty itinerary", () => {
    expect(stampRoute("", "t1-departure").indices).toHaveLength(0);
    expect(stampRoute("999", "t1-departure").reason).toBeTruthy();
  });
  it("prioritizes boarding over collecting stamps", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    expect(
      stampRoute("116", "t1-departure", "2026-10-28T01:10:00Z", now).reason,
    ).toBeTruthy();
    expect(
      stampRoute("116", "t1-departure", "2026-10-28T05:00:00Z", now).reason,
    ).toBe("");
  });
});

describe("shared eligibility for all stamp scan entry points", () => {
  it("requires a location rather than requiring all terminals", () => {
    expect(stampEligibility({ mode: "play", gate: "" }).indices).toEqual([]);
    expect(
      stampEligibility({
        mode: "play",
        gate: "",
        startHub: "t1-departure",
      }).indices.map((i) => SERVICE_HUBS[i].id),
    ).toEqual(["t1-departure", "t1-care"]);
  });
  it("does not include T1 codes for T2 or landside codes for airside play", () => {
    expect(
      stampEligibility({
        mode: "play",
        gate: "",
        startHub: "t2-airside",
      }).indices.map((i) => SERVICE_HUBS[i].id),
    ).toEqual(["t2-airside"]);
    expect(
      stampEligibility({
        mode: "play",
        gate: "",
        startHub: "concourse",
      }).indices.map((i) => SERVICE_HUBS[i].id),
    ).toEqual(["concourse"]);
  });
  it("blocks both modes near boarding", () => {
    const now = Date.parse("2026-10-28T01:00:00Z");
    expect(
      stampEligibility(
        {
          mode: "play",
          gate: "",
          startHub: "t2-airside",
          boardingAt: "2026-10-28T10:05",
        },
        now,
      ).indices,
    ).toEqual([]);
    expect(
      stampEligibility(
        {
          mode: "route",
          gate: "250",
          startHub: "t2-airside",
          boardingAt: "2026-10-28T10:05",
        },
        now,
      ).indices,
    ).toEqual([]);
  });
});
