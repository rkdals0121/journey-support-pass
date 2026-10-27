import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { createRequire } from "node:module";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local only");
  const b = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    protocolTimeout: 30000,
  });
  const out = process.env.SERVICE_CHECK_OUTPUT ?? ".e2e-shots/service-workflows";
  fs.mkdirSync(out, { recursive: true });
  const checks: string[] = [],
    errors: string[] = [];
  const check = (n: string, ok: unknown) => {
    assert.ok(ok, n);
    checks.push(n);
    console.log("PASS", n);
  };
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
  try {
    const p = await b.newPage();
    p.setDefaultTimeout(15000);
    p.setDefaultNavigationTimeout(15000);
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.setViewport({ width: 1440, height: 1000 });
    await p.goto(base + "/help?topic=facility&fresh=1");
    await p.waitForSelector("#task-facility");
    await p.type("#task-facility", "127번 탑승구 화장실");
    await p.type("#task-issue", "바닥에 물이 고여 있어요");
    await p.select("#report-area","CONCOURSE");
    await p.select("#report-level","3");
    await p.type("#report-location","127번 탑승구 옆");
    await p.click("input[required][type=checkbox]");
    await p.screenshot({ path: out + "/facility-pc.png", fullPage: true });
    await p.click("button[type=submit]");
    await p.waitForSelector(".request-review-card");
    await p.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((e) => e.textContent?.includes("이 내용으로 요청 접수"))
        ?.click(),
    );
    await p.waitForSelector(".request-status-layout");
    check(
      "facility work order persists and returns a reference",
      await p.evaluate(
        () =>
          document.body.innerText.includes("청결·청소 요청") &&
          document.body.innerText.includes("바닥에 물이 고여 있어요"),
      ),
    );
    const receipt = await p.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1")!,
    );
    await p.screenshot({ path: out + "/status-pc.png", fullPage: true });
    const zones = readSeedZones(),
      operator = await b.newPage();
    await operator.goto(base + "/staff/login");
    await operator.evaluate(
      async (codes) =>
        fetch("/api/admin/setup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer dx-local-check-only",
          },
          body: JSON.stringify({ codes }),
        }),
      Object.fromEntries(zones.map((z) => [z.id, z.code])),
    );
    check(
      "staff login",
      (
        await api(operator, "/api/staff/login", {
          code: zones.find((z) => z.isDesk)!.code,
        })
      ).status === 200,
    );
    let req = (await api(p, "/api/requests/status", { receipt })).body.request;
    const list = await operator.evaluate(
      async () =>
        await (await fetch("/api/staff/requests?business=cleaning-t1")).json(),
    );
    check(
      "specific cleaning team queue receives structured fields",
      list.requests.some(
        (r: { id: string; serviceDetails?: { fields?: { issue?: string } } }) =>
          r.id === req.id &&
          r.serviceDetails?.fields?.issue === "바닥에 물이 고여 있어요",
      ),
    );
    for (const action of ["assign", "serve", "complete"]) {
      const res = await api(operator, `/api/staff/requests`, {
        id: req.id,
        action,
        version: req.version,
        ...(action === "complete"
          ? {
              resolution: {
                kind: "resolved",
                businessId: "cleaning-t1",
                message: "현장 청소 완료",
                confirmed: true,
              },
            }
          : {}),
      });
      check("work order " + action, res.status === 200);
      req = res.body.request;
    }
    await p.reload();
    await p.bringToFront();
    await p.waitForSelector(".request-status-layout");
    check(
      "passenger receives the actual handling result",
      await p.evaluate(() =>
        document.body.innerText.includes("현장 청소 완료"),
      ),
    );
    await p.goto(base + "/help?topic=lost-property&fresh=1");
    await p.waitForSelector(".booking-lookup h1");
    check("lost property directs to staff handover without an intake form", p.url().includes("/services/lost-property") && (await p.$("form")) === null);
    await p.goto(base + "/help?topic=traffic&fresh=1");
    await p.waitForSelector('[data-traffic-intent="dispatch"]');await p.click('[data-traffic-intent="dispatch"]');
    await p.waitForSelector("#task-zone");
    await p.type("#task-zone", "단기주차장 B1");
    await p.type("#dx-place-search", "130");
    await p.waitForSelector('[data-confirm-place="cc-130"]');
    await p.click('[data-confirm-place="cc-130"]');
    await p.click("input[required][type=checkbox]");
    await p.click("button[type=submit]");
    await p.waitForSelector(".request-review-card");
    await p.evaluate(() => Array.from(document.querySelectorAll("button")).find(e => e.textContent?.includes("이 내용으로 요청 접수"))?.click());
    await p.waitForSelector(".request-status-layout");
    check("transport work order needs no duplicate assistance description", await p.evaluate(() => document.body.innerText.includes("주차장 현장 지원")));
    await p.goto(base + "/requests");
    await p.waitForSelector(".my-service-request");
    await p.waitForFunction(
      () => document.querySelectorAll(".my-service-request").length === 2,
    );
    check("my requests retains multiple services", true);
    await p.screenshot({ path: out + "/requests-pc.png", fullPage: true });
    await p.goto(base + "/navigate");
    await p.type("#nav-place-search", "127");
    await p.waitForSelector('[data-confirm-place="gate-127"]');
    await p.click('[data-confirm-place="gate-127"]');
    await p.type("#nav-gate", "130");
    await p.click("button[type=submit]");
    await p.waitForSelector(".journey-route-steps");
    check(
      "directions computes a route without creating a staff request",
      await p.evaluate(
        () =>
          document.body.innerText.includes("130번 탑승구") &&
          !!document.querySelector(".route-metrics"),
      ),
    );
    await p.select("#nav-kind", "restroom");
    await p.click("button[type=submit]");
    await p.waitForSelector(".journey-route-steps");
    check(
      "facility lookup returns walking directions",
      await p.evaluate(() =>
        document
          .querySelector(".service-route-result")
          ?.textContent?.includes("화장실"),
      ),
    );
    const axe = createRequire(import.meta.url)("axe-core");
    for (const width of [390, 768, 1440]) {
      await p.setViewport({ width, height: 1000 });
      for (const route of [
        "/help?topic=mobility&fresh=1",
        "/requests",
        "/navigate",
        "/devices/robot",
        "/devices/kiosk",
      ]) {
        await p.goto(base + route);
        await p.waitForFunction(
          () => !document.querySelector(".request-loading"),
        );
        check(
          `${width}px ${route} fits`,
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        if (width !== 768)
          await p.screenshot({
            path: `${out}/${width}-${route.split("?")[0].replaceAll("/", "-")}.png`,
            fullPage: true,
          });
      }
    }
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(base + "/help?topic=mobility&fresh=1");
    await p.waitForSelector("[data-request-next]");
    await p.click("[data-request-next]");
    await p.waitForSelector("#dx-place-search", { visible: true });
    await p.type("#dx-place-search", "127");
    await p.waitForSelector('[data-confirm-place="gate-127"]');
    await p.click('[data-confirm-place="gate-127"]');
    check("mobility skips unrelated preferences", (await p.$("#dx-note")) === null);
    await p.click("input[required][type=checkbox]");
    await p.click("button[type=submit]");
    await p.waitForSelector(".request-review-card");
    check(
      "mobile steps preserve the selected location and input through review",
      await p.evaluate(
        () =>
          document.body.innerText.includes("127번") &&
          document.body.innerText.includes("이동 동행"),
      ),
    );
    for (const route of [
      "/help?topic=facility&fresh=1",
      "/requests",
      "/navigate",
    ]) {
      await p.goto(base + route);
      await p.waitForFunction(
        () => !document.querySelector(".request-loading"),
      );
      await p.addScriptTag({ content: axe.source });
      const violations = await p.evaluate(async () => {
        const r = await (
          window as unknown as {
            axe: {
              run: (
                d: Document,
                o: unknown,
              ) => Promise<{
                violations: {
                  id: string;
                  impact: string;
                  nodes: { target: string[] }[];
                }[];
              }>;
            };
          }
        ).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return r.violations
          .filter((v) => ["serious", "critical"].includes(v.impact))
          .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
      });
      if (violations.length) console.log(JSON.stringify(violations));
      check("accessibility " + route, violations.length === 0);
    }
    const kiosk = await (await b.createBrowserContext()).newPage();
    await kiosk.goto(base + "/kiosk");
    await api(kiosk, "/api/kiosk/login", {
      code: zones.find((z) => z.isKiosk)!.code,
      placeId: "t1-info",
    });
    await kiosk.setViewport({ width: 1080, height: 1920 });
    await kiosk.goto(base + "/requests");
    check(
      "shared kiosk cannot open personal request history",
      new URL(kiosk.url()).pathname === "/kiosk/entry",
    );
    await kiosk.goto(base + "/kiosk/entry");
    await kiosk.waitForSelector(".robot-portrait");
    check(
      "installed robot uses a single portrait column",
      await kiosk.evaluate(
        () =>
          getComputedStyle(document.querySelector(".robot-portrait")!)
            .flexDirection === "column",
      ),
    );
    check(
      "robot portrait has no horizontal overflow",
      await kiosk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await kiosk.screenshot({
      path: out + "/robot-1080x1920.png",
      fullPage: true,
    });
    await api(kiosk, "/api/kiosk/login", {
      code: zones.find((z) => z.isKiosk)!.code,
      placeId: "cc-130",
    });
    await kiosk.setViewport({ width: 1280, height: 900 });
    await kiosk.goto(base + "/kiosk/guide");
    await kiosk.waitForSelector(".kiosk-scan-surface");
    check("installed kiosk has its own scan-and-services layout", true);
    await kiosk.screenshot({ path: out + "/kiosk-1280.png", fullPage: true });
    check("no browser errors", errors.length === 0);
    fs.writeFileSync(
      out + "/checks.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`${checks.length} service workflow checks passed`);
  } catch (error) {
    console.error("Service flow failure", error);
    for (const page of await b.pages().catch(() => [])) {
      console.log("Failure page", page.url());
      console.log(
        (
          await page.evaluate(() => document.body.innerText).catch(() => "")
        ).slice(-1800),
      );
    }
    throw error;
  } finally {
    const process = b.process();
    await Promise.race([
      b.close(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    process?.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
