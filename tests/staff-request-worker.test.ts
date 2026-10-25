import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
function worker(fail = false) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const fetch = vi.fn().mockResolvedValue({ ok: true }),
    showNotification = fail
      ? vi.fn().mockRejectedValue(new Error("blocked"))
      : vi.fn().mockResolvedValue(undefined);
  vm.runInNewContext(
    fs.readFileSync(path.resolve("public/staff/staff-request-sw.js"), "utf8"),
    {
      self: {
        addEventListener: (name: string, handler: (event: unknown) => void) => {
          handlers[name] = handler;
        },
        registration: { showNotification },
      },
      fetch,
      AbortSignal,
      URL,
    },
  );
  return { handlers, fetch, showNotification };
}
describe("staff notification worker", () => {
  it("reports receipt only after showing a generic notification", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.push({
      data: {
        json: () => ({
          tag: "request-id",
          receivedToken: "signed-proof",
          body: "sensitive details",
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(w.showNotification).toHaveBeenCalledWith(
      "새 도움 요청",
      expect.objectContaining({
        body: "통합 요청 화면에서 접수 내용을 확인해 주세요.",
      }),
    );
    expect(w.fetch).toHaveBeenCalledWith(
      "/api/staff/push/received",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "signed-proof" }),
      }),
    );
  });
  it("never claims receipt if showing the notification fails", async () => {
    const w = worker(true);
    let pending: Promise<unknown> | undefined;
    w.handlers.push({
      data: { json: () => ({ receivedToken: "proof" }) },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await expect(pending).rejects.toThrow("blocked");
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it("supports old payloads without inventing receipt confirmation", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.push({
      data: { json: () => ({ tag: "old" }) },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    expect(w.fetch).not.toHaveBeenCalled();
  });
});
