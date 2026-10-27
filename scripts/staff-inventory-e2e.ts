import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3103";
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
    "Local fixtures only",
  );
  const out = path.resolve(
    process.env.STAFF_OUTPUT ?? ".e2e-shots/staff-inventory",
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
  async function api(p: Page, url: string, body?: unknown) {
    return p.evaluate(
      async (url, body) => {
        const r = await fetch(
          url,
          body === undefined
            ? { cache: "no-store" }
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
  async function axe(p: Page, label: string) {
    const require = createRequire(import.meta.url);
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await p.evaluate(async () => {
      const a = (
        window as unknown as {
          axe: {
            run: (
              o: unknown,
            ) => Promise<{
              violations: { id: string; nodes: { target: string[] }[] }[];
            }>;
          };
        }
      ).axe;
      return (
        await a.run({
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    check(
      label + " accessibility " + JSON.stringify(violations),
      violations.length === 0,
    );
  }
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 950 });
      await page.goto(base + "/staff/login");
      await page.waitForSelector("#code");
      await page.type("#code", "example-only");
      await page.click('[aria-controls="code"]');
      check(
        "code reveal works " + width,
        await page.$eval(
          "#code",
          (e) => (e as HTMLInputElement).type === "text",
        ),
      );
      await page.click('[aria-controls="code"]');
      check(
        "code concealed again " + width,
        await page.$eval(
          "#code",
          (e) => (e as HTMLInputElement).type === "password",
        ),
      );
      check(
        "login fits viewport " + width,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await axe(page, "login " + width);
      await page.screenshot({
        path: path.join(out, `login-${width}.png`),
        fullPage: true,
      });
    }
    const zones = readSeedZones();
    const setup = await page.evaluate(
      async (codes) =>
        (
          await fetch("/api/admin/setup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer dx-local-check-only",
            },
            body: JSON.stringify({ codes }),
          })
        ).status,
      Object.fromEntries(zones.map((z) => [z.id, z.code])),
    );
    assert.equal(setup, 200);
    await page.focus("#code");
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type("#code", zones.find((z) => z.isDesk)!.code);
    await Promise.all([
      page.waitForNavigation(),
      page.click(
        '.staff-login-form button[type="submit"], .staff-login-form > .btn',
      ),
    ]);
    check(
      "staff login keeps actual cookie and redirect flow",
      new URL(page.url()).pathname === "/staff/requests",
    );
    await page.goto(base + "/staff/resources");
    await page.waitForSelector(".inventory-result-count, .resource-register");
    await page.click(".resource-register > summary");
    const label = "검증 로봇 " + Date.now();
    await page.type("#resource-label", label);
    await page.select("#resource-zone", "cc-center");
    await page.click('.resource-register button[type="submit"]');
    await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll(".inventory-name h2")].some(
          (e) => e.textContent === label,
        ),
      {},
      label,
    );
    let data = await api(page, "/api/staff/resources");
    const gear = data.body.resources.find(
      (g: { label: string }) => g.label === label,
    );
    check("registration UI writes real inventory data", !!gear?.id);
    await page.type("#inventory-search", label);
    await page.waitForFunction(
      () => document.querySelectorAll("[data-resource-id]").length === 1,
    );
    check("name search filters inventory", true);
    await page.select("#inventory-kind", "mobility");
    await page.waitForSelector(".inventory-empty");
    check(
      "kind filter and empty result are distinct from empty inventory",
      !!(await page.$(".inventory-empty button")),
    );
    await page.click(".inventory-empty button");
    check(
      "reset clears all search conditions",
      await page.$eval(
        "#inventory-search",
        (e) => (e as HTMLInputElement).value === "",
      ),
    );
    await page.type("#inventory-search", label);
    await page.select(`#status-${gear.id}`, "maintenance");
    check(
      "selecting status does not save before explicit apply",
      (await api(page, "/api/staff/resources")).body.resources.find(
        (g: { id: string }) => g.id === gear.id,
      ).status === "ready",
    );
    await page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/staff/resources") &&
        r.request().method() === "GET",
    );
    check(
      "polling preserves pending status selection",
      await page.$eval(
        `#status-${gear.id}`,
        (e) => (e as HTMLSelectElement).value === "maintenance",
      ),
    );
    await page.click(`[data-resource-id="${gear.id}"] button`);
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-resource-id="${id}"] .resource-current-state`)
          ?.textContent?.trim() === "점검 중",
      {},
      gear.id,
    );
    check(
      "explicit apply updates persisted status",
      (await api(page, "/api/staff/resources")).body.resources.find(
        (g: { id: string }) => g.id === gear.id,
      ).status === "maintenance",
    );
    await page.select(`#status-${gear.id}`, "ready");
    await page.click(`[data-resource-id="${gear.id}"] button`);
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-resource-id="${id}"] .resource-current-state`)
          ?.textContent?.trim() === "가용",
      {},
      gear.id,
    );
    let failMutation = true;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (
        failMutation &&
        request.url().endsWith("/api/staff/resources") &&
        request.method() === "POST"
      )
        void request.respond({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "검증용 변경 충돌: 다시 확인해 주세요.",
          }),
        });
      else void request.continue();
    });
    await page.select(`#status-${gear.id}`, "offline");
    await page.click(`[data-resource-id="${gear.id}"] button`);
    await page.waitForSelector('.resource-inventory [role="alert"]');
    await page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/staff/resources") &&
        r.request().method() === "GET",
    );
    check(
      "successful background refresh does not erase failed mutation",
      (
        await page.$eval(
          '.resource-inventory [role="alert"]',
          (e) => e.textContent,
        )
      )?.includes("변경 충돌"),
    );
    failMutation = false;
    await page.select(`#status-${gear.id}`, "ready");
    const receipt = crypto.randomBytes(32).toString("hex");
    const created = await api(page, "/api/requests/create", {
      receipt,
      service: "robot",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "격리 장비 검증",
      lang: "ko",
      consent: true,
    });
    assert.equal(created.status, 200);
    const assigned = await api(page, "/api/staff/requests", {
      id: created.body.request.id,
      version: created.body.request.version,
      action: "assign",
    });
    assert.equal(assigned.status, 200);
    const allocated = await api(page, "/api/staff/resources", {
      action: "allocate",
      requestId: assigned.body.request.id,
      version: assigned.body.request.version,
      resourceId: gear.id,
    });
    assert.equal(allocated.status, 200);
    await page.reload();
    await page.waitForSelector(`[data-resource-id="${gear.id}"] a`);
    check(
      "allocated resource has request navigation instead of editable status",
      !(await page.$(`#status-${gear.id}`)),
    );
    await page.click(`[data-resource-id="${gear.id}"] a`);
    await page.waitForSelector(
      `[data-request-id="${assigned.body.request.id}"]`,
    );
    check(
      "resource deep link loads matching request from API",
      new URL(page.url()).searchParams.get("search") ===
        assigned.body.request.id &&
        (await page.$$eval(
          "[data-request-id]",
          (elements) =>
            new Set(elements.map((e) => e.getAttribute("data-request-id")))
              .size === 1,
        )),
    );
    await page.goto(base + "/staff/resources");
    await page.waitForSelector(`[data-resource-id="${gear.id}"]`);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewport({ width, height: 1000 });
      check(
        "inventory fits viewport " + width,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await axe(page, "inventory " + width);
      await page.screenshot({
        path: path.join(out, `inventory-${width}.png`),
        fullPage: true,
      });
    }
    data = await api(page, "/api/staff/resources");
    check(
      "allocated resource stays bound after presentation changes",
      data.body.resources.find((g: { id: string }) => g.id === gear.id)
        .requestId === assigned.body.request.id,
    );
    await api(page, "/api/requests/cancel", { receipt });
    check("no browser runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`${checks.length} checks passed`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
