import puppeteer, { type Page } from "puppeteer-core";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readSeedZones } from "../../src/lib/zones";
async function main() {
  const out = import.meta.dirname,
    base = process.env.JSP_CHECK_BASE ?? "http://127.0.0.1:3144",
    checks: unknown[] = [],
    errors: string[] = [];
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    async function inspect(
      p: Page,
      route: string,
      name: string,
      width: number,
      height: number,
    ) {
      await p.setViewport({ width, height });
      await p.goto(base + route);
      await p.waitForSelector("h1");
      await p
        .waitForNetworkIdle({ idleTime: 400, timeout: 2500 })
        .catch(() => {});
      await p.addScriptTag({
        path: path.resolve("node_modules/axe-core/axe.min.js"),
      });
      const result = await p.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        violations: (
          await (
            window as unknown as {
              axe: {
                run: (
                  o: unknown,
                ) => Promise<{
                  violations: { id: string; nodes: { target: string[] }[] }[];
                }>;
              };
            }
          ).axe.run({
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      }));
      checks.push({ route, width, ...result });
      console.log("Checked", route, width);
      await p.screenshot({
        path: path.join(out, name + "-after.png"),
        fullPage: true,
      });
      assert.equal(result.overflow, false);
      assert.deepEqual(result.violations, []);
    }
    const p = await browser.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    for (const width of [390, 1440])
      for (const [route, name] of [
        ["/", "home"],
        ["/services", "services"],
        ["/help?topic=facility", "facility"],
        ["/help?topic=mobility", "mobility"],
        ["/requests", "requests"],
        ["/prepare", "prepare"],
        ["/register", "register"],
        ["/visits", "visits"],
      ])
        await inspect(p, route, name + width, width, 900);
    const setup = await fetch(base + "/api/admin/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dx-local-check-only",
      },
      body: JSON.stringify({
        codes: Object.fromEntries(readSeedZones().map((z) => [z.id, z.code])),
        mockFlights: true,
      }),
    });
    assert.equal(setup.status, 200);
    async function post(page: Page, url: string, body: unknown) {
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
    const receipt = Date.now().toString(16).padStart(64, "f");
    const booking = await post(p, "/api/visits", {
      action: "book",
      receipt,
      consent: true,
      hubId: "concourse",
      service: "robot",
      task: "directions",
      party: 1,
      startAt: "2026-10-28T16:00:00+09:00",
      recognition: "테스트 식별복",
    });
    assert.equal(booking.status, 200);
    const visit = booking.body.visit;
    const staff = await (await browser.createBrowserContext()).newPage();
    await staff.goto(base);
    assert.equal(
      (
        await post(staff, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    for (const width of [390, 1440])
      for (const route of [
        "requests",
        "visits",
        "resources",
        "desk",
        "overview",
      ])
        await inspect(
          staff,
          "/staff/" + route,
          "staff-" + route + width,
          width,
          1000,
        );
    const kiosk = await (await browser.createBrowserContext()).newPage();
    kiosk.on("pageerror", (e) => errors.push(String(e)));
    await kiosk.goto(base);
    const kioskCode = readSeedZones().find((z) => z.isKiosk)!.code;
    assert.equal(
      (
        await post(kiosk, "/api/kiosk/login", {
          code: kioskCode,
          placeId: "t2-west",
        })
      ).status,
      200,
    );
    for (const [width, height] of [
      [1440, 1000],
      [1080, 1920],
      [390, 844],
    ]) {
      await inspect(kiosk, "/kiosk/guide", "kiosk-home" + width, width, height);
      await inspect(
        kiosk,
        "/kiosk/visits",
        "kiosk-reference" + width,
        width,
        height,
      );
      assert(await kiosk.$("#kiosk-visit-reference"));
    }
    await kiosk.type("#kiosk-visit-reference", visit.id.slice(0, 8));
    await kiosk.click("button[type=submit]");
    await kiosk.waitForSelector(".meeting-destination-name");
    assert(
      (await kiosk.$eval("main", (el) => el.textContent))?.includes(
        "예약한 장소는 여기예요",
      ),
    );
    assert(
      !(await kiosk.$eval("main", (el) => el.textContent))?.includes(
        "테스트 식별복",
      ),
    );
    await kiosk.screenshot({
      path: path.join(out, "kiosk-destination-after.png"),
      fullPage: true,
    });
    assert.deepEqual(
      await kiosk.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.includes("visit")),
      ),
      [],
    );
    assert.notEqual(
      (
        await post(kiosk, "/api/kiosk/visits", {
          action: "checkin",
          id: visit.id,
          version: visit.version,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(kiosk, "/api/kiosk/login", {
          code: kioskCode,
          placeId: "cc-center",
        })
      ).status,
      200,
    );
    await kiosk.goto(base + "/kiosk/visits");
    await kiosk.type("#kiosk-visit-reference", visit.id.slice(0, 8));
    await kiosk.click("button[type=submit]");
    await kiosk.waitForFunction(() =>
      document
        .querySelector("main")
        ?.textContent?.includes("이곳에 도착했어요"),
    );
    const arrival = await post(kiosk, "/api/kiosk/visits", {
      action: "checkin",
      id: visit.id,
      version: visit.version,
    });
    assert.equal(arrival.status, 200);
    checks.push({
      journey:
        "other kiosk reference → meeting map → privacy boundary → booked kiosk → arrival",
      passed: true,
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, "verification.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ scans: checks.length, errors }));
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
