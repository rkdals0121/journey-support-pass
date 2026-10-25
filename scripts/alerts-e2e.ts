import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local fixtures only");
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!executablePath) throw new Error("Browser not installed");
  const browser = await puppeteer.launch({ executablePath, headless: true }),
    checks: string[] = [],
    errors: string[] = [];
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/alerts";
  fs.mkdirSync(out, { recursive: true });
  async function api(p: Page, url: string, body?: unknown) {
    return p.evaluate(
      async (url, body) => {
        const r = await fetch(
          url,
          body === undefined
            ? {}
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
        );
        return { status: r.status, body: await r.json() };
      },
      url,
      body,
    );
  }
  try {
    const passenger = await (await browser.createBrowserContext()).newPage();
    await passenger.goto(base + "/help");
    const receipt = crypto.randomBytes(32).toString("hex");
    const created = await api(passenger, "/api/requests/create", {
      receipt,
      service: "guidance",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "알림 확인 검증",
      lang: "ko",
      consent: true,
    });
    assert.equal(created.status, 200);
    const job = created.body.request;
    check(
      "acknowledgment requires staff authentication",
      (await api(passenger, "/api/staff/alerts", { requestId: job.id }))
        .status === 401,
    );
    check(
      "arbitrary receipt proof is rejected",
      (await api(passenger, "/api/staff/push/received", { token: "forged" }))
        .status === 400,
    );
    check(
      "notification retry worker is protected",
      (await api(passenger, "/api/cron/request-alerts")).status === 401,
    );
    const desk = await (await browser.createBrowserContext()).newPage();
    desk.on("pageerror", (e) => errors.push(String(e)));
    await desk.goto(base + "/staff/login");
    assert.equal(
      (
        await api(desk, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    await desk.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    const selector = `[data-request-id="${job.id}"]`;
    await desk.waitForSelector(selector);
    check(
      "missing push configuration is clearly described",
      await desk.$eval(
        selector,
        (e) =>
          e.textContent?.includes("백그라운드 푸시 설정이 없습니다.") === true,
      ),
    );
    check(
      "opening staff screen never asks for notification permission",
      await desk.evaluate(() => Notification.permission === "default"),
    );
    await desk.evaluate(
      (selector) =>
        Array.from(document.querySelector(selector)!.querySelectorAll("button"))
          .find((b) => b.textContent === "접수 확인 · 배정 아님")!
          .click(),
      selector,
    );
    await desk.waitForFunction(
      (selector) =>
        document
          .querySelector(selector)
          ?.textContent?.includes("직원 최초 접수 확인:"),
      {},
      selector,
    );
    check("human confirmation appears on the same request", true);
    const status = await api(passenger, "/api/requests/status", { receipt });
    check(
      "confirmation does not assign or dispatch the request",
      status.body.request.state === "received" &&
        status.body.request.version === job.version,
    );
    await desk.reload({ waitUntil: "networkidle0" });
    check(
      "confirmation survives a browser reload",
      await desk.$eval(
        selector,
        (e) => e.textContent?.includes("직원 최초 접수 확인:") === true,
      ),
    );
    await desk.setViewport({ width: 390, height: 844 });
    check(
      "notification status fits a phone",
      await desk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await desk.screenshot({
      path: path.join(out, "acknowledged-request.png"),
      fullPage: true,
    });
    await desk.goto(base + "/staff/alerts", { waitUntil: "networkidle0" });
    await desk.waitForFunction(() =>
      document.body.innerText.includes("푸시 발송 설정 필요"),
    );
    check(
      "desk sees separate provider browser and human counters",
      await desk.evaluate(
        () =>
          document.body.innerText.includes("푸시 서버 접수") &&
          document.body.innerText.includes("브라우저 수신 확인") &&
          document.body.innerText.includes("직원 최초 확인"),
      ),
    );
    await desk.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "재시도 대기 처리")!
        .click(),
    );
    await desk.waitForFunction(() =>
      document.body.innerText.includes(
        "푸시 운영 설정이 없어 외부 발송을 하지 않았습니다.",
      ),
    );
    check("manual retry does not claim delivery without configuration", true);
    assert.equal(
      (await api(passenger, "/api/requests/cancel", { receipt })).status,
      200,
    );
    check("notification confirmation preserves passenger cancellation", true);
    check("no client runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Notification browser checks:", checks.length);
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
