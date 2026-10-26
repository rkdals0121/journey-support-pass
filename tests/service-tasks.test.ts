import { describe, it, expect } from "vitest";
import {
  parseServiceDetails,
  serviceDetailsLines,
  SERVICE_TASKS,
} from "@/lib/service-tasks";
const now = new Date("2026-10-26T14:00:00Z");
describe("service work-order input", () => {
  it("keeps only canonical task fields and readable option values", () => {
    const d = {
      task: "lost-item",
      fields: {
        item: "wallet",
        appearance: " 검은 지갑 ",
        eventTime: "2026-10-26T22:30",
      },
    };
    const p = parseServiceDetails(d, "lost-property", now);
    expect(p).toEqual({
      ...d,
      fields: { ...d.fields, appearance: "검은 지갑" },
    });
    if (typeof p !== "string")
      expect(serviceDetailsLines(p)[0].value).toBe("지갑·카드");
  });
  it.each([
    null,
    [],
    { task: "lost-item", fields: {} },
    {
      task: "lost-item",
      fields: {
        item: "unknown",
        appearance: "a",
        eventTime: "2026-10-26T22:30",
      },
    },
    {
      task: "cleaning",
      fields: { facility: "a", issue: "b", phone: "not allowed" },
    },
    {
      task: "lost-item",
      fields: {
        item: "wallet",
        appearance: "a",
        eventTime: "2026-02-31T10:00",
      },
    },
    {
      task: "lost-item",
      fields: {
        item: "wallet",
        appearance: "a",
        eventTime: "2026-10-27T10:00",
      },
    },
    { task: "cleaning", fields: { facility: "a", issue: "a".repeat(121) } },
  ])("rejects malformed or unapproved data %#", (v) =>
    expect(
      typeof parseServiceDetails(
        v,
        v && typeof v === "object" && "task" in v && v.task === "cleaning"
          ? "facility"
          : "lost-property",
        now,
      ),
    ).toBe("string"),
  );
  it("refuses cross-service task injection", () =>
    expect(
      typeof parseServiceDetails(
        { task: "cleaning", fields: { facility: "화장실", issue: "청소" } },
        "lost-property",
        now,
      ),
    ).toBe("string"));
  it("has stable unique task keys", () =>
    expect(new Set(SERVICE_TASKS.map((t) => t.id)).size).toBe(
      SERVICE_TASKS.length,
    ));
});
