import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local fixtures only");
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  const browser = await puppeteer.launch({ executablePath, headless: true }),
    checks: string[] = [],
    errors: string[] = [];
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/responsive-dx";
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
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
  let passenger: Page | undefined,
    receipt: string | null = null;
  try {
    passenger = await (await browser.createBrowserContext()).newPage();
    passenger.on("pageerror", (e) => errors.push(String(e)));
    await passenger.setViewport({ width: 1440, height: 1000 });
    await passenger.goto(base + "/");
    check(
      "desktop portal uses the full public layout",
      await passenger.$eval(
        ".portal-main",
        (e) => e.getBoundingClientRect().width > 1100,
      ),
    );
    check(
      "desktop portal separates intro and request panel",
      await passenger.evaluate(() => {
        const a = document
            .querySelector(".portal-intro")!
            .getBoundingClientRect(),
          b = document
            .querySelector(".my-request-panel")!
            .getBoundingClientRect();
        return b.left > a.right;
      }),
    );
    check(
      "green identity is retained",
      await passenger.$eval(
        ".public-button",
        (e) => getComputedStyle(e).backgroundColor === "rgb(28, 107, 73)",
      ),
    );
    await passenger.screenshot({
      path: out + "/portal-pc.png",
      fullPage: true,
    });
    await passenger.type("#service-search", "주차");
    await passenger.click(".public-search button");
    check(
      "service search filters by passenger intent",
      await passenger.$$eval(
        "[data-service-topic]",
        (es) =>
          es.length === 1 &&
          es[0].getAttribute("data-service-topic") === "traffic",
      ),
    );
    await passenger.goto(base + "/prepare");
    check(
      "pretrip entry has its own shell",
      (await passenger.$(".pretrip-site")) &&
        !(await passenger.$(".public-nav")),
    );
    await passenger.screenshot({
      path: out + "/prepare-pc.png",
      fullPage: true,
    });
    await passenger.goto(base + "/register?via=booking");
    check(
      "PC registration has steps and summary beside the form",
      await passenger.evaluate(() => {
        const a = document
            .querySelector(".flow-desktop-steps")!
            .getBoundingClientRect(),
          b = document.querySelector(".flow-body")!.getBoundingClientRect(),
          c = document
            .querySelector(".flow-desktop-summary")!
            .getBoundingClientRect();
        return a.width > 0 && a.right < b.left && c.left > b.right;
      }),
    );
    await passenger.screenshot({
      path: out + "/register-pc.png",
      fullPage: true,
    });
    await passenger.setViewport({ width: 390, height: 844 });
    check(
      "mobile registration hides desktop sidebars",
      await passenger.$eval(
        ".flow-desktop-steps",
        (e) => getComputedStyle(e).display === "none",
      ),
    );
    check(
      "mobile registration fits the viewport",
      await passenger.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await passenger.screenshot({
      path: out + "/register-mobile.png",
      fullPage: true,
    });
    await passenger.goto(base + "/");
    check(
      "mobile portal stacks request panel below intro",
      await passenger.evaluate(() => {
        const a = document
            .querySelector(".portal-intro")!
            .getBoundingClientRect(),
          b = document
            .querySelector(".my-request-panel")!
            .getBoundingClientRect();
        return b.top >= a.bottom;
      }),
    );
    check(
      "mobile menu is collapsed initially",
      await passenger.$eval(
        ".public-nav",
        (e) => getComputedStyle(e).display === "none",
      ),
    );
    await passenger.click(".public-menu-toggle");
    check(
      "mobile menu can be opened",
      await passenger.$eval(
        ".public-menu-toggle",
        (e) => e.getAttribute("aria-expanded") === "true",
      ),
    );
    await passenger.click(".public-menu-toggle");
    check(
      "mobile portal has no horizontal overflow",
      await passenger.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await passenger.screenshot({
      path: out + "/portal-mobile.png",
      fullPage: true,
    });
    await passenger.goto(base + "/help?topic=mobility&service=mobility");
    await passenger.waitForSelector("#dx-place");
    await passenger.select("#dx-place", "t2-help");
    await passenger.select("#dx-destination", "t2-arrivals-demo");
    await passenger.click("input[type=checkbox][required]");
    await passenger.click("button[type=submit]");
    check(
      "review includes the selected destination",
      await passenger.evaluate(
        () =>
          document.body.innerText.includes("요청 전 확인") &&
          document.body.innerText.includes("목적지: 제2여객터미널 1층"),
      ),
    );
    await passenger.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "이 내용으로 요청 접수")!
        .click(),
    );
    await passenger.waitForFunction(() =>
      document.body.innerText.includes("접수됨"),
    );
    receipt = await passenger.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1"),
    );
    assert.ok(receipt);
    const job = (await api(passenger, "/api/requests/status", { receipt })).body
      .request;
    check(
      "structured topic business and destination are persisted",
      job.topicId === "mobility" &&
        job.businessId === "shuttle" &&
        job.destinationId === "t2-arrivals-demo",
    );
    const staff = await (await browser.createBrowserContext()).newPage();
    staff.on("pageerror", (e) => errors.push(String(e)));
    await staff.setViewport({ width: 1440, height: 1000 });
    await staff.goto(base + "/staff/login");
    assert.equal(
      (
        await api(staff, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    await staff.goto(base + "/staff/requests");
    await staff.waitForSelector('[data-select-request="' + job.id + '"]');
    await staff.click('[data-select-request="' + job.id + '"]');
    check(
      "PC staff has sidebar list and selected detail",
      await staff.evaluate(() => {
        const a = document
            .querySelector(".workspace-side")!
            .getBoundingClientRect(),
          b = document.querySelector(".work-master")!.getBoundingClientRect(),
          c = document
            .querySelector(".work-detail.is-current")!
            .getBoundingClientRect();
        return a.width > 0 && b.left > a.right && c.left >= b.right && b.top < 750;
      }),
    );
    check(
      "staff sees structured destination",
      await staff.$eval('[data-request-id="' + job.id + '"]', (e) =>
        e.textContent?.includes("목적지: 제2여객터미널 1층"),
      ),
    );
    await staff.screenshot({ path: out + "/staff-pc.png", fullPage: true });
    await staff.evaluate(
      (id) =>
        [
          ...document
            .querySelector('[data-request-id="' + id + '"]')!
            .querySelectorAll("button"),
        ]
          .find((b) => b.textContent === "제가 맡겠습니다")!
          .click(),
      job.id,
    );
    await staff.waitForFunction(
      (id) =>
        document
          .querySelector('[data-request-id="' + id + '"]')
          ?.textContent?.includes("담당자 배정"),
      {},
      job.id,
    );
    await passenger.goto(base + "/");
    await passenger.waitForFunction(() =>
      document
        .querySelector(".my-request-panel")
        ?.textContent?.includes("담당자 배정"),
    );
    check("real staff assignment reaches the passenger portal", true);
    await staff.setViewport({ width: 390, height: 844 });
    await staff.goto(base + "/staff/requests");
    await staff.waitForSelector('[data-select-request="' + job.id + '"]');
    check(
      "mobile staff starts with a list rather than a squeezed desktop console",
      await staff.evaluate(
        () =>
          getComputedStyle(document.querySelector(".workspace-side")!)
            .display === "none" &&
          getComputedStyle(document.querySelector(".work-details .is-current")!)
            .display === "none",
      ),
    );
    await staff.click('[data-select-request="' + job.id + '"]');
    check(
      "mobile selection opens a dedicated detail view",
      await staff.$eval(
        ".work-master",
        (e) => getComputedStyle(e).display === "none",
      ),
    );
    check(
      "mobile staff has no horizontal overflow",
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await staff.screenshot({ path: out + "/staff-mobile.png", fullPage: true });
    await staff.click(".work-detail.is-current .work-back");
    check(
      "mobile detail returns to the request list",
      await staff.$eval(
        ".work-master",
        (e) => getComputedStyle(e).display !== "none",
      ),
    );
    await passenger.goto(base + "/services?lang=en");
    check(
      "English portal has the same task catalogue",
      await passenger.$$eval("[data-service-topic]", (es) => es.length === 7),
    );
    check("English page has no browser runtime errors", errors.length === 0);
    await passenger.setViewport({ width: 320, height: 780 });
    await passenger.click(".public-tools button[aria-pressed]");
    await passenger.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue("--scale") === "1.25",
    );
    check(
      "large text fits the narrow mobile portal",
      await passenger.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await passenger.goto(base + "/register?via=booking");
    await passenger.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue("--scale") === "1.25",
    );
    check(
      "text size continues into pre-registration",
      await passenger.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await passenger.goto(base + "/prepare");
    check(
      "ordinary pretrip entry does not claim a booking source",
      await passenger.$eval(
        ".prepare-intro>a",
        (e) => !e.getAttribute("href")?.includes("via=booking"),
      ),
    );
    await passenger.goto(base + "/prepare?via=booking&lang=en");
    check(
      "booking entry and language are carried to the registration",
      await passenger.$eval(
        ".prepare-intro>a",
        (e) =>
          e.getAttribute("href")?.includes("via=booking") &&
          e.getAttribute("href")?.includes("lang=en"),
      ),
    );
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
  } finally {
    if (passenger && receipt)
      await api(passenger, "/api/requests/cancel", { receipt }).catch(() => {});
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
