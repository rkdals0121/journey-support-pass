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
  if (!executablePath) throw new Error("Browser not installed");
  const browser = await puppeteer.launch({ executablePath, headless: true }),
    checks: string[] = [],
    errors: string[] = [];
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/shared-claims";
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  async function api(p: Page, route: string, body?: unknown, method?: string) {
    return p.evaluate(
      async (route, body, method) => {
        const r = await fetch(route, {
          method: method ?? (body === undefined ? "GET" : "POST"),
          headers: { "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: r.status, body: await r.json() };
      },
      route,
      body,
      method,
    );
  }
  const seed = readSeedZones();
  try {
    const passenger = await (await browser.createBrowserContext()).newPage();
    await passenger.goto(base + "/register");
    const kiosk = await (await browser.createBrowserContext()).newPage();
    await kiosk.goto(base + "/kiosk");
    assert.equal(
      (
        await api(kiosk, "/api/kiosk/login", {
          code: seed.find((z) => z.isKiosk)!.code,
          placeId: "cc-108",
        })
      ).status,
      200,
    );
    const flights = await api(passenger, "/api/flights/search?q=MK127"),
      f = flights.body.flights[0];
    if (!f) throw new Error("Prepare fixtures with dx-e2e.ts");
    async function register() {
      const reg = await api(passenger, "/api/registrations", {
        flightDate: f.flightDate,
        flightNo: f.flightNo,
        choices: [],
        party: 1,
        consent: true,
        lang: "ko",
        startedAt: new Date().toISOString(),
      });
      assert.equal(reg.status, 200);
      return reg.body.token as string;
    }
    function body(token: string, receipt: string, service = "guidance") {
      return {
        receipt,
        registrationToken: token,
        service,
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "경로 간 중복 검증",
        lang: "ko",
        consent: true,
      };
    }
    const token = await register(),
      receipt = crypto.randomBytes(32).toString("hex");
    assert.equal(
      (await api(passenger, "/api/requests/create", body(token, receipt)))
        .status,
      200,
    );
    const blocked = await api(kiosk, "/api/kiosk/call", { token });
    check(
      "cached call endpoint cannot duplicate a new guidance request",
      blocked.status === 409 && blocked.body.code === "duplicate_service",
    );
    const linked = await api(passenger, "/api/pass/requests", { token });
    check(
      "pre-registration shows one active service",
      linked.body.requests.filter(
        (r: { state: string }) => r.state === "received",
      ).length === 1,
    );
    assert.equal(
      (await api(passenger, "/api/requests/cancel", { receipt })).status,
      200,
    );
    const old = await api(kiosk, "/api/kiosk/call", { token });
    check("cancellation frees the shared service claim", old.status === 200);
    const duplicateReceipt = crypto.randomBytes(32).toString("hex");
    await passenger.goto(base + `/p/${token}/help?lang=en`, {
      waitUntil: "networkidle0",
    });
    passenger.on("pageerror", (e) => errors.push(String(e)));
    await passenger.evaluate(()=>Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="English")!.click());
    await passenger.select("#dx-place", "cc-center");
    await passenger.click('input[type="checkbox"][required]');
    await passenger.click('button[type="submit"]');
    await passenger.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "Send this request",
      ),
    );
    await passenger.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "Send this request")!
        .click(),
    );
    await passenger.waitForFunction(() =>
      document.body.innerText.includes(
        "A request for this service is already active",
      ),
    );
    check("English duplicate recovery explains the existing request", true);
    await passenger.screenshot({
      path: path.join(out, "duplicate-recovery-en.png"),
      fullPage: true,
    });
    assert.equal(
      (await api(kiosk, "/api/kiosk/call/" + old.body.id, undefined, "DELETE"))
        .status,
      200,
    );
    check(
      "old call cancellation releases the same shared claim",
      (
        await api(
          passenger,
          "/api/requests/create",
          body(token, duplicateReceipt),
        )
      ).status === 200,
    );
    await api(passenger, "/api/requests/cancel", { receipt: duplicateReceipt });
    const mobilityToken = await register(),
      mobilityReceipt = crypto.randomBytes(32).toString("hex");
    assert.equal(
      (
        await api(
          passenger,
          "/api/requests/create",
          body(mobilityToken, mobilityReceipt, "mobility"),
        )
      ).status,
      200,
    );
    check(
      "cached mobility endpoint cannot duplicate an integrated mobility request",
      (await api(kiosk, "/api/assist", { token: mobilityToken })).status ===
        409,
    );
    await api(passenger, "/api/requests/cancel", { receipt: mobilityReceipt });
    const raceToken = await register(),
      raceReceipt = crypto.randomBytes(32).toString("hex");
    const [modern, legacy] = await Promise.all([
      api(passenger, "/api/requests/create", body(raceToken, raceReceipt)),
      api(kiosk, "/api/kiosk/call", { token: raceToken }),
    ]);
    check(
      "separate browser requests have exactly one winning writer",
      [modern.status, legacy.status].sort().join(",") === "200,409",
    );
    const progress = await api(passenger, "/api/pass/requests", {
      token: raceToken,
    });
    check(
      "simultaneous mixed-source writers leave one active result",
      progress.body.requests.filter(
        (r: { state: string }) => r.state === "received",
      ).length === 1,
    );
    if (modern.status === 200)
      await api(passenger, "/api/requests/cancel", { receipt: raceReceipt });
    else
      await api(
        kiosk,
        "/api/kiosk/call/" + legacy.body.id,
        undefined,
        "DELETE",
      );
    check("no browser runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Shared service claim checks:", checks.length);
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

