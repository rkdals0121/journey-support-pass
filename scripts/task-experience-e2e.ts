import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const out = path.resolve(
    process.env.TASK_OUTPUT ?? ".e2e-shots/task-experience",
  );
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const checks: string[] = [],
    errors: string[] = [];
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(String(e)));
  async function api(p: Page, url: string, body: unknown) {
    return p.evaluate(
      async (url, body) => {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: await r.json() };
      },
      url,
      body,
    );
  }
  async function axe(p: Page, name: string) {
    const require = createRequire(import.meta.url);
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const bad = await p.evaluate(async () => {
      const engine = (
        window as unknown as {
          axe: {
            run: (o: unknown) => Promise<{
              violations: {
                id: string;
                impact: string;
                nodes: { target: string[] }[];
              }[];
            }>;
          };
        }
      ).axe;
      return (
        await engine.run({
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations
        .filter((v) => ["serious", "critical"].includes(v.impact))
        .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
    });
    check(name + " accessibility: " + JSON.stringify(bad), bad.length === 0);
  }
  try {
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto(base);
      await page.waitForSelector("#home-gate");
      check(
        "home exposes six working services " + width,
        await page.$$eval(
          ".task-action-link",
          (a) =>
            a.length === 6 && a.every((x) => !!(x as HTMLAnchorElement).href),
        ),
      );
      check(
        "stamp book remains available " + width,
        !!(await page.$('a[href="/stamp"]')),
      );
      await axe(page, "home " + width);
      await page.type("#home-gate", "130");
      await page.click(".home-gate-input button");
      await page.waitForSelector("#nav-gate");
      check(
        "gate input reaches the real route form " + width,
        await page.$eval(
          "#nav-gate",
          (e) => (e as HTMLInputElement).value === "130",
        ),
      );
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base + "/register");
    await page.waitForSelector(".choice");
    await page.click('.choice[role="checkbox"]');
    await page.$eval(".flow-cta .btn-primary", (e) =>
      (e as HTMLButtonElement).click(),
    );
    await page.waitForSelector('.flow[data-screen="consent"]');
    await page.click(".flow-desktop-steps li button");
    await page.waitForSelector('.flow[data-screen="trouble"]');
    check(
      "completed registration step can be revisited with answers intact",
      !!(await page.$('.choice[aria-checked="true"]')),
    );
    check(
      "unvisited registration steps cannot bypass consent",
      (await page.$$(".flow-desktop-steps li button")).length === 0,
    );
    const zones = readSeedZones();
    const staff = await browser.newPage();
    staff.setDefaultTimeout(30000);
    staff.on("pageerror", (e) => errors.push(String(e)));
    await staff.goto(base + "/staff/login");
    const setup = await staff.evaluate(
      async (codes) => {
        const r = await fetch("/api/admin/setup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer dx-local-check-only",
          },
          body: JSON.stringify({ codes }),
        });
        return r.status;
      },
      Object.fromEntries(zones.map((z) => [z.id, z.code])),
    );
    assert.equal(setup, 200);
    assert.equal(
      (
        await api(staff, "/api/staff/login", {
          code: zones.find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    const deviceContext = await browser.createBrowserContext();
    const device = await deviceContext.newPage();
    device.setDefaultTimeout(30000);
    device.on("pageerror", (e) => errors.push(String(e)));
    await device.goto(base + "/kiosk");
    assert.equal(
      (
        await api(device, "/api/kiosk/login", {
          code: zones.find((z) => z.isKiosk)!.code,
          placeId: "cc-130",
        })
      ).status,
      200,
    );
    await device.setViewport({ width: 1280, height: 900 });
    await device.goto(base + "/kiosk/guide");
    await device.waitForSelector(".kiosk-taskhome");
    check(
      "kiosk starts with services and no camera permission prompt",
      !(await device.$("video")) &&
        (await device.$$(".task-action-link")).length === 6,
    );
    await axe(device, "installed kiosk");
    check(
      "kiosk services and voice control fit without scrolling",
      await device.$eval(
        ".kiosk-task-utilities",
        (e) => e.getBoundingClientRect().bottom <= innerHeight,
      ),
    );
    await device.screenshot({
      path: out + "/installed-kiosk-1280.png",
      fullPage: true,
    });
    await device.click('[data-service-topic="guidance"] a');
    await device.waitForSelector(".field-current-location");
    check(
      "installed origin is reused instead of asking the passenger again",
      !(await device.$("#nav-place-search")) &&
        (
          await device.$eval(".field-current-location", (e) => e.textContent)
        ).includes("130"),
    );
    check(
      "field journey keeps kiosk context without passenger navigation",
      !!(await device.$(".field-task-header")) &&
        !(await device.$(".public-header")),
    );
    await device.type("#nav-gate", "127");
    await device.click(".field-task-tools button");
    check(
      "field text size control stays usable without horizontal overflow",
      await device.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.documentElement.style.getPropertyValue("--scale") === "1.25",
      ),
    );
    await device.click(".field-task-tools button");
    await device.click('button[type="submit"]');
    await device.waitForSelector(
      ".service-route-result .route-steps, .service-route-result ol",
    );
    check(
      "installed kiosk calculates an actual route",
      await device.$eval(".service-route-result", (e) =>
        e.textContent?.includes("127"),
      ),
    );
    check(
      "route result receives keyboard focus",
      await device.$eval(
        ".service-route-result h2",
        (e) => e === document.activeElement,
      ),
    );
    check(
      "on-site guidance retains installed device return path",
      await device.$eval(
        ".service-route-result a",
        (e) =>
          new URL((e as HTMLAnchorElement).href).searchParams.get(
            "returnTo",
          ) === "/kiosk/guide",
      ),
    );
    await device.screenshot({
      path: out + "/installed-route.png",
      fullPage: true,
    });
    await device.click(".field-task-back");
    await device.waitForSelector(".kiosk-taskhome");
    await device.click(".kiosk-personalise > summary");
    await device.waitForSelector('.scan input[type="file"]');
    check(
      "boarding QR and barcode scanner stays available as an optional action",
      !!(await device.$('.scan input[type="file"]')),
    );
    await device.click(".kiosk-personalise > summary");
    await device.click('[data-service-topic="mobility"] a');
    await device.waitForSelector("#dx-place");
    check(
      "mobility request keeps the installed meeting point",
      await device.$eval(
        "#dx-place",
        (e) =>
          (e as HTMLSelectElement).disabled &&
          (e as HTMLSelectElement).value === "cc-130",
      ),
    );
    await device.click(
      'input[name="service-task"][value="mobility-wheelchair"]',
    );
    await device.click('input[required][type="checkbox"]');
    await device.click('button[type="submit"]');
    await device.waitForSelector(".request-review-card");
    await device.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("이 내용으로 요청 접수"))
        ?.click(),
    );
    await device.waitForSelector(".request-status-layout");
    check(
      "a kiosk service choice saves a real request",
      await device.$eval(".request-status-layout", (e) =>
        e.textContent?.includes("휠체어"),
      ),
    );
    const receipt = await device.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1"),
    );
    const requestId = (await api(device, "/api/requests/status", { receipt }))
      .body.request.id as string;
    await staff.setViewport({ width: 390, height: 1000 });
    await staff.goto(base + "/staff/requests");
    await staff.waitForSelector('[data-select-mobile="' + requestId + '"]');
    check(
      "staff defaults to unfinished work",
      await staff.$eval(
        "#request-filter",
        (e) => (e as HTMLSelectElement).value === "active",
      ),
    );
    check(
      "mobile staff queue uses readable cards instead of a squeezed table",
      (await staff.$eval(
        ".work-table-wrap",
        (e) => getComputedStyle(e).display === "none",
      )) &&
        (await staff.$eval(
          ".work-mobile-list",
          (e) => getComputedStyle(e).display !== "none",
        )),
    );
    check(
      "kiosk request reaches staff queue",
      await staff.$eval(".work-mobile-list", (e) =>
        e.textContent?.includes("휠체어"),
      ),
    );
    await axe(staff, "staff mobile queue");
    await staff.screenshot({
      path: out + "/staff-mobile-real-request.png",
      fullPage: true,
    });
    await staff.click('[data-select-mobile="' + requestId + '"]');
    await staff.waitForSelector(".work-requests.has-selection");
    check(
      "staff mobile card opens handling actions",
      await staff.$eval(".work-detail.is-current", (e) =>
        e.textContent?.includes("제가 맡겠습니다"),
      ),
    );
    await staff.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".work-detail.is-current button",
        ),
      ]
        .find((b) => b.textContent?.includes("제가 맡겠습니다"))
        ?.click(),
    );
    await staff.waitForFunction(() =>
      document
        .querySelector(".work-detail.is-current .work-state-badge")
        ?.textContent?.includes("담당자 배정"),
    );
    check(
      "mobile handling updates the actual passenger request",
      (await api(device, "/api/requests/status", { receipt })).body.request
        .state === "assigned",
    );
    await staff.screenshot({
      path: out + "/staff-mobile-detail.png",
      fullPage: true,
    });
    await staff.click(".work-detail.is-current .work-back");
    await staff.waitForFunction(
      () => !document.querySelector(".work-requests.has-selection"),
    );
    check(
      "returning to the queue preserves the current filter",
      await staff.$eval(
        "#request-filter",
        (e) => (e as HTMLSelectElement).value === "active",
      ),
    );
    await staff.setViewport({ width: 1440, height: 1000 });
    await staff.reload();
    await staff.waitForSelector(".work-request-table td button");
    check(
      "desktop retains a full table and separate detail pane",
      await staff.$eval(
        ".work-table-wrap",
        (e) => getComputedStyle(e).display !== "none",
      ),
    );
    await staff.screenshot({
      path: out + "/staff-desktop-real-request.png",
      fullPage: true,
    });
    await device.goto(base + "/kiosk/guide?lang=en");
    await device.waitForSelector(".kiosk-taskhome");
    await device.click('[data-service-topic="guidance"] a');
    await device.waitForSelector(".field-task-back");
    await device.click(".field-task-back");
    await device.waitForSelector(".kiosk-taskhome");
    check(
      "language survives a field service round trip",
      await device.$eval(".kiosk-task-heading h1", (e) =>
        e.textContent?.includes("What"),
      ),
    );
    await api(device, "/api/kiosk/login", {
      code: zones.find((z) => z.isKiosk)!.code,
      placeId: "t1-info",
    });
    await device.setViewport({ width: 1080, height: 1920 });
    await device.goto(base + "/kiosk/entry");
    await device.waitForSelector(".robot-direct-services");
    check(
      "portrait robot offers routes and mobility without a boarding pass",
      (await device.$$(".robot-direct-services a")).length === 2 &&
        !(await device.$("video")),
    );
    check(
      "portrait robot has no horizontal overflow",
      await device.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await device.screenshot({
      path: out + "/installed-robot-1080x1920.png",
      fullPage: true,
    });
    check("no runtime errors", errors.length === 0);
    fs.writeFileSync(
      out + "/checks.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(checks.length + " task experience checks passed");
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
