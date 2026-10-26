import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
import { readSeedZones } from "../src/lib/zones";
const require = createRequire(import.meta.url);
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local isolated server only");
  const b = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const out = ".e2e-shots/ui-layout";
  fs.mkdirSync(out, { recursive: true });
  const checks: string[] = [],
    errors: string[] = [];
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  try {
    const p = await b.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await p.setViewport({ width, height: 1000 });
      for (const route of [
        "/",
        "/help?topic=mobility",
        "/services",
        "/prepare",
        "/devices",
        "/devices/robot",
        "/devices/kiosk",
        "/kiosk?use=guide",
      ]) {
        await p.goto(base + route);
        await p.evaluate(() => document.fonts.ready);
        check(
          `${width}px ${route} has no horizontal overflow`,
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        if ([390, 1440].includes(width))
          await p.screenshot({
            path: `${out}/${width}-${route.split("?")[0].replaceAll("/", "-") || "home"}.png`,
            fullPage: true,
          });
      }
    }
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(base + "/help?topic=mobility");
    check(
      "help has one language and text-size control",
      (await p.$$eval(
        '.public-tools a[hreflang="en"]',
        (e) => e.length === 1,
      )) &&
        (await p.$$eval(
          ".dx-toolbar button",
          (e) =>
            !e.some(
              (x) => x.textContent === "English" || x.textContent === "큰 글씨",
            ),
        )),
    );
    check(
      "photo guidance is collapsed",
      await p.$eval(
        ".place-photo-info",
        (e) => !(e as HTMLDetailsElement).open,
      ),
    );
    await p.type("#dx-note", "통역 안내 부탁해요");
    await Promise.all([
      p.waitForNavigation(),
      p.click('.public-tools a[hreflang="en"]'),
    ]);
    await p.waitForFunction(() => !!document.querySelector('main[lang="en"]'));
    check(
      "language switch updates the form and retains the draft",
      await p.$eval(
        "#dx-note",
        (e) => (e as HTMLTextAreaElement).value === "통역 안내 부탁해요",
      ),
    );
    await p.click(".public-tools button[aria-pressed]");
    check(
      "large English mobile layout fits",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.click(".public-tools button[aria-pressed]");
    await p.goto(base + "/help?topic=mobility");
    await p.click(".public-menu-toggle");
    check(
      "mobile menu exposes airport device screens",
      await p.$eval(
        '#public-nav a[href="/devices"]',
        (e) => e.getBoundingClientRect().height >= 44,
      ),
    );
    await p.goto(base + "/devices/robot");
    let posts = 0;
    p.on("request", (r) => {
      if (r.method() === "POST") posts++;
    });
    await p.click(".device-welcome .public-button");
    await p.waitForSelector(".device-service-choices");
    await p.click(".device-service-choices button");
    await p.waitForSelector(".device-example-card");
    check(
      "device preview actions stay local and are labelled examples",
      posts === 0 &&
        (await p.evaluate(() => document.body.innerText.includes("예시 화면"))),
    );
    await p.click(".device-preview-footer button");
    await p.waitForSelector(".device-welcome");
    check("preview returns to start screen", true);
    await p.goto(base + "/kiosk?use=guide");
    await p.waitForFunction(() =>
      document
        .querySelector<HTMLInputElement>("input[name=use]:checked")
        ?.parentElement?.textContent?.includes("출국심사"),
    );
    check("kiosk setup preselects the requested device", true);
    const axe = require("axe-core");
    for (const route of [
      "/",
      "/help?topic=mobility",
      "/devices",
      "/devices/robot",
      "/devices/kiosk",
      "/kiosk",
    ]) {
      await p.goto(base + route);
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
      check(`accessibility ${route}`, violations.length === 0);
    }
    // Local-only installation uses the public seed code; production credentials are never read.
    const zones = readSeedZones();
    await p.evaluate(
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
    await p.goto(base + "/staff/login");
    check(
      "staff local login",
      await p.evaluate(
        async (code) =>
          (
            await fetch("/api/staff/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            })
          ).ok,
        zones.find((z) => z.isDesk)!.code,
      ),
    );
    for (const width of [390, 1024, 1440]) {
      await p.setViewport({ width, height: 1000 });
      for (const route of [
        "/staff/requests",
        "/staff/overview",
        "/staff/resources",
      ]) {
        await p.goto(base + route);
        check(
          `${width}px ${route} fits viewport`,
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await p.screenshot({
          path: `${out}/${width}-${route.replaceAll("/", "-")}.png`,
          fullPage: true,
        });
      }
    }
    const kiosk = await (await b.createBrowserContext()).newPage();
    await kiosk.goto(base + "/kiosk");
    check(
      "local kiosk installation",
      await kiosk.evaluate(
        async (code) =>
          (
            await fetch("/api/kiosk/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, placeId: "t1-info" }),
            })
          ).ok,
        zones.find((z) => z.isKiosk)!.code,
      ),
    );
    for (const [width, height] of [
      [1280, 800],
      [900, 1280],
    ]) {
      await kiosk.setViewport({ width, height });
      await kiosk.goto(base + "/kiosk/entry");
      await kiosk.waitForSelector(".robot-home");
      check(
        `installed robot ${width}px fits`,
        await kiosk.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      check(
        `installed robot ${width}px toolbar does not cover assistance button`,
        await kiosk.evaluate(() => {
          const a = document
              .querySelector(".flow-bar")!
              .getBoundingClientRect(),
            b = document.querySelector(".call-dock")!.getBoundingClientRect();
          return b.top >= a.bottom - 1;
        }),
      );
      await kiosk.screenshot({
        path: `${out}/${width}-installed-robot.png`,
        fullPage: true,
      });
    }
    await kiosk.evaluate(
      async (code) =>
        fetch("/api/kiosk/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, placeId: "cc-130" }),
        }),
      zones.find((z) => z.isKiosk)!.code,
    );
    await kiosk.goto(base + "/kiosk/guide");
    await kiosk.waitForSelector(".flow-bar");
    check(
      "installed guide kiosk fits portrait",
      await kiosk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await kiosk.screenshot({
      path: `${out}/900-installed-kiosk.png`,
      fullPage: true,
    });
    check("no browser runtime errors", errors.length === 0);
    fs.writeFileSync(
      `${out}/checks.json`,
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`UI layout: ${checks.length} checks passed`);
  } finally {
    await b.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
