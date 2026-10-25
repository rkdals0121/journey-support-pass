import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Isolated local server only");
  const chrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!chrome) throw new Error("Browser unavailable");
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/kiosk-dx";
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
  });
  const checks: string[] = [];
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  async function click(p: Page, label: string) {
    await p.waitForFunction(
      (t) =>
        Array.from(document.querySelectorAll("button,a")).some(
          (e) => e.textContent?.trim() === t,
        ),
      {},
      label,
    );
    await p.evaluate(
      (t) =>
        (
          Array.from(document.querySelectorAll("button,a")).find(
            (e) => e.textContent?.trim() === t,
          ) as HTMLElement
        )?.click(),
      label,
    );
  }
  const seeds = readSeedZones();
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
    const context = await browser.createBrowserContext();
    const kiosk = await context.newPage();
    const errors: string[] = [];
    kiosk.on("pageerror", (e) => errors.push(String(e)));
    const oldWrites: string[] = [];
    let creates = 0;
    kiosk.on("request", (r) => {
      if (
        r.method() === "POST" &&
        ["/api/kiosk/call", "/api/assist"].includes(new URL(r.url()).pathname)
      )
        oldWrites.push(r.url());
      if (
        r.method() === "POST" &&
        new URL(r.url()).pathname === "/api/requests/create"
      )
        creates++;
    });
    await kiosk.goto(base + "/kiosk");
    const installed = await api(kiosk, "/api/kiosk/login", {
      code: seeds.find((z) => z.isKiosk)!.code,
      placeId: "t1-info",
    });
    check("kiosk installation", installed.status === 200);
    await kiosk.goto(base + "/kiosk/entry", { waitUntil: "networkidle0" });
    await click(kiosk, "탑승권 없이 도움 요청하기");
    await kiosk.waitForSelector("#dx-place");
    check(
      "boarding pass is optional at the entrance robot",
      new URL(kiosk.url()).pathname === "/help",
    );
    check(
      "installed location carries over and stays locked",
      await kiosk.$eval(
        "#dx-place",
        (e) =>
          (e as HTMLSelectElement).value === "t1-info" &&
          (e as HTMLSelectElement).disabled,
      ),
    );
    await kiosk.type("#dx-note", "앞사람 표시 확인용");
    await kiosk.click('input[type="checkbox"][required]');
    await kiosk.click('button[type="submit"]');
    check(
      "opening or reviewing assistance does not dispatch a request",
      creates === 0,
    );
    await click(kiosk, "이 내용으로 요청 접수");
    await kiosk.waitForSelector('h2[role="status"]');
    const receipt = await kiosk.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1"),
    );
    const sent = await api(kiosk, "/api/requests/status", { receipt });
    check(
      "new entrance request uses integrated queue",
      sent.status === 200 && sent.body.request.source === "kiosk",
    );
    check(
      "fresh-entry marker is consumed before reload",
      !new URL(kiosk.url()).searchParams.has("fresh"),
    );
    await kiosk.reload({ waitUntil: "networkidle0" });
    await kiosk.waitForSelector('h2[role="status"]');
    check(
      "reload restores the shared-screen request",
      (await kiosk.evaluate(() =>
        sessionStorage.getItem("jsp-dx-receipt-v1"),
      )) === receipt,
    );
    const staffContext = await browser.createBrowserContext();
    const staff = await staffContext.newPage();
    await staff.goto(base + "/staff/login");
    await api(staff, "/api/staff/login", {
      code: seeds.find((z) => z.isDesk)!.code,
    });
    await staff.goto(base + "/staff", { waitUntil: "networkidle0" });
    check(
      "staff root lands in integrated queue",
      new URL(staff.url()).pathname === "/staff/requests",
    );
    await staff.waitForSelector(`[data-request-id="${sent.body.request.id}"]`);
    check("staff sees the same kiosk request", true);
    const assigned = await api(staff, "/api/staff/requests", {
      id: sent.body.request.id,
      version: sent.body.request.version,
      action: "assign",
    });
    check("staff assignment succeeds", assigned.status === 200);
    await kiosk.waitForFunction(
      () =>
        document.querySelector('h2[role="status"]')?.textContent ===
        "담당자 배정",
    );
    check("shared kiosk receives the staff state", true);
    await click(kiosk, "접수는 유지하고 화면 비우기");
    await kiosk.waitForFunction(() => location.pathname === "/kiosk/entry");
    check(
      "finishing returns to the entrance robot and clears the receipt",
      await kiosk.evaluate(
        () =>
          sessionStorage.getItem("jsp-dx-receipt-v1") === null &&
          !document.body.innerText.includes("앞사람 표시 확인용"),
      ),
    );
    const maintained = await api(kiosk, "/api/requests/status", { receipt });
    check(
      "clearing the kiosk preserves the assigned request",
      maintained.body.request.state === "assigned",
    );
    await api(kiosk, "/api/requests/cancel", { receipt });
    await kiosk.goto(base + "/help?resume=1&returnTo=%2Fkiosk%2Fentry", {
      waitUntil: "networkidle0",
    });
    await kiosk.waitForSelector("#dx-place");
    check(
      "status lookup without a saved request explains the empty state",
      await kiosk.evaluate(() =>
        document.body.innerText.includes(
          "이 기기에 연결된 접수 내역이 없습니다",
        ),
      ),
    );
    const flights = await kiosk.evaluate(
      async () => await (await fetch("/api/flights/search?q=MK127")).json(),
    );
    const f = flights.flights[0];
    const reg = await api(kiosk, "/api/registrations", {
      flightDate: f.flightDate,
      flightNo: f.flightNo,
      choices: ["mov_no_stairs", "gd_large"],
      party: 3,
      consent: true,
      lang: "ko",
      startedAt: new Date().toISOString(),
    });
    check("registration remains available", reg.status === 200);
    await kiosk.goto(base + "/kiosk/guide", { waitUntil: "networkidle0" });
    await click(kiosk, "고유 일련 번호 누르기");
    for (const digit of reg.body.passNo)
      await kiosk.evaluate(
        (d) =>
          Array.from(
            document.querySelectorAll<HTMLButtonElement>(".pad-num .pad-key"),
          )
            .find((b) => b.innerText.trim() === d)
            ?.click(),
        digit,
      );
    await click(kiosk, "이대로 안내 받기");
    await kiosk.waitForSelector(".gate-sign");
    await kiosk.click(".call-btn");
    await kiosk.waitForSelector("#dx-place");
    check(
      "guide kiosk links the scanned registration",
      new URL(kiosk.url()).pathname === `/p/${reg.body.token}/help`,
    );
    check(
      "guide entry reuses needs and party",
      (await kiosk.$eval(
        "#dx-party",
        (e) => (e as HTMLInputElement).value === "3",
      )) &&
        (await kiosk.evaluate(
          () =>
            document.querySelectorAll('input[type="checkbox"]:checked')
              .length >= 2,
        )),
    );
    await kiosk.click('input[type="checkbox"][required]');
    await kiosk.click('button[type="submit"]');
    await click(kiosk, "이 내용으로 요청 접수");
    await kiosk.waitForSelector('h2[role="status"]');
    const linkedReceipt = await kiosk.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1"),
    );
    await kiosk.goto(
      base +
        `/p/${reg.body.token}/help?service=mobility&returnTo=%2Fkiosk%2Fentry&fresh=1`,
      { waitUntil: "networkidle0" },
    );
    await kiosk.waitForSelector('h2[role="status"]');
    check(
      "same passenger can reopen without losing their request",
      (await kiosk.evaluate(() =>
        sessionStorage.getItem("jsp-dx-receipt-v1"),
      )) === linkedReceipt,
    );
    await api(kiosk, "/api/requests/cancel", { receipt: linkedReceipt });
    const another = await api(kiosk, "/api/registrations", {
      flightDate: f.flightDate,
      flightNo: f.flightNo,
      choices: [],
      party: 1,
      consent: true,
      lang: "ko",
      startedAt: new Date().toISOString(),
    });
    await kiosk.goto(
      base +
        `/p/${another.body.token}/help?service=mobility&returnTo=%2Fkiosk%2Fentry`,
      { waitUntil: "networkidle0" },
    );
    await kiosk.waitForSelector("#dx-place");
    check(
      "another passenger never restores the prior registration request",
      await kiosk.evaluate(
        () =>
          sessionStorage.getItem("jsp-dx-receipt-v1") === null &&
          !document.querySelector('h2[role="status"]'),
      ),
    );
    check(
      "mobility service is selected before confirmation",
      await kiosk.$eval(
        'input[name="service"][value="mobility"]',
        (e) => (e as HTMLInputElement).checked,
      ),
    );
    await kiosk.screenshot({
      path: path.join(out, "linked-mobility.png"),
      fullPage: true,
    });
    await kiosk.goto(base + "/kiosk/register", { waitUntil: "networkidle0" });
    await kiosk.waitForSelector(".call-btn");
    check(
      "reserve registration kiosk uses the integrated entry",
      await kiosk.$eval(
        ".call-btn",
        (e) =>
          (e as HTMLAnchorElement)
            .getAttribute("href")
            ?.startsWith("/help?") === true,
      ),
    );
    await staff.goto(base + "/staff/legacy", { waitUntil: "networkidle0" });
    check(
      "previous request management remains accessible",
      await staff.evaluate(
        () =>
          document.body.innerText.includes("이전 직원 호출") &&
          document.body.innerText.includes("이전 이동지원"),
      ),
    );
    check(
      "kiosk entry never writes to either legacy queue",
      oldWrites.length === 0,
    );
    check("no kiosk client runtime errors", errors.length === 0);
    await staff.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    await click(staff, "나가기");
    await staff.waitForFunction(() => location.pathname === "/staff/login");
    check(
      "integrated staff screen can log out",
      (await staff.evaluate(
        async () => await fetch("/api/staff/requests").then((r) => r.status),
      )) === 401,
    );
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`Unified kiosk checks: ${checks.length} passed`);
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
