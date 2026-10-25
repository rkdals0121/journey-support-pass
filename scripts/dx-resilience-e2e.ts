import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local server only");
  const chrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!chrome) throw new Error("No browser");
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/dx-resilience";
  fs.mkdirSync(out, { recursive: true });
  const checks: string[] = [];
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
  });
  const seed = readSeedZones();
  async function click(p: Page, label: string) {
    await p.waitForFunction(
      (t) =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent === t && !b.disabled,
        ),
      {},
      label,
    );
    await p.evaluate(
      (t) =>
        Array.from(document.querySelectorAll("button"))
          .find((b) => b.textContent === t)
          ?.click(),
      label,
    );
  }
  async function fill(p: Page, note: string) {
    await p.waitForSelector("#dx-place");
    await p.select("#dx-place", "cc-center");
    await p.type("#dx-note", note);
    await p.click('input[type="checkbox"][required]');
    await p.click('button[type="submit"]');
    await p.waitForFunction(() =>
      document.body.innerText.includes("요청 전 확인"),
    );
  }
  try {
    // Lose the first response after the server has handled the request, then retry.
    const c = await browser.createBrowserContext();
    const p = await c.newPage();
    await p.goto(base + "/help", { waitUntil: "networkidle0" });
    await fill(p, "연결 재시도 점검");
    const cdp = await p.createCDPSession();
    await cdp.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*/api/requests/create", requestStage: "Response" },
      ],
    });
    let lost = false;
    cdp.on("Fetch.requestPaused", (event) => {
      if (!lost) {
        lost = true;
        void cdp.send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "ConnectionReset",
        });
      } else
        void cdp.send("Fetch.continueResponse", { requestId: event.requestId });
    });
    await click(p, "이 내용으로 요청 접수");
    await p.waitForSelector('[role="alert"]');
    await cdp.send("Fetch.disable");
    const first = await p.evaluate(async () => {
      const receipt = sessionStorage.getItem("jsp-dx-receipt-v1");
      return (
        await (
          await fetch("/api/requests/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receipt }),
          })
        ).json()
      ).request.id as string;
    });
    await click(p, "이 내용으로 요청 접수");
    await p.waitForSelector('h2[role="status"]');
    const retry = await p.evaluate(async () => {
      const receipt = sessionStorage.getItem("jsp-dx-receipt-v1");
      return (
        await (
          await fetch("/api/requests/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receipt }),
          })
        ).json()
      ).request.id as string;
    });
    check(
      "retry after an accepted-but-lost response uses the same request",
      lost && first === retry,
    );
    await p.setOfflineMode(true);
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await p.waitForSelector('[role="alert"]');
    check(
      "offline warning does not claim request cancellation",
      (await p.evaluate(() => document.body.innerText)).includes("접수됨"),
    );
    await p.setOfflineMode(false);
    await click(p, "상태 다시 확인");
    await p.waitForFunction(() => !document.querySelector('[role="alert"]'));
    check("reconnect restores the same pending request", true);
    p.on("dialog", (d) => void d.accept());
    await click(p, "요청 취소");
    await p.waitForFunction(
      () =>
        document.querySelector('h2[role="status"]')?.textContent === "취소됨",
    );
    // A definite retention expiry must not be presented as a temporary connection loss.
    await p.setRequestInterception(true);
    p.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/requests/status")
        void request.respond({
          status: 410,
          contentType: "application/json",
          body: JSON.stringify({ error: "보관 기간이 끝난 요청입니다" }),
        });
      else void request.continue();
    });
    await click(p, "상태 다시 확인");
    await p.waitForSelector("#dx-place");
    check(
      "expired receipt clears stale request details instead of showing offline status",
      await p.evaluate(
        () =>
          sessionStorage.getItem("jsp-dx-receipt-v1") === null &&
          document.body.innerText.includes("요청 보관 기간이 끝났습니다") &&
          !document.querySelector('h2[role="status"]'),
      ),
    );
    await p.setRequestInterception(false);
    // Staff-assisted entry and QR handoff to another browser.
    const deskContext = await browser.createBrowserContext();
    const desk = await deskContext.newPage();
    await desk.goto(base + "/staff/login");
    const deskCode = seed.find((z) => z.isDesk)!.code;
    const status = await desk.evaluate(async (code) => {
      const r = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      return r.status;
    }, deskCode);
    check("desk authenticates for assisted entry", status === 200);
    await desk.goto(base + "/staff/requests/new", {
      waitUntil: "networkidle0",
    });
    await fill(desk, "대리 접수 점검");
    await click(desk, "이 내용으로 요청 접수");
    await desk.waitForSelector(".dx-receipt img");
    await desk.addScriptTag({
      path: path.join(process.cwd(), "node_modules/jsqr/dist/jsQR.js"),
    });
    const link = await desk.evaluate(async () => {
      const im = document.querySelector<HTMLImageElement>(".dx-receipt img")!;
      await im.decode();
      const canvas = document.createElement("canvas");
      canvas.width = im.naturalWidth;
      canvas.height = im.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(im, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = (
        window as unknown as {
          jsQR: (
            v: Uint8ClampedArray,
            w: number,
            h: number,
          ) => { data: string } | null;
        }
      ).jsQR;
      return qr(pixels.data, canvas.width, canvas.height)?.data ?? "";
    });
    check(
      "receipt QR encodes a request-only recovery link",
      link.startsWith(base + "/help/receipt/"),
    );
    const phoneContext = await browser.createBrowserContext();
    const phone = await phoneContext.newPage();
    await phone.goto(link, { waitUntil: "networkidle0" });
    await phone.waitForSelector('h2[role="status"]');
    check(
      "another phone can follow the shared-screen request",
      (await phone.evaluate(() => document.body.innerText)).includes(
        "대리 접수 점검",
      ),
    );
    await click(desk, "접수는 유지하고 화면 비우기");
    await desk.waitForSelector("#dx-note");
    check(
      "next passenger cannot see previous note",
      await desk.$eval(
        "#dx-note",
        (e) => (e as HTMLTextAreaElement).value === "",
      ),
    );
    await click(phone, "상태 다시 확인");
    check(
      "clearing the shared screen does not cancel the actual request",
      await phone.$eval('h2[role="status"]', (e) => e.textContent === "접수됨"),
    );
    // Kiosk source and pickup cannot be overridden through query parameters.
    const kioskContext = await browser.createBrowserContext();
    const kiosk = await kioskContext.newPage();
    await kiosk.goto(base + "/kiosk");
    const kioskCode = seed.find((z) => z.isKiosk)!.code;
    const kioskStatus = await kiosk.evaluate(async (code) => {
      const r = await fetch("/api/kiosk/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, placeId: "t1-info" }),
      });
      return r.status;
    }, kioskCode);
    check("kiosk can authenticate its installed location", kioskStatus === 200);
    await kiosk.goto(base + "/help?place=cc-center", {
      waitUntil: "networkidle0",
    });
    await kiosk.waitForSelector("#dx-place");
    check(
      "kiosk pickup is locked to its installed location",
      await kiosk.$eval(
        "#dx-place",
        (e) =>
          (e as HTMLSelectElement).disabled &&
          (e as HTMLSelectElement).value === "t1-info",
      ),
    );
    const forbiddenContext = await browser.createBrowserContext();
    const forbidden = await forbiddenContext.newPage();
    await forbidden.goto(base + "/staff/requests/new", {
      waitUntil: "networkidle0",
    });
    check(
      "anonymous users cannot use staff-assisted entry",
      new URL(forbidden.url()).pathname === "/staff/login",
    );
    await phone.setViewport({ width: 360, height: 640 });
    await phone.screenshot({
      path: path.join(out, "receipt-handoff.png"),
      fullPage: true,
    });
    await kiosk.screenshot({
      path: path.join(out, "kiosk-locked-location.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks }, null, 2),
    );
    console.log(`Resilience checks: ${checks.length} passed`);
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
