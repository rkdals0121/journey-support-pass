import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const checks: string[] = [],
    errors: string[] = [];
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/resources";
  fs.mkdirSync(out, { recursive: true });
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
  async function click(p: Page, text: string, id?: string) {
    const selector = id ? `[data-request-id="${id}"]` : "body";
    await p.waitForFunction(
      (selector, text) =>
        Array.from(
          document.querySelector(selector)?.querySelectorAll("button") ?? [],
        ).some((b) => b.textContent?.trim() === text && !b.disabled),
      {},
      selector,
      text,
    );
    await p.evaluate(
      (selector, text) =>
        Array.from(
          document
            .querySelector(selector)
            ?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        )
          .find((b) => b.textContent?.trim() === text)
          ?.click(),
      selector,
      text,
    );
  }
  try {
    const desk = await browser.newPage();
    desk.on("pageerror", (e) => errors.push(String(e)));
    await desk.goto(base + "/staff/login");
    const seed = readSeedZones();
    assert.equal(
      (
        await api(desk, "/api/staff/login", {
          code: seed.find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    await desk.goto(base + "/staff/resources", { waitUntil: "networkidle0" });
    const label = "모의 로봇 검증 " + Date.now();
    await desk.type("#resource-label", label);
    await desk.select("#resource-zone", "cc-center");
    await click(desk, "장비 등록");
    await desk.waitForFunction(
      (label) => document.body.innerText.includes(label),
      {},
      label,
    );
    const inventory = (await api(desk, "/api/staff/resources")).body.resources;
    const gear = inventory.find((g: { label: string }) => g.label === label);
    check(
      "desk registers an explicit pilot device",
      !!gear && gear.status === "ready",
    );
    const receipts = [
      crypto.randomBytes(32).toString("hex"),
      crypto.randomBytes(32).toString("hex"),
    ];
    const jobs = [];
    for (const receipt of receipts) {
      const created = await api(desk, "/api/requests/create", {
        receipt,
        service: "robot",
        placeId: "cc-center",
        choices: [],
        party: 1,
        note: "모의 배차 검증",
        lang: "ko",
        consent: true,
      });
      assert.equal(created.status, 200);
      const assigned = await api(desk, "/api/staff/requests", {
        id: created.body.request.id,
        version: created.body.request.version,
        action: "assign",
      });
      assert.equal(assigned.status, 200);
      jobs.push(assigned.body.request);
    }
    await desk.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    await desk.waitForSelector(`#resource-${jobs[0].id}`);
    await desk.select(`#resource-${jobs[0].id}`, gear.id);
    await click(desk, "선택 장비 배차", jobs[0].id);
    await desk.waitForFunction(
      (id, label) =>
        document
          .querySelector(`[data-request-id="${id}"]`)
          ?.textContent?.includes("배차 장비: " + label),
      {},
      jobs[0].id,
      label,
    );
    check("selected device appears on the actual request", true);
    check(
      "allocated device is absent from another request picker",
      !(
        await desk.$$eval(`#resource-${jobs[1].id} option`, (options) =>
          options.map((o) => (o as HTMLOptionElement).value),
        )
      ).includes(gear.id),
    );
    check(
      "server rejects a forced duplicate allocation",
      (
        await api(desk, "/api/staff/resources", {
          action: "allocate",
          requestId: jobs[1].id,
          version: jobs[1].version,
          resourceId: gear.id,
        })
      ).status === 409,
    );
    await click(desk, "처리·인계 이력 확인", jobs[0].id);
    await desk.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"] ol`)
          ?.textContent?.includes("장비 배차"),
      {},
      jobs[0].id,
    );
    check("allocation is visible in work history", true);
    await desk.screenshot({
      path: path.join(out, "allocated-request.png"),
      fullPage: true,
    });
    for (const text of [
      "로봇 출발 · 모의",
      "현장 도착",
      "지원 시작",
      "지원 완료",
    ])
      await click(desk, text, jobs[0].id);
    await desk.waitForFunction(
      async (id) => {
        const b = await (await fetch("/api/staff/resources")).json();
        return b.resources.some(
          (g: { id: string; requestId: string | null }) =>
            g.id === id && g.requestId === null,
        );
      },
      {},
      gear.id,
    );
    check("completion returns the device to available capacity", true);
    await desk.goto(base + "/staff/resources", { waitUntil: "networkidle0" });
    await desk.waitForSelector(`[data-resource-id="${gear.id}"]`);
    await desk.evaluate(
      (id) =>
        Array.from(
          document
            .querySelector(`[data-resource-id="${id}"]`)!
            .querySelectorAll("button"),
        )
          .find((b) => b.textContent === "점검 중으로 변경")!
          .click(),
      gear.id,
    );
    await desk.waitForFunction(
      (id) =>
        document.querySelector(`[data-resource-id="${id}"] strong`)
          ?.textContent === "점검 중",
      {},
      gear.id,
    );
    check("maintenance status updates through the inventory screen", true);
    check(
      "maintenance device cannot be allocated",
      (
        await api(desk, "/api/staff/resources", {
          action: "allocate",
          requestId: jobs[1].id,
          version: jobs[1].version,
          resourceId: gear.id,
        })
      ).status === 409,
    );
    await desk.evaluate(
      (id) =>
        Array.from(
          document
            .querySelector(`[data-resource-id="${id}"]`)!
            .querySelectorAll("button"),
        )
          .find((b) => b.textContent === "가용으로 변경")!
          .click(),
      gear.id,
    );
    await desk.waitForFunction(
      (id) =>
        document.querySelector(`[data-resource-id="${id}"] strong`)
          ?.textContent === "가용",
      {},
      gear.id,
    );
    assert.equal(
      (
        await api(desk, "/api/staff/resources", {
          action: "allocate",
          requestId: jobs[1].id,
          version: jobs[1].version,
          resourceId: gear.id,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api(desk, "/api/requests/cancel", { receipt: receipts[1] }))
        .status,
      200,
    );
    check(
      "passenger cancellation releases the reserved device",
      (await api(desk, "/api/staff/resources")).body.resources.find(
        (g: { id: string }) => g.id === gear.id,
      ).requestId === null,
    );
    await desk.setViewport({ width: 390, height: 844 });
    await desk.reload({ waitUntil: "networkidle0" });
    check(
      "inventory fits a narrow phone",
      await desk.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await desk.addScriptTag({
      path: path.resolve("node_modules/axe-core/axe.min.js"),
    });
    const axe = await desk.evaluate(async () => {
      const win = window as unknown as {
        axe: {
          run: (options: unknown) => Promise<{ violations: { id: string }[] }>;
        };
      };
      return win.axe.run({
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
    });
    check("inventory accessibility rules", axe.violations.length === 0);
    check("no browser runtime errors", errors.length === 0);
    await desk.screenshot({
      path: path.join(out, "inventory-mobile.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Resource browser checks:", checks.length);
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
