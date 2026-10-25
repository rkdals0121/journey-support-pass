import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local test server only");
  const output = process.env.SHOTS_DIR ?? ".e2e-shots/dx";
  fs.mkdirSync(output, { recursive: true });
  const chrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!chrome) throw new Error("Browser not installed");
  const seed = readSeedZones();
  const codes = Object.fromEntries(seed.map((z) => [z.id, z.code]));
  const setup = await fetch(base + "/api/admin/setup", {
    method: "POST",
    headers: {
      Authorization: "Bearer dx-local-check-only",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ codes, mockFlights: true }),
  });
  assert.equal(setup.status, 200, await setup.text());
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox"],
  });
  const checks: string[] = [];
  const check = (name: string, truth: boolean) => {
    assert.ok(truth, name);
    checks.push(name);
    console.log("PASS", name);
  };
  try {
    const passengerContext = await browser.createBrowserContext();
    const staffContext = await browser.createBrowserContext();
    const page = await passengerContext.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const staff = await staffContext.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    staff.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + "/help?place=cc-center", {
      waitUntil: "networkidle0",
      timeout: 240000,
    });
    await page.waitForSelector("#dx-place");
    check(
      "location QR preselects current pickup",
      await page.$eval(
        "#dx-place",
        (e) => (e as HTMLSelectElement).value === "cc-center",
      ),
    );
    await page.click('input[name="service"][value="robot"]');
    await page.$eval('input[type="checkbox"][required]', (e) =>
      (e as HTMLInputElement).click(),
    );
    await page.click('button[type="submit"]');
    await page.waitForFunction(() =>
      document.body.innerText.includes("요청 전 확인"),
    );
    await page.screenshot({
      path: path.join(output, "01-review.png"),
      fullPage: true,
    });
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent?.includes("이 내용으로 요청 접수"))
        ?.click();
    });
    await page.waitForFunction(
      () => !!document.querySelector('h2[role="status"]'),
      { timeout: 60000 },
    );
    check(
      "unregistered passenger submits without flight or documents",
      await page.$eval('h2[role="status"]', (e) => e.textContent === "접수됨"),
    );
    await page.screenshot({
      path: path.join(output, "02-received.png"),
      fullPage: true,
    });
    await staff.goto(base + "/staff/login", { waitUntil: "networkidle0" });
    const deskCode = seed.find((z) => z.isDesk)!.code;
    const login = await staff.evaluate(async (code) => {
      const r = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      return r.status;
    }, deskCode);
    check("staff login", login === 200);
    await staff.goto(base + "/staff/requests", {
      waitUntil: "networkidle0",
      timeout: 240000,
    });
    await staff.waitForFunction(() =>
      document.body.innerText.includes("찾아오는 안내로봇"),
    );
    check(
      "operator sees pickup point",
      (await staff.evaluate(() => document.body.innerText)).includes(
        "116번 탑승구 앞",
      ),
    );
    check(
      "unconfigured push clearly falls back to foreground alerts",
      (await staff.evaluate(() => document.body.innerText)).includes(
        "운영 설정이 필요합니다",
      ),
    );
    check(
      "opening staff screen does not request browser notification permission",
      await staff.evaluate(
        () =>
          !("Notification" in window) || Notification.permission === "default",
      ),
    );
    await staff.screenshot({
      path: path.join(output, "03-staff.png"),
      fullPage: true,
    });
    const currentId = await page.evaluate(async () => {
      const receipt = sessionStorage.getItem("jsp-dx-receipt-v1");
      return (
        await (
          await fetch("/api/requests/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receipt }),
          })
        ).json()
      ).request.id as string;
    });
    for (const label of [
      "제가 맡겠습니다",
      "현장으로 출발",
      "현장 도착",
      "지원 시작",
      "지원 완료",
    ]) {
      await staff.waitForFunction(
        ([text, id]) =>
          Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              `[data-request-id="${id}"] button`,
            ),
          ).some((b) => b.textContent === text && !b.disabled),
        {},
        [label, currentId],
      );
      await staff.evaluate(
        ([text, id]) =>
          Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              `[data-request-id="${id}"] button`,
            ),
          )
            .find((b) => b.textContent === text)
            ?.click(),
        [label, currentId],
      );
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    await page.waitForFunction(
      () => document.querySelector('h2[role="status"]')?.textContent === "완료",
      { timeout: 15000 },
    );
    check(
      "same request completes across passenger and operator browsers",
      true,
    );
    await page.screenshot({
      path: path.join(output, "04-complete.png"),
      fullPage: true,
    });
    // Restore receipt after reload, then start a new English request.
    await page.reload({ waitUntil: "networkidle0" });
    check(
      "receipt restores after reload",
      await page.$eval('h2[role="status"]', (e) => e.textContent === "완료"),
    );
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "새 요청 시작")
        ?.click(),
    );
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "English")
        ?.click(),
    );
    await page.waitForSelector("#dx-place");
    check(
      "English request form",
      (await page.evaluate(() => document.body.innerText)).includes(
        "Where are you now?",
      ),
    );
    await page.select("#dx-place", "t1-info");
    await page.click('input[type="checkbox"][required]');
    await page.click('button[type="submit"]');
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "Send this request")
        ?.click(),
    );
    await page.waitForSelector('h2[role="status"]');
    page.on("dialog", (d) => void d.accept());
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "Cancel request")
        ?.click(),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('h2[role="status"]')?.textContent ===
        "Cancelled",
    );
    check("passenger cancels a new request", true);
    // Pre-registration is still available and can feed the same new queue.
    const reg = await page.evaluate(async () => {
      const flights = await (await fetch("/api/flights/search?q=MK127")).json();
      const flight = flights.flights[0];
      const r = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flightDate: flight.flightDate,
          flightNo: flight.flightNo,
          choices: ["tr_walk", "gd_large", "mov_no_stairs"],
          party: 3,
          consent: true,
          lang: "ko",
          startedAt: new Date().toISOString(),
        }),
      });
      return { status: r.status, data: await r.json() };
    });
    check("existing pre-registration API still works", reg.status === 200);
    // Clear the ended request's local receipt before starting one linked to saved needs.
    await page.evaluate(() => sessionStorage.removeItem("jsp-dx-receipt-v1"));
    await page.goto(base + `/p/${reg.data.token}/help`, {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector("#dx-place");
    check(
      "saved needs are loaded in linked flow",
      await page.$eval('input[type="checkbox"]', () =>
        document.body.innerText.includes(
          "사전등록의 필요한 도움을 불러왔습니다",
        ),
      ),
    );
    check(
      "saved party size is reused",
      await page.$eval(
        "#dx-party",
        (e) => (e as HTMLInputElement).value === "3",
      ),
    );
    await page.select("#dx-place", "cc-center");
    await page.click('input[type="checkbox"][required]');
    await page.click('button[type="submit"]');
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "이 내용으로 요청 접수")
        ?.click(),
    );
    await page.waitForSelector('h2[role="status"]');
    check(
      "pre-registered request joins integrated processing",
      (await page.evaluate(() => document.body.innerText)).includes(
        "사전등록 내용을 연결한 요청",
      ),
    );
    // Layout and automated accessibility checks on both major screens.
    const axe = fs.readFileSync(
      path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
      "utf8",
    );
    for (const [target, name] of [
      [page, "passenger"],
      [staff, "staff"],
    ] as const) {
      await target.addScriptTag({ content: axe });
      const violations = await target.evaluate(async () => {
        const a = (
          window as unknown as {
            axe: {
              run: (
                options: unknown,
              ) => Promise<{ violations: { id: string; impact: string }[] }>;
            };
          }
        ).axe;
        return (
          await a.run({
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
            },
          })
        ).violations.map((v) => ({ id: v.id, impact: v.impact }));
      });
      if (violations.length)
        console.error(
          name,
          "accessibility violations",
          JSON.stringify(violations),
        );
      check(name + " accessibility rules", violations.length === 0);
    }
    await page.setViewport({ width: 360, height: 640 });
    await page.screenshot({
      path: path.join(output, "05-linked-small.png"),
      fullPage: true,
    });
    check(
      "small mobile has no horizontal overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    check("no client runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`DX browser checks: ${checks.length} passed`);
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
