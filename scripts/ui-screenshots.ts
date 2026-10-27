import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { readSeedZones } from "../src/lib/zones";

async function main() {
  const base = "http://127.0.0.1:3100";
  const out = path.resolve(process.env.UI_OUTPUT ?? ".e2e-shots/ui");
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const checks: string[] = [];
  const require = createRequire(import.meta.url);
  async function audit(name: string) {
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: (options: unknown) => Promise<{
              violations: {
                id: string;
                impact: string;
                nodes: { target: string[] }[];
              }[];
            }>;
          };
        }
      ).axe;
      return (
        await axe.run({
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations
        .filter((v) => ["serious", "critical"].includes(v.impact))
        .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
    });
    if (violations.length)
      throw new Error(`${name}: ${JSON.stringify(violations)}`);
    checks.push(`${name} accessibility`);
  }
  try {
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 1000 });
      for (const [name, route] of [
        ["home", "/"],
        ["services", "/services"],
        ["help", "/help?topic=mobility&fresh=1"],
        ["requests", "/requests"],
        ["prepare", "/prepare"],
        ["checklist", "/register"],
        ["kiosk", "/devices/kiosk"],
        ["robot", "/devices/robot"],
        ["device-check", "/check"],
      ]) {
        await page.goto(base + route, { waitUntil: "networkidle2" });
        if (name === "home")
          await page.waitForFunction(
            () =>
              !document
                .querySelector(".my-request-panel")
                ?.textContent?.includes("확인 중"),
          );
        if (
          ["checklist", "kiosk", "robot", "device-check"].includes(name) &&
          width === 390
        )
          await audit(name);
        await page.screenshot({
          path: `${out}/${name}-${width}.png`,
          fullPage: true,
        });
        const fits = await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        );
        if (!fits) throw new Error(`${name} overflows at ${width}`);
        checks.push(`${name} ${width}px fits`);
        if (name === "checklist") {
          const clear = await page.evaluate(() => {
            const cta = document
              .querySelector(".flow-cta")
              ?.getBoundingClientRect();
            return (
              !cta ||
              [...document.querySelectorAll(".choice")].every((e) => {
                const row = e.getBoundingClientRect();
                return (
                  row.bottom <= 0 ||
                  row.top >= innerHeight ||
                  cta.top >= innerHeight ||
                  cta.bottom <= row.top ||
                  cta.top >= row.bottom
                );
              })
            );
          });
          if (!clear)
            throw new Error(`Checklist action obscures a choice at ${width}px`);
          checks.push(`checklist ${width}px action does not cover choices`);
          await page.focus('.choice[role="checkbox"]');
          await page.keyboard.press("Space");
          await page.waitForSelector(
            '.choice[role="checkbox"][aria-checked="true"]',
          );
          checks.push(`checklist ${width}px keyboard selection works`);
        }
      }
    }
    await page.goto(base + "/staff/login");
    const zones = readSeedZones();
    await page.evaluate(
      async (codes) => {
        const r = await fetch("/api/admin/setup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer dx-local-check-only",
          },
          body: JSON.stringify({ codes }),
        });
        if (!r.ok) throw new Error("isolated staff setup failed");
      },
      Object.fromEntries(zones.map((z) => [z.id, z.code])),
    );
    await page.evaluate(
      async (code) => {
        const r = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!r.ok) throw new Error("isolated staff login failed");
      },
      zones.find((z) => z.isDesk)!.code,
    );
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 1000 });
      for (const [name, route] of [
        ["staff-requests", "/staff/requests"],
        ["staff-resources", "/staff/resources"],
        ["staff-overview", "/staff/overview"],
        ["staff-checklist", "/staff/desk/register"],
      ]) {
        await page.goto(base + route, { waitUntil: "networkidle2" });
        if (name === "staff-requests")
          await page.waitForFunction(
            () =>
              document
                .querySelector(".work-result-count")
                ?.textContent?.trim() !== "—",
          );
        if (width === 390) await audit(name);
        await page.screenshot({
          path: `${out}/${name}-${width}.png`,
          fullPage: true,
        });
        if (
          !(await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ))
        )
          throw new Error(`${name} overflows at ${width}`);
        checks.push(`${name} ${width}px fits`);
      }
    }
    fs.writeFileSync(
      `${out}/checks.json`,
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(
      `${checks.length} layout checks; ${errors.length} runtime errors. Screenshots: ${out}`,
    );
    if (errors.length) throw new Error(errors.join("\n"));
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
