import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";
async function main() {
  const b = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
    }),
    p = await b.newPage(),
    checks: string[] = [],
    errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  p.setDefaultTimeout(15000);
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100",
    out = process.env.AIRPORT_CHECK_OUTPUT ?? ".e2e-shots/airport-design";
  if (
    !["127.0.0.1", "localhost", "journey-support-pass.vercel.app"].includes(
      new URL(base).hostname,
    )
  )
    throw Error("Unexpected verification host");
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  try {
    for (const width of [360, 390, 768, 1440]) {
      await p.setViewport({ width, height: 1000 });
      for (const route of ["/", "/services", "/services?lang=en"]) {
        await p.goto(base + route);
        await p.waitForSelector(".airport-service-item");
        check(
          `${width}px ${route} fits`,
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        check(
          `${width}px ${route} header controls do not overlap`,
          await p.evaluate(() => {
            const logo = document
                .querySelector(".public-logo")!
                .getBoundingClientRect(),
              tools = document
                .querySelector(".public-tools")!
                .getBoundingClientRect();
            return logo.right <= tools.left + 1;
          }),
        );
        check(
          `${width}px ${route} retains seven working destinations`,
          await p.$$eval(
            "[data-service-topic] a",
            (links) =>
              links.length === 7 &&
              links.every(
                (a) =>
                  new URL((a as HTMLAnchorElement).href).pathname.startsWith(
                    "/help",
                  ) ||
                  new URL((a as HTMLAnchorElement).href).pathname ===
                    "/navigate" || new URL((a as HTMLAnchorElement).href).pathname === "/services/lost-property",
              ),
          ),
        );
        if (route === "/services")
          await p.screenshot({
            path: `${out}/services-${width}.png`,
            fullPage: true,
          });
      }
    }
    await p.setViewport({ width: 1440, height: 1000 });
    await p.goto(base + "/services");
    await p.type("#service-search", "이동지원");
    await p.waitForFunction(
      () => document.querySelectorAll("[data-service-topic]").length === 1,
    );
    check(
      "service search ignores Korean spacing",
      (await p.$('[data-service-topic="mobility"]')) !== null,
    );
    await p.click("#service-search", { count: 3 });
    await p.type("#service-search", "없는서비스");
    await p.waitForSelector(".airport-directory-empty");
    await p.click(".airport-directory-empty button");
    check(
      "empty search can reset to all services",
      await p.$$eval("[data-service-topic]", (rows) => rows.length === 7),
    );
    await p.type("#service-search", "길찾기");
    await p.waitForSelector('[data-service-topic="guidance"]');
    check(
      "directions alias finds immediate routing",
      (await p.$('[data-service-topic="guidance"] a[href="/navigate"]')) !==
        null,
    );
    await p.click("#service-search", { count: 3 });
    await p.keyboard.press("Backspace");
    await p.click(".airport-service-filters>summary");
    await p.evaluate(() =>
      Array.from(document.querySelectorAll(".airport-service-filters button"))
        .find((e) => e.textContent === "모의 체험")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await p.waitForFunction(
      () => document.querySelectorAll("[data-service-topic]").length === 1,
    );
    check(
      "simulation filter keeps the simulation warning",
      await p.$eval(".airport-demo-tag", (e) => e.textContent === "모의 시연"),
    );
    await p.goto(base + "/services");
    await Promise.all([
      p.waitForNavigation(),
      p.click('[data-service-topic="facility"]'),
    ]);
    await p.waitForSelector("#task-facility", { visible: true });
    check(
      "service card opens the actual work order form",
      (await p.$("#task-facility")) !== null &&
        (await p.$("#task-issue")) !== null,
    );
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(base + "/services");
    await p.click(".public-menu-toggle");
    check(
      "mobile menu opens",
      await p.$eval(
        ".public-menu-toggle",
        (e) => e.getAttribute("aria-expanded") === "true",
      ),
    );
    await Promise.all([
      p.waitForNavigation(),
      p.click('#public-nav a[href="/requests"]'),
    ]);
    check(
      "mobile navigation closes after selection",
      await p.$eval(
        ".public-menu-toggle",
        (e) => e.getAttribute("aria-expanded") === "false",
      ),
    );
    await p.goto(base + "/services");
    await p.click('.public-tools button[aria-label="글자 크게"]');
    check(
      "large text remains within mobile viewport",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    check(
      "large text header remains usable",
      await p.evaluate(
        () =>
          document.querySelector(".public-logo")!.getBoundingClientRect()
            .right <=
          document.querySelector(".public-tools")!.getBoundingClientRect()
            .left +
            1,
      ),
    );
    await p.click('.public-tools button[aria-label="글자 크게"]');
    const req = createRequire(import.meta.url);
    for (const route of ["/services", "/services?lang=en", "/"]) {
      await p.goto(base + route);
      await p.waitForSelector(".airport-service-item");
      await p.addScriptTag({ path: req.resolve("axe-core/axe.min.js") });
      const violations = await p.evaluate(async () => {
        const w = window as unknown as {
          axe: { run: (o: unknown) => Promise<{ violations: unknown[] }> };
        };
        return (
          await w.axe.run({
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations;
      });
      if (violations.length) console.log(JSON.stringify(violations));
      check("accessibility " + route, violations.length === 0);
    }
    await p.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await p.goto(base + "/help?topic=facility&fresh=1");
    check(
      "reduced motion removes button transitions",
      await p.$eval(".public-button", (e) =>
        getComputedStyle(e)
          .transitionDuration.split(",")
          .every((v) => parseFloat(v) === 0),
      ),
    );
    check("no browser errors", errors.length === 0);
    fs.writeFileSync(
      out + "/checks.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`${checks.length} airport design checks passed`);
  } finally {
    await b.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
