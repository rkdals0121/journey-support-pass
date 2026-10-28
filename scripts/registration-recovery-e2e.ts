import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3104";
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
    "Local fixture host only",
  );
  const out = path.resolve(
    process.env.RECOVERY_OUTPUT ?? ".e2e-shots/registration-recovery",
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
  async function api(page: Page, url: string, body: unknown) {
    return page.evaluate(
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
  async function next(page: Page) {
    await page.$eval(".flow-cta .btn-primary", (e) =>
      (e as HTMLButtonElement).click(),
    );
  }
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base);
    await page.goto(base + "/register");
    await page.waitForSelector('.flow[data-screen="trouble"]');
    await page.click('.choice[role="checkbox"]');
    await next(page);
    await page.waitForSelector('.flow[data-screen="consent"]');
    await next(page);
    await page.waitForSelector('.flow[data-screen="walk"]');
    await page.click('.choice[role="checkbox"]');
    await page.waitForFunction(
      () => history.state?.jspRegistrationDraft?.choices.length >= 2,
    );
    const answers = await page.evaluate(
      () => history.state.jspRegistrationDraft.choices,
    );
    await page.goBack({ waitUntil: "networkidle0" });
    check(
      "browser Back leaves registration without deleting answers",
      new URL(page.url()).pathname === "/",
    );
    await page.goForward({ waitUntil: "networkidle0" });
    await page.waitForSelector('.flow[data-screen="walk"]');
    check(
      "browser Forward restores the same step and selected answers",
      JSON.stringify(
        await page.evaluate(() => history.state.jspRegistrationDraft.choices),
      ) === JSON.stringify(answers) &&
        !!(await page.$('.choice[aria-checked="true"]')),
    );
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('.flow[data-screen="walk"]');
    check(
      "reload also restores the current registration",
      !!(await page.$('.choice[aria-checked="true"]')),
    );
    await page.screenshot({
      path: path.join(out, "desktop-restored.png"),
      fullPage: true,
    });
    for (let i = 0; i < 12 && !(await page.$("#reg-flight")); i++) {
      const previous = await page.$eval(".flow", (e) =>
        e.getAttribute("data-screen"),
      );
      await next(page);
      await page.waitForFunction(
        (previous) =>
          document.querySelector(".flow")?.getAttribute("data-screen") !==
          previous,
        {},
        previous,
      );
    }
    await page.waitForSelector("#reg-flight");
    await page.setViewport({ width: 390, height: 844 });
    let compositionSearches = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/flights/search")) compositionSearches++;
    });
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#reg-flight")!;
      input.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "ㅊㆍ");
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertCompositionText",
          data: "ㅊㆍ",
          isComposing: true,
        }),
      );
    });
    check(
      "Cheonjiin intermediate arae-a is not removed during composition",
      await page.$eval(
        "#reg-flight",
        (e) => (e as HTMLInputElement).value === "ㅊㆍ",
      ),
    );
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 400)),
    );
    check(
      "unfinished composition does not issue flight searches",
      compositionSearches === 0,
    );
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#reg-flight")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "천진");
      input.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "천진" }),
      );
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: "천진",
        }),
      );
    });
    await page.waitForRequest(
      (r) =>
        r.url().includes("/api/flights/search?q=") &&
        new URL(r.url()).searchParams.get("q") === "천진",
    );
    check(
      "completed Korean city text reaches actual flight search",
      await page.$eval(
        "#reg-flight",
        (e) => (e as HTMLInputElement).value === "천진",
      ),
    );
    await page.screenshot({
      path: path.join(out, "mobile-korean-input.png"),
      fullPage: true,
    });
    const kioskContext = await browser.createBrowserContext();
    const kiosk = await kioskContext.newPage();
    kiosk.on("pageerror", (e) => errors.push(String(e)));
    await kiosk.goto(base + "/kiosk");
    const zones = readSeedZones();
    assert.equal(
      await kiosk.evaluate(
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
      ),
      200,
    );
    assert.equal(
      (
        await api(kiosk, "/api/kiosk/login", {
          code: zones.find((z) => z.isKiosk)!.code,
          placeId: "t1-info",
        })
      ).status,
      200,
    );
    const booking = await api(page, "/api/booking/lookup", {
      airline: "demo",
      reference: "DEMO01",
      surname: "KIM",
    });
    assert.equal(booking.status, 200);
    const f = booking.body.handoff.flight;
    const reg = await api(page, "/api/registrations", {
      bookingContext: booking.body.handoff.context,
      flightDate: f.flightDate,
      flightNo: f.flightNo,
      choices: ["mov_no_stairs", "gd_large"],
      party: 3,
      consent: true,
      lang: "ko",
      startedAt: new Date().toISOString(),
    });
    assert.equal(reg.status, 200);
    await kiosk.setViewport({ width: 1080, height: 1920 });
    await kiosk.goto(base + "/kiosk/entry");
    await kiosk.waitForSelector(".robot-number-entry");
    check(
      "entrance offers number lookup without opening a camera",
      !(await kiosk.$("video")),
    );
    await kiosk.click(".robot-number-entry > summary");
    await kiosk.type("#entry-pass-number", "123");
    await kiosk.click(".robot-number-entry > summary");
    await kiosk.click(".robot-number-entry > summary");
    check(
      "closing number entry clears unfinished digits",
      await kiosk.$eval(
        "#entry-pass-number",
        (e) => (e as HTMLInputElement).value === "",
      ),
    );
    await kiosk.type("#entry-pass-number", "000000");
    await kiosk.click('.robot-number-entry button[type="submit"]');
    await kiosk.waitForSelector('#entry-number-error [role="alert"]');
    check(
      "unknown number shows an inline error and allows retry",
      await kiosk.$eval(
        "#entry-pass-number",
        (e) =>
          !(e as HTMLInputElement).disabled &&
          (e as HTMLInputElement).value === "",
      ),
    );
    await kiosk.setViewport({ width: 390, height: 844 });
    check(
      "number entry and touch keypad fit mobile width",
      await kiosk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await kiosk.evaluate(() => window.scrollTo(0, 0));
    await kiosk.screenshot({
      path: path.join(out, "entry-number-mobile.png"),
      fullPage: true,
    });
    await kiosk.setViewport({ width: 1080, height: 1920 });
    for (const digit of reg.body.passNo)
      await kiosk.evaluate((digit) => {
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            ".entry-number-pad button",
          ),
        ]
          .find((e) => e.textContent?.trim() === digit)!
          .click();
      }, digit);
    check(
      "touch number pad enters all six digits",
      await kiosk.$eval(
        "#entry-pass-number",
        (e, number) => (e as HTMLInputElement).value === number,
        reg.body.passNo,
      ),
    );
    await kiosk.click('.robot-number-entry button[type="submit"]');
    await kiosk.waitForSelector(".saved-needs");
    check(
      "number lookup loads the registered passenger's saved support",
      (await kiosk.evaluate(() => document.body.innerText)).includes("계단") &&
        !(await kiosk.$("#entry-pass-number")),
    );
    check(
      "shared entrance never saves a private registration draft",
      await kiosk.evaluate(() => !history.state?.jspRegistrationDraft),
    );
    await kiosk.screenshot({
      path: path.join(out, "entry-number-result.png"),
      fullPage: true,
    });
    await page.goto(base + "/");
    await page.goto(base + "/register");
    await page.waitForSelector('.flow[data-screen="trouble"]');
    check(
      "a new registration history entry does not inherit old answers",
      !(await page.$('.choice[aria-checked="true"]')),
    );
    check("no runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`${checks.length} recovery checks passed`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
