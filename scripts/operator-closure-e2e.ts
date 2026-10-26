import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local fixtures only");
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!executablePath) throw new Error("No browser installed");
  const browser = await puppeteer.launch({ executablePath, headless: true }),
    checks: string[] = [],
    errors: string[] = [];
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/operator-closure";
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: boolean) => {
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
  async function click(p: Page, label: string, id: string) {
    const selector = `[data-request-id="${id}"]`;
    await p.waitForFunction(
      (selector, label) =>
        Array.from(
          document.querySelector(selector)?.querySelectorAll("button") ?? [],
        ).some((b) => b.textContent?.trim() === label && !b.disabled),
      {},
      selector,
      label,
    );
    await p.evaluate(
      (selector, label) =>
        Array.from(
          document
            .querySelector(selector)!
            .querySelectorAll<HTMLButtonElement>("button"),
        )
          .find((b) => b.textContent?.trim() === label)!
          .click(),
      selector,
      label,
    );
  }
  async function closeViaUi(p: Page, id: string) {
    const selector = `[data-request-id="${id}"]`;
    await p.waitForSelector(selector);
    await p.type(`[id="reason-${id}"]`, "현장 확인: 시범 중복·종료 검증");
    check(
      "operator close still requires field confirmation",
      await p.$eval(
        selector,
        (e) =>
          Array.from(e.querySelectorAll("button")).find(
            (b) => b.textContent === "현장 확인 후 요청 종료",
          )!.disabled,
      ),
    );
    await p.click(selector + ' input[type="checkbox"]');
    await click(p, "현장 확인 후 요청 종료", id);
    await p.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.textContent?.includes("취소됨"),
      {},
      selector,
    );
    await click(p, "처리·인계 이력 확인", id);
    await p.waitForFunction(
      (selector) =>
        document
          .querySelector(selector + " ol")
          ?.textContent?.includes("운영자 확인 후 종료"),
      {},
      selector,
    );
  }
  try {
    const passenger = await (await browser.createBrowserContext()).newPage();
    await passenger.goto(base + "/help");
    const receipt = crypto.randomBytes(32).toString("hex"),
      created = await api(passenger, "/api/requests/create", {
        receipt,
        service: "guidance",
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "운영자 종료 화면 검증",
        lang: "ko",
        consent: true,
      });
    assert.equal(created.status, 200);
    const id = created.body.request.id;
    const desk = await (await browser.createBrowserContext()).newPage();
    desk.on("pageerror", (e) => errors.push(String(e)));
    passenger.on("pageerror", (e) => errors.push(String(e)));
    await desk.goto(base + "/staff/login");
    assert.equal(
      (
        await api(desk, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    await desk.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    await closeViaUi(desk, id);
    check(
      "integrated closure is auditable and does not become completed",
      (await api(passenger, "/api/requests/status", { receipt })).body.request
        .state === "cancelled",
    );
    await passenger.goto(base + "/help/receipt/" + receipt, {
      waitUntil: "networkidle0",
    });
    await passenger.waitForFunction(
      () =>
        document.querySelector('h2[role="status"]')?.textContent === "취소됨",
    );
    check(
      "passenger sees operator termination and its reason",
      await passenger.evaluate(() =>
        document.body.innerText.includes("현장 확인: 시범 중복·종료 검증"),
      ),
    );
    const future = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + 7 * 86400000));
    const marker = "종료검증-" + crypto.randomBytes(8).toString("hex");
    const registered = await api(passenger, "/api/registrations", {
      flightDate: future,
      flightNo: "MK9999",
      choices: [],
      party: 1,
      note: marker,
      consent: true,
      lang: "ko",
      startedAt: new Date().toISOString(),
    });
    assert.equal(registered.status, 200);
    const token = registered.body.token;
    assert.equal((await api(passenger, "/api/assist", { token })).status, 200);
    const list = await api(desk, "/api/staff/requests"),
      old = list.body.requests.find(
        (r: { queue: string; note: string }) =>
          r.queue === "assist" && r.note === marker,
      );
    assert.ok(old);
    await desk.reload({ waitUntil: "networkidle0" });
    await closeViaUi(desk, old.id);
    check(
      "retained mobility is cancelled through the unified desk",
      (await api(passenger, "/api/assist/status", { token })).body.request
        .state === "cancelled",
    );
    const history = await api(
      desk,
      `/api/staff/requests/${encodeURIComponent(old.id)}/history`,
    );
    check(
      "retained operator action has one real audit record",
      history.status === 200 &&
        history.body.history.length === 1 &&
        history.body.history[0].action === "operator_cancel",
    );
    const kiosk = await (await browser.createBrowserContext()).newPage();
    await kiosk.goto(base + "/kiosk");
    assert.equal(
      (
        await api(kiosk, "/api/kiosk/login", {
          code: readSeedZones().find((z) => z.isKiosk)!.code,
          placeId: "cc-108",
        })
      ).status,
      200,
    );
    const call = await api(kiosk, "/api/kiosk/call", { token });
    assert.equal(call.status, 200);
    const callId = "call:" + call.body.id;
    await desk.reload({ waitUntil: "networkidle0" });
    await closeViaUi(desk, callId);
    check(
      "retained kiosk call is cancelled through the unified desk",
      (await api(kiosk, "/api/kiosk/call/" + call.body.id)).body.state ===
        "cancelled",
    );
    await desk.setViewport({ width: 390, height: 844 });
    check(
      "operator controls fit narrow devices",
      await desk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await (await desk.$(`[data-request-id="${old.id}"]`))!.screenshot({
      path: path.join(out, "legacy-operator-closure.png"),
    });
    await api(passenger, "/api/pass/erase", { token });
    check(
      "erasure removes retained reason text",
      (
        await api(
          desk,
          `/api/staff/requests/${encodeURIComponent(old.id)}/history`,
        )
      ).body.history[0].reason === "",
    );
    check("no browser runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Operator closure browser checks:", checks.length);
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
