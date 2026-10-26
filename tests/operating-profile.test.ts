import { describe, expect, it } from "vitest";
import { PLACES } from "../src/lib/airport";
import {
  businessOf,
  pilotDestinations,
  pilotResourceState,
} from "../src/lib/operating-profile";

describe("pilot operating rules", () => {
  it("does not offer destinations across terminals or security boundaries", () => {
    for (const from of PLACES) {
      for (const to of pilotDestinations(from.id)) {
        expect(to.id).not.toBe(from.id);
        expect(to.area).toBe(from.area);
        expect(to.landside).toBe(from.landside);
      }
    }
  });
  it("offers a usable concourse destination for a valid meeting point", () => {
    expect(pilotDestinations("cc-center").some((p) => p.id === "cc-103")).toBe(
      true,
    );
  });
  it("does not turn an unknown pickup into a route", () => {
    expect(pilotDestinations("unknown")).toEqual([]);
  });
  it("provides a landside destination in each terminal", () => {
    expect(
      pilotDestinations("t1-info").some((p) => p.id === "t1-arrivals-demo"),
    ).toBe(true);
    expect(
      pilotDestinations("t2-help").some((p) => p.id === "t2-arrivals-demo"),
    ).toBe(true);
  });
  it("a shared desk does not permit a T1 to T2 transfer", () => {
    expect(pilotDestinations("t1-info").some((p) => p.id === "t2-help")).toBe(
      false,
    );
  });
  it("never reports assigned or unavailable equipment as available", () => {
    expect(pilotResourceState({ status: "ready", requestId: "active" })).toBe(
      "busy",
    );
    expect(pilotResourceState({ status: "maintenance", requestId: null })).toBe(
      "maintenance",
    );
    expect(pilotResourceState({ status: "offline", requestId: null })).toBe(
      "offline",
    );
    expect(pilotResourceState({ status: "ready", requestId: null })).toBe(
      "available",
    );
  });
  it("only resolves canonical business identifiers from untrusted query parameters", () => {
    expect(businessOf("passenger-terminal")?.access).toBe("passenger");
    expect(businessOf("boarding-bridge")?.access).toBe("internal");
    for (const bad of [
      null,
      {},
      ["passenger-terminal"],
      "__proto__",
      "<script>",
    ])
      expect(businessOf(bad)).toBeUndefined();
  });
});
