import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  const local = ["localhost", "127.0.0.1"].includes(new URL(base).hostname);
  assert.ok(local || base === "https://journey-support-pass.vercel.app");
  const out = process.env.BOOKING_CHECK_OUTPUT ?? ".e2e-shots/booking";
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const p = await browser.newPage(), errors: string[] = [], checks: string[] = [];
  p.on("pageerror", e => errors.push(String(e)));
  p.setDefaultTimeout(15000);
  const check = (name: string, value: unknown) => { assert.ok(value, name); checks.push(name); console.log("PASS", name); };
  const clickText = async (text: string) => {
    const clicked = await p.evaluate(t => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === t);
      if (!button || button.disabled) return false;
      button.click(); return true;
    }, text);
    assert.ok(clicked, "Button: " + text);
  };
  try {
    for (const width of [360, 390, 768, 1440]) {
      await p.setViewport({ width, height: 1000 });
      await p.goto(base + "/prepare/booking");
      await p.waitForSelector("#booking-reference");
      check(`${width}px inputs fit`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      check(`${width}px fields adapt`, await p.evaluate(() => {
        const a = document.querySelector("#booking-reference")!.getBoundingClientRect(), b = document.querySelector("#booking-surname")!.getBoundingClientRect();
        return innerWidth <= 600 ? b.top > a.bottom : Math.abs(a.top - b.top) < 2;
      }));
      await clickText("시연값 넣기"); await p.click('button[type="submit"]');
      await p.waitForSelector("#booking-result-title");
      check(`${width}px lookup shows fixture`, await p.$eval(".booking-result", el => /DX9001/.test(el.textContent ?? "")));
      check(`${width}px result fits`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      check(`${width}px no booking identifiers in URL`, !/DEMO01|KIM/.test(p.url()));
      await p.screenshot({ path: `${out}/result-${width}.png`, fullPage: true });
    }
    await p.goto(base + "/prepare/booking?lang=en");
    await p.waitForSelector("#booking-reference");
    await p.type("#booking-reference", "DEMO02"); await p.type("#booking-surname", "LEE"); await p.click('button[type="submit"]');
    await p.waitForSelector('[role="alert"]');
    check("English cancellation is actionable", await p.$eval('[role="alert"]', e => /cancelled/.test(e.textContent ?? "")));
    await clickText("Fill demo booking"); await p.click('button[type="submit"]'); await p.waitForSelector("#booking-result-title");
    await p.waitForFunction(() => document.title.length > 0);
    await p.addScriptTag({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") });
    const violations = await p.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (root: Element, options: object) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe;
      return (await axe.run(document.querySelector("main")!, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations;
    });
    check("booking result accessibility", violations.length === 0);
    if (local) {
      await p.setViewport({ width: 390, height: 900 });
      await clickText("Register with this flight"); await p.waitForSelector(".flow-body h1");
      check("demo provenance retained", await p.$eval(".booking-provenance", e => /Demo booking/.test(e.textContent ?? "")));
      let sawFlight = false;
      for (let i = 0; i < 20; i++) {
        const primary = await p.$eval(".flow-cta .btn-primary", e => e.textContent?.trim() ?? "");
        if (primary === "Register") break;
        const heading = await p.$eval(".flow-body h1", e => e.textContent);
        if (await p.$(".flight-layout")) {
          sawFlight = true;
          check("flight automatically selected", await p.$eval(".flight-layout", e => /DX9001/.test(e.textContent ?? "")));
          check("prefilled flight can proceed", await p.$eval(".flow-cta .btn-primary", e => !(e as HTMLButtonElement).disabled));
        }
        // Existing flow intentionally ignores scripted clicks in its double-tap guard.
        await p.$eval(".flow-cta .btn-primary", e => (e as HTMLButtonElement).click());
        await p.waitForFunction(before => document.querySelector(".flow-body h1")?.textContent !== before, {}, heading);
      }
      check("flight confirmation step visited", sawFlight);
      check("review ready", await p.$eval(".flow-cta .btn-primary", e => e.textContent?.trim() === "Register"));
      const submitted = p.waitForResponse(r => r.url().endsWith("/api/registrations") && r.request().method() === "POST");
      await p.$eval(".flow-cta .btn-primary", e => (e as HTMLButtonElement).click());
      const response = await submitted;
      check("registration created", response.status() === 200);
      const payload = JSON.parse(response.request().postData() ?? "{}");
      check("handoff submitted without reservation identifiers", typeof payload.bookingContext === "string" && !/DEMO01|KIM/.test(JSON.stringify(payload)));
      await p.waitForFunction(() => location.pathname.startsWith("/p/"));
      await p.waitForSelector("h1");
      check("issued pass opens", (await p.$eval("body", e => e.textContent ?? "")).includes("DX9001"));
      await p.screenshot({ path: `${out}/issued-pass-390.png`, fullPage: true });
    }
    check("no runtime errors", errors.length === 0);
    fs.writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
