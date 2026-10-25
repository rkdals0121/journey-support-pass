import { describe, it, expect } from "vitest";
import { kioskHelpHref, kioskReturn, helpService } from "@/lib/help-entry";
describe("kiosk help entry boundaries", () => {
  it("only returns to the supported kiosk screens", () => {
    expect(kioskReturn("/kiosk/entry")).toBe("/kiosk/entry");
    for (const value of [
      "//evil.example",
      "https://evil.example",
      "/staff/requests",
      "/kiosk/entry?next=https://evil.example",
      null,
    ])
      expect(kioskReturn(value)).toBeUndefined();
  });
  it("unrecognized service values cannot change the request type", () => {
    expect(helpService("mobility")).toBe("mobility");
    expect(helpService("robot")).toBe("robot");
    expect(helpService("constructor")).toBe("guidance");
  });
  it("keeps untrusted token text out of paths", () => {
    const url = new URL(
      kioskHelpHref("../../staff/login", "en", "guidance", "/kiosk/entry"),
      "https://example.com",
    );
    expect(url.pathname).toBe("/help");
    expect(url.searchParams.get("fresh")).toBe("1");
  });
  it("links a valid registration without putting it in shared query fields", () => {
    const url = new URL(
      kioskHelpHref("A".repeat(16), "en", "mobility", "/kiosk/entry", true),
      "https://example.com",
    );
    expect(url.pathname).toBe(`/p/${"A".repeat(16)}/help`);
    expect(url.searchParams.get("service")).toBe("mobility");
    expect(url.searchParams.get("returnTo")).toBe("/kiosk/entry");
    expect(url.searchParams.has("fresh")).toBe(false);
  });
});
