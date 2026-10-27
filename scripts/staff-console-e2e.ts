import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = "http://127.0.0.1:3100",
    b = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
    });
  const p = await b.newPage(),
    errors: string[] = [],
    checks: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  fs.mkdirSync(".e2e-shots/staff-console", { recursive: true });
  const check = (name: string, value: unknown) => {
    assert.ok(value, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const api = async (url: string, body?: unknown) =>
    p.evaluate(
      async (url, body) => {
        const res = await fetch(
          url,
          body === undefined
            ? undefined
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
        );
        return { status: res.status, body: await res.json() };
      },
      url,
      body,
    );
  try {
    await p.goto(base + "/staff/login");
    const zones = readSeedZones();
    check(
      "staff login",
      (
        await api("/api/staff/login", {
          code: zones.find((z) => z.isDesk)!.code,
        })
      ).status === 200,
    );
    const receipt = crypto.randomUUID().replaceAll("-", "").repeat(2);
    const made = await api("/api/requests/create", {
      receipt,
      placeId: "cc-center",
      service: "guidance",
      party: 1,
      choices: [],
      note: "직원 화면 검증",
      lang: "ko",
      consent: true,
      topicId: "facility",
      serviceDetails: {
        task: "cleaning",
        fields: { facility: "중앙 화장실", issue: "물기 제거" },
      },
    });
    check("local support request persisted", made.status === 200);
    const id = made.body.request.id;
    await p.setViewport({ width: 1440, height: 1000 });
    await p.goto(base + "/staff/requests");
    await p.waitForSelector(`[data-select-request="${id}"]`);
    await p.click(`[data-select-request="${id}"]`);
    await p.waitForSelector(".work-detail.is-current .btn-primary");
    await p.click(".work-detail.is-current .btn-primary");
    await p.waitForFunction(() =>
      document
        .querySelector(".work-detail.is-current")
        ?.textContent?.includes("처리 시작"),
    );
    check("assign action works from staff UI", true);
    for (const width of [1440, 1024, 768, 390]) {
      await p.setViewport({ width, height: 1000 });
      await p.goto(base + "/staff/requests");
      await p.waitForSelector(`[data-select-request="${id}"]`);
      check(
        `${width}px staff list fits`,
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (width < 1200) {
        await p.click(`[data-select-request="${id}"]`);
        await p.waitForSelector(".work-detail.is-current", { visible: true });
        check(
          `${width}px selection opens detail`,
          await p.$eval(
            ".work-master",
            (e) => getComputedStyle(e).display === "none",
          ),
        );
        check(
          `${width}px back control visible`,
          await p.$eval(
            ".work-back",
            (e) => getComputedStyle(e).display !== "none",
          ),
        );
      } else {
        await p.click(`[data-select-request="${id}"]`);
        check(
          "desktop shows list and detail together",
          await p.$eval(
            ".work-master",
            (e) => getComputedStyle(e).display !== "none",
          ),
        );
      }
      check(
        `${width}px staff detail fits`,
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await p.screenshot({
        path: `.e2e-shots/staff-console/detail-${width}.png`,
        fullPage: true,
      });
      if (width < 1200) {
        await p.click(".work-detail.is-current .work-back");
        await p.waitForSelector(".work-master", { visible: true });
        check(`${width}px back restores list`, true);
        await p.screenshot({
          path: `.e2e-shots/staff-console/list-${width}.png`,
          fullPage: true,
        });
      }
    }
    await p.setViewport({ width: 390, height: 844 });
    check(
      "mobile scope picker is visible",
      await p.$eval(
        "#request-filter",
        (e) =>
          getComputedStyle(e).display !== "none" &&
          (e as HTMLElement).getBoundingClientRect().height >= 40,
      ),
    );
    const [waitingResponse] = await Promise.all([
      p.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/staff/requests" &&
          new URL(r.url()).searchParams.get("scope") === "waiting",
      ),
      p.select("#request-filter", "waiting"),
    ]);
    const waitingData = await waitingResponse.json();
    check(
      "mobile scope picker loads the unassigned queue",
      waitingData.requests.every(
        (r: { state: string }) => r.state === "received",
      ),
    );
    await p.waitForSelector(".work-search>button.btn-ghost");
    await Promise.all([
      p.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/staff/requests" &&
          new URL(r.url()).searchParams.get("scope") === "all",
      ),
      p.click(".work-search>button.btn-ghost"),
    ]);
    check(
      "queue reset restores the full scope",
      await p.$eval(
        "#request-filter",
        (e) => (e as HTMLSelectElement).value === "all",
      ),
    );
    await p.click(".workspace-mobile-menu>summary");
    check(
      "mobile navigation includes integrations",
      await p.$eval(
        '.workspace-mobile-menu a[href="/staff/integrations"]',
        (e) => (e as HTMLElement).getBoundingClientRect().height > 0,
      ),
    );
    await Promise.all([
      p.waitForNavigation(),
      p.click('.workspace-mobile-menu a[href="/staff/integrations"]'),
    ]);
    await p.waitForSelector(".integration-badge");
    await p.waitForFunction(() => document.title.trim().length > 0);
    check(
      "staff mobile menu closes after navigation",
      await p.$eval(".workspace-mobile-menu", (e) => !e.hasAttribute("open")),
    );
    check(
      "integration page clearly says disconnected",
      await p.evaluate(
        () =>
          document.querySelectorAll(".integration-badge").length === 3 &&
          document.body.innerText.includes("미연결"),
      ),
    );
    check(
      "integration page fits mobile",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p.screenshot({
      path: ".e2e-shots/staff-console/integrations-mobile.png",
      fullPage: true,
    });
    const ready = await api("/api/staff/integrations");
    check(
      "readiness exposes no secrets",
      ready.status === 200 &&
        !/TOKEN|WEBHOOK_SECRET|https:\/\/sandbox/.test(
          JSON.stringify(ready.body),
        ),
    );
    check(
      "unconfigured transport rejects submission",
      (
        await api("/api/staff/integrations", {
          requestId: id,
          version: 1,
          channel: "agency",
        })
      ).status === 503,
    );
    check(
      "worker requires cron authorization",
      (await api("/api/cron/integrations")).status === 401,
    );
    const req = createRequire(import.meta.url);
    await p.addScriptTag({ path: req.resolve("axe-core/axe.min.js") });
    const issues = await p.evaluate(async () => {
      const w = window as unknown as {
        axe: {
          run: (
            o: unknown,
          ) => Promise<{ violations: { impact: string; id: string }[] }>;
        };
      };
      return (
        await w.axe.run({
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations;
    });
    if (issues.length) console.log(JSON.stringify(issues));
    check("integration page accessibility", issues.length === 0);
    await p.goto(base + "/staff/requests");
    await p.waitForSelector("[data-select-request]");
    await p.addScriptTag({ path: req.resolve("axe-core/axe.min.js") });
    const violations = await p.evaluate(async () => {
      const w = window as unknown as {
        axe: {
          run: (
            o: unknown,
          ) => Promise<{ violations: { impact: string; id: string }[] }>;
        };
      };
      return (
        await w.axe.run({
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations;
    });
    if (violations.length) console.log(violations);
    check("staff list accessibility", violations.length === 0);
    await p.click(`[data-select-request="${id}"]`);
    await p.waitForSelector(".work-detail.is-current .btn-primary", {
      visible: true,
    });
    await p.click(".work-detail.is-current .btn-primary");
    await p.waitForSelector(".work-detail.is-current .business-result-form", {
      visible: true,
    });
    await p.select(`#business-${id}-kind`, "resolved");
    await p.type(`#business-${id}-message`, "현장 물기 제거를 완료했습니다.");
    await p.click(".work-detail.is-current .business-confirm input");
    await p.click(
      ".work-detail.is-current .business-result-form button[type=submit]",
    );
    await p.waitForFunction(
      () =>
        document
          .querySelector(".work-detail.is-current .work-state-badge")
          ?.textContent?.trim() === "완료",
    );
    const final = await api("/api/requests/status", { receipt });
    check(
      "staff UI completion reaches passenger status",
      final.body.request.state === "done" &&
        final.body.request.resolution?.kind === "resolved",
    );
    check("no browser errors", errors.length === 0);
    console.log(`${checks.length} staff console checks passed`);
  } finally {
    await b.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
