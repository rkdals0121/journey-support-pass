import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local fixtures only");
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!executablePath) throw new Error("Browser unavailable");
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const checks: string[] = [],
    errors: string[] = [];
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/operating-profile";
  fs.mkdirSync(out, { recursive: true });
  try {
    const setup = await fetch(base + "/api/admin/setup", {
      method: "POST",
      headers: {
        Authorization: "Bearer dx-local-check-only",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        codes: Object.fromEntries(readSeedZones().map((z) => [z.id, z.code])),
      }),
    });
    assert.equal(setup.status, 200);
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + "/staff/operations");
    check(
      "operating rules require staff authentication",
      new URL(page.url()).pathname === "/staff/login",
    );
    await page.goto(base + "/services");
    check(
      "all twelve business areas are discoverable",
      await page.$$eval("article", (es) => es.length === 12),
    );
    check(
      "four business groups are separated",
      await page.$$eval("section[aria-labelledby]", (es) => es.length === 4),
    );
    check(
      "specialist operations are not passenger execution buttons",
      (await page.$eval("#boarding-bridge", (e) => !e.querySelector("a"))) &&
        (await page.$eval("#records", (e) => !e.querySelector("a"))),
    );
    await page.setViewport({ width: 390, height: 844 });
    check(
      "service directory fits a phone",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: out + "/services-mobile.png" });
    await page.goto(base + "/services?lang=en");
    check(
      "English directory is complete",
      await page.$eval(
        "main",
        (e) =>
          e.lang === "en" &&
          e.textContent?.includes("Records management") &&
          e.textContent?.includes("Shuttle services"),
      ),
    );
    await page.goto(base + "/help?business=not-a-business");
    await page.waitForSelector("#dx-note");
    check(
      "unknown query cannot inject a support message",
      await page.$eval(
        "#dx-note",
        (e) => (e as HTMLTextAreaElement).value === "",
      ),
    );
    await page.goto(base + "/services");
    await page.click("#cleaning-t2 a");
    await page.waitForSelector("#dx-note");
    check(
      "chosen business reaches the editable request message",
      await page.$eval(
        "#dx-note",
        (e) =>
          (e as HTMLTextAreaElement).value ===
          "T2 환경미화 관련 상담을 요청합니다.",
      ),
    );
    check(
      "new arrivals points can be selected",
      await page.$$eval(
        "#dx-place option",
        (es) =>
          es.some(
            (e) => (e as HTMLOptionElement).value === "t1-arrivals-demo",
          ) &&
          es.some((e) => (e as HTMLOptionElement).value === "t2-arrivals-demo"),
      ),
    );
    await page.select("#dx-place", "t2-arrivals-demo");
    await page.click("input[type=checkbox][required]");
    await page.click("button[type=submit]");
    await page.waitForFunction(() =>
      document.body.innerText.includes("요청 전 확인"),
    );
    await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "이 내용으로 요청 접수")!
        .click(),
    );
    await page.waitForFunction(() =>
      document.body.innerText.includes("접수됨"),
    );
    const receipt = await page.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1"),
    );
    assert.ok(receipt);
    const request = await page.evaluate(async (receipt) => {
      const r = await fetch("/api/requests/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      return r.json();
    }, receipt);
    check(
      "business message and arrivals pickup survive acceptance",
      request.request.note === "T2 환경미화 관련 상담을 요청합니다." &&
        request.request.placeId === "t2-arrivals-demo",
    );
    const staff = await browser.newPage();
    await staff.goto(base + "/staff/login");
    await staff.evaluate(
      async (code) => {
        const r = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!r.ok) throw new Error("Test login failed");
      },
      readSeedZones().find((z) => z.isDesk)!.code,
    );
    await staff.goto(base + "/staff/requests");
    await staff.waitForSelector(
      '[data-request-id="' + request.request.id + '"]',
    );
    check(
      "staff receives the requested business context",
      await staff.$eval('[data-request-id="' + request.request.id + '"]', (e) =>
        e.textContent?.includes("T2 환경미화"),
      ),
    );
    await staff.goto(base + "/staff/operations");
    check(
      "staff rules expose all business owners",
      await staff.$$eval("section details", (es) => es.length === 12),
    );
    check(
      "staff sees explicitly simulated hours and equipment rules",
      await staff.evaluate(
        () =>
          document.body.innerText.includes("24시간 시연 접수") &&
          document.body.innerText.includes("기존 배차 없음") &&
          document.body.innerText.includes("배차 중"),
      ),
    );
    await staff.setViewport({ width: 390, height: 844 });
    check(
      "operating rules fit a phone",
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await staff.screenshot({ path: out + "/operations-mobile.png" });
    const cancelled = await page.evaluate(async (receipt) => {
      const r = await fetch("/api/requests/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      return r.status;
    }, receipt);
    check("test enquiry is cleaned up", cancelled === 200);
    check("no browser runtime errors", errors.length === 0);
    fs.writeFileSync(
      out + "/results.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
