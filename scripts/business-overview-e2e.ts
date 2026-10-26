import fs from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import puppeteer, { type Page } from "puppeteer-core";
import { createRequire } from "node:module";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local fixtures only");
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
  const browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
    }),
    checks: string[] = [],
    errors: string[] = [];
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const out = ".e2e-shots/business-overview";
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
  let receipt: string | undefined;
  try {
    const p = await (await browser.createBrowserContext()).newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(base + "/staff/overview");
    check(
      "overview requires login",
      new URL(p.url()).pathname === "/staff/login",
    );
    check(
      "anonymous overview API is protected",
      (await api(p, "/api/staff/overview")).status === 401,
    );
    await api(p, "/api/staff/login", {
      code: readSeedZones().find((z) => z.isDesk)!.code,
    });
    receipt = randomBytes(32).toString("hex");
    const created = await api(p, "/api/requests/create", {
      receipt,
      service: "guidance",
      topicId: "facility",
      placeId: "t2-arrivals-demo",
      party: 1,
      note: "현황 검사용 모의 문의",
      choices: [],
      lang: "ko",
      consent: true,
    });
    check("active workload fixture accepted", created.status === 200);
    const finishedReceipt = randomBytes(32).toString("hex");
    let finished = (
      await api(p, "/api/requests/create", {
        receipt: finishedReceipt,
        service: "guidance",
        topicId: "traffic",
        placeId: "t2-arrivals-demo",
        party: 1,
        note: "현황 검사용 모의 교통 문의",
        choices: [],
        lang: "ko",
        consent: true,
      })
    ).body.request;
    for (const action of ["assign", "serve", "complete"]) {
      const result = await api(p, "/api/staff/requests", {
        id: finished.id,
        version: finished.version,
        action,
        ...(action === "complete"
          ? {
              resolution: {
                kind: "referral",
                businessId: "traffic-t2",
                message: "담당 창구를 안내했습니다.",
              },
            }
          : {}),
      });
      assert.equal(result.status, 200);
      finished = result.body.request;
    }
    await p.setViewport({ width: 1440, height: 1000 });
    await p.goto(base + "/staff/overview");
    await p.waitForSelector(".overview-table");
    check(
      "PC overview uses the wide staff workspace",
      await p.$eval(
        ".overview-dashboard",
        (e) => e.getBoundingClientRect().width > 1000,
      ),
    );
    check(
      "all twelve business areas and unclassified row are shown",
      await p.$$eval("[data-overview-business]", (rows) => rows.length === 13),
    );
    check(
      "recorded referral outcome appears separately",
      await p.$eval(
        '[data-result-kind="referral"]',
        (e) => Number(e.textContent?.replace(/\D/g, "")) >= 1,
      ),
    );
    check(
      "report explains handover versus actual resolution",
      await p.evaluate(() =>
        document.body.innerText.includes(
          "인계 확인은 문의한 문제의 해결 완료가 아닙니다",
        ),
      ),
    );
    check(
      "report excludes free-text passenger messages",
      !(await p.evaluate(() => document.body.innerText)).includes(
        "현황 검사용 모의 문의",
      ),
    );
    await p.screenshot({ path: out + "/overview-pc.png", fullPage: true });
    await p.select("#overview-group", "transport");
    await p.waitForFunction(
      () => document.querySelectorAll("[data-overview-business]").length === 3,
    );
    check(
      "business group filters only displayed business rows",
      await p.$$eval("[data-overview-business]", (rows) => rows.length === 3),
    );
    await p.select("#overview-group", "all");
    await p.waitForFunction(
      () => document.querySelectorAll("[data-overview-business]").length === 13,
    );
    const link =
      '[data-overview-business="cleaning-t2"] a[href*="scope=active"]';
    await p.click(link);
    await p.waitForSelector("#queue-business");
    check(
      "business drilldown carries its canonical filter",
      await p.$eval(
        "#queue-business",
        (e) => (e as HTMLSelectElement).value === "cleaning-t2",
      ),
    );
    check(
      "active drilldown excludes completed work",
      await p.$eval(
        "#request-filter",
        (e) => (e as HTMLSelectElement).value === "active",
      ),
    );
    await p.waitForSelector(
      `[data-select-request="${created.body.request.id}"]`,
    );
    check("actual request can be processed from the dashboard drilldown", true);
    await p.goto(base + "/staff/overview");
    await p.setViewport({ width: 390, height: 844 });
    check(
      "mobile uses business cards instead of squeezing the PC table",
      (await p.$eval(
        ".overview-table",
        (e) => getComputedStyle(e).display === "none",
      )) &&
        (await p.$eval(
          ".overview-mobile-loads",
          (e) => getComputedStyle(e).display !== "none",
        )),
    );
    check(
      "mobile overview has no horizontal overflow",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: out + "/overview-mobile.png", fullPage: true });
    const require = createRequire(import.meta.url),
      axe = require("axe-core");
    await p.addScriptTag({ content: axe.source });
    const violations = await p.evaluate(async () => {
      const a = await (
        window as unknown as {
          axe: {
            run: (
              d: Document,
              o: unknown,
            ) => Promise<{ violations: { id: string; impact: string }[] }>;
          };
        }
      ).axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return a.violations;
    });
    check(
      "overview has no serious automated accessibility violations",
      !violations.some((v) => ["critical", "serious"].includes(v.impact)),
    );
    await p.setViewport({ width: 320, height: 700 });
    await p.evaluate(() =>
      document.documentElement.style.setProperty("--scale", "1.25"),
    );
    check(
      "narrow mobile overview fits",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    let failRefresh = true;
    await p.setRequestInterception(true);
    p.on("request", (req) => {
      if (failRefresh && req.url().endsWith("/api/staff/overview"))
        void req.respond({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "검사용 오류" }),
        });
      else void req.continue();
    });
    await p.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => b.textContent?.includes("지금 새로고침"))
        ?.click();
    });
    await p.waitForSelector('[role="alert"]');
    check(
      "refresh failure retains dated last-known data",
      (await p.$eval('[role="alert"]', (e) =>
        e.textContent?.includes("마지막으로 받은 현황"),
      )) && (await p.$("[data-overview-mobile]")) !== null,
    );
    failRefresh = false;
    await p.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => b.textContent?.includes("지금 새로고침"))
        ?.click();
    });
    await p.waitForFunction(() => !document.querySelector('[role="alert"]'));
    check("refresh recovers without losing the overview", true);
    check("no client runtime errors", errors.length === 0);
    console.log(`Business overview checks: ${checks.length} passed`);
    await api(p, "/api/requests/cancel", { receipt });
    receipt = undefined;
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
