import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3103";
  assert.ok(
    ["localhost", "127.0.0.1", "journey-support-pass.vercel.app"].includes(
      new URL(base).hostname,
    ),
  );
  const out = path.resolve(
    process.env.DEVICE_OUTPUT ?? ".e2e-shots/device-layout",
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
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1080, height: 1920 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewport(viewport);
      for (const lang of ["ko", "en"]) {
        await page.goto(base + "/devices/robot?lang=" + lang);
        await page.waitForSelector(".task-action-link");
        const label = `${viewport.width}x${viewport.height} ${lang}`;
        await page.screenshot({
          path: path.join(out, `robot-${viewport.width}-${lang}.png`),
          fullPage: true,
        });
        check(
          "robot actions stay full-width inside portrait frame " + label,
          await page.evaluate(() => {
            const body = document
              .querySelector(".device-preview-body")!
              .getBoundingClientRect();
            return [...document.querySelectorAll(".task-action")].every(
              (e) => e.getBoundingClientRect().width > body.width * 0.75,
            );
          }),
        );
        check(
          "robot sections stack vertically " + label,
          await page.evaluate(() => {
            const elements = [
              ...document.querySelector(".device-preview-body")!.children,
            ];
            return elements
              .slice(1)
              .every(
                (e, i) =>
                  e.getBoundingClientRect().top >=
                  elements[i].getBoundingClientRect().bottom - 1,
              );
          }),
        );
        check(
          "robot labels remain readable rather than one character per line " +
            label,
          await page.$$eval(".task-action-link strong", (elements) =>
            elements.every((e) => {
              const rect = e.getBoundingClientRect();
              const style = getComputedStyle(e);
              const line =
                parseFloat(style.lineHeight) ||
                parseFloat(style.fontSize) * 1.5;
              return (
                e.closest("a")!.getBoundingClientRect().width > 130 &&
                rect.height <= line * 3 + 1
              );
            }),
          ),
        );
        check(
          "robot fits page width " + label,
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        if (viewport.width === 1080)
          check(
            "portrait monitor has appropriately enlarged action text " + lang,
            await page.$eval(
              ".task-action-link strong",
              (e) => parseFloat(getComputedStyle(e).fontSize) >= 28,
            ),
          );
        check(
          "robot retains route and mobility links " + label,
          await page.$$eval(
            ".task-action-link",
            (links) =>
              links.length === 2 &&
              links.every((e) => !!(e as HTMLAnchorElement).href),
          ),
        );
        await page.screenshot({
          path: path.join(out, `robot-${viewport.width}-${lang}.png`),
          fullPage: true,
        });
      }
    }
    check("no runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`${checks.length} device layout checks passed`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
