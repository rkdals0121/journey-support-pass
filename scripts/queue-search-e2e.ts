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
    errors: string[] = [],
    receipts: string[] = [];
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/queue-search";
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
  try {
    const desk = await browser.newPage();
    desk.on("pageerror", (e) => errors.push(String(e)));
    await desk.goto(base + "/staff/login");
    assert.equal(
      (
        await api(desk, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    const jobs = [];
    for (const service of ["guidance", "robot"]) {
      const receipt = crypto.randomBytes(32).toString("hex");
      receipts.push(receipt);
      const result = await api(desk, "/api/requests/create", {
        receipt,
        service,
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "검색 화면 검증",
        lang: "ko",
        consent: true,
      });
      assert.equal(result.status, 200);
      jobs.push(result.body.request);
    }
    await desk.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    await desk.waitForSelector("#queue-search");
    await desk.type("#queue-search", jobs[0].id);
    await desk.click('button[type="submit"]');
    await desk.waitForFunction(
      (id) =>
        document.querySelectorAll("[data-request-id]").length === 1 &&
        document
          .querySelector("[data-request-id]")
          ?.getAttribute("data-request-id") === id,
      {},
      jobs[0].id,
    );
    check("request-id search returns one matching card", true);
    check(
      "filtered total is independent of the daily summary",
      await desk.evaluate(() =>
        document.body.innerText.includes("검색·필터 결과 1건"),
      ),
    );
    await desk.click("details[data-queue-filters] summary");
    await desk.select("#queue-service", "robot");
    await desk.waitForFunction(
      () =>
        document.body.innerText.includes("검색·필터 결과 0건") &&
        document.body.innerText.includes("표시할 요청이 없습니다."),
    );
    check("server filters combine with the search", true);
    await desk.setRequestInterception(true);
    desk.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname === "/api/staff/requests" &&
        url.searchParams.get("service") === "robot"
      )
        setTimeout(() => void request.continue().catch(() => {}), 400);
      else void request.continue().catch(() => {});
    });
    await desk.select("#queue-service", "guidance");
    await desk.select("#queue-service", "robot");
    await desk.select("#queue-service", "guidance");
    await desk.waitForFunction(
      (id) =>
        document.querySelectorAll("[data-request-id]").length === 1 &&
        document
          .querySelector("[data-request-id]")
          ?.getAttribute("data-request-id") === id,
      {},
      jobs[0].id,
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    check(
      "late responses from older filters cannot replace the latest result",
      await desk
        .$eval(
          "[data-request-id]",
          (e,id) => e.getAttribute("data-request-id") === id,
          jobs[0].id,
        )
        .catch(() => false),
    );
    await desk.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "검색·필터 초기화")!
        .click(),
    );
    await desk.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>("#queue-search")?.value ===
          "" &&
        document.querySelector<HTMLSelectElement>("#queue-service")?.value ===
          "all",
    );
    check(
      "reset restores whole-queue defaults",
      await desk.$eval(
        "#queue-order",
        (e) => (e as HTMLSelectElement).value === "priority",
      ),
    );
    await desk.evaluate(() =>
      Array.from(document.querySelectorAll("label"))
        .find((l) => l.textContent?.includes("처리 이력 포함"))!
        .querySelector("input")!
        .click(),
    );
    await desk.select("#queue-limit", "25");
    await desk.select("#queue-order", "newest");
    await desk.waitForFunction(
      () =>
        !document.body.innerText.includes("불러오는 중…") &&
        document.querySelectorAll("[data-request-id]").length > 0,
    );
    const listing = await api(
      desk,
      "/api/staff/requests?history=1&limit=25&order=newest",
    );
    check(
      "page-size control is applied on the server",
      listing.body.limit === 25 && listing.body.requests.length <= 25,
    );
    if (listing.body.total > 25) {
      const before = await desk.$$eval("[data-request-id]", (cards) =>
        cards.map((c) => c.getAttribute("data-request-id")),
      );
      await desk.evaluate(() =>
        Array.from(document.querySelectorAll("button"))
          .find((b) => b.textContent === "다음 목록")!
          .click(),
      );
      await desk.waitForFunction(() =>
        document.body.innerText.includes("건 중 26–"),
      );
      const after = await desk.$$eval("[data-request-id]", (cards) =>
        cards.map((c) => c.getAttribute("data-request-id")),
      );
      check(
        "next page shows different records under the same filters",
        after.every((id) => !before.includes(id)),
      );
      await desk.select("#request-filter", "waiting");
      await desk.waitForFunction(
        () =>
          !document.body.innerText.includes("건 중 26–") &&
          !document.body.innerText.includes("불러오는 중…"),
      );
      check("changing scope resets page offset", true);
    }
    await desk.setViewport({ width: 390, height: 844 });
    check(
      "search controls fit a phone",
      await desk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await desk.addScriptTag({
      path: path.resolve("node_modules/axe-core/axe.min.js"),
    });
    const a11y = await desk.evaluate(async () => {
      const win = window as unknown as {
        axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> };
      };
      return win.axe.run({
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
    });
    check(
      "queue controls pass accessibility checks",
      a11y.violations.length === 0,
    );
    check("no browser runtime errors", errors.length === 0);
    await desk.screenshot({
      path: path.join(out, "queue-search-mobile.png"),
      fullPage: true,
    });
    for (const receipt of receipts)
      await api(desk, "/api/requests/cancel", { receipt });
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Queue search browser checks:", checks.length);
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
