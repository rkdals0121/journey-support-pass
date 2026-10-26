import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
import { createRequire } from "node:module";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local fixtures only");
  const setup = await fetch(base + "/api/admin/setup", {
    method: "POST",
    headers: {
      Authorization: "Bearer dx-local-check-only",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      codes: Object.fromEntries(readSeedZones().map((z) => [z.id, z.code])),
    }),
  });
  assert.equal(setup.status, 200);
  const browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
    }),
    checks: string[] = [],
    errors: string[] = [];
  const out = ".e2e-shots/pickup-finder";
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: unknown) => {
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
            ? {}
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
  const p = await (await browser.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const posts: string[] = [];
  p.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.postData() ?? "");
  });
  let receipt: string | null = null;
  try {
    await p.setViewport({ width: 1440, height: 1000 });
    await p.goto(base + "/help?topic=mobility");
    await p.waitForSelector("#dx-place-search");
    check(
      "the long manual list is collapsed initially",
      await p.$eval(".place-manual", (e) => !(e as HTMLDetailsElement).open),
    );
    await p.type("#dx-place-search", "130");
    await p.waitForSelector('[data-confirm-place="cc-130"]');
    check(
      "typing a gate does not silently select it",
      await p.$eval("#dx-place", (e) => (e as HTMLSelectElement).value === ""),
    );
    await p.click("input[type=checkbox][required]");
    await p.click("button[type=submit]");
    check(
      "unconfirmed text cannot advance to request review",
      (await p.$("#dx-place-search")) !== null &&
        (await p.evaluate(() =>
          document.body.innerText.includes("현재 계신 곳의 후보를 확인"),
        )),
    );
    await p.click('[data-confirm-place="cc-130"]');
    check(
      "explicit candidate confirmation selects the canonical gate",
      await p.$eval(
        "#dx-place",
        (e) => (e as HTMLSelectElement).value === "cc-130",
      ),
    );
    await p.screenshot({ path: out + "/search-pc.png", fullPage: true });
    await p.click(".place-confirmed button");
    const fixture = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 500;
      const x = c.getContext("2d")!;
      x.fillStyle = "white";
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "black";
      x.font = "bold 150px Arial";
      x.fillText("GATE 127", 60, 230);
      x.font = "64px Arial";
      x.fillText("CONCOURSE", 60, 370);
      return c.toDataURL("image/png");
    });
    const file = path.resolve(out, "gate-127.png");
    fs.writeFileSync(file, Buffer.from(fixture.split(",")[1], "base64"));
    const before = posts.length;
    await (await p.$("input#dx-place-photo"))!.uploadFile(file);
    await p.waitForFunction(
      () =>
        !!document.querySelector('[data-confirm-place="gate-127"]') ||
        !!document.querySelector('.place-finder [role="alert"]'),
      { timeout: 65000 },
    );
    check(
      "real on-device OCR reads a gate sign into a precise candidate",
      (await p.$('[data-confirm-place="gate-127"]')) !== null,
    );
    check(
      "photo reading does not upload a photo or submit a request",
      posts.length === before,
    );
    check(
      "OCR does not automatically confirm pickup",
      await p.$eval("#dx-place", (e) => (e as HTMLSelectElement).value === ""),
    );
    await p.screenshot({ path: out + "/photo-pc.png", fullPage: true });
    await p.setViewport({ width: 390, height: 844 });
    check(
      "mobile photo candidates fit without horizontal overflow",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: out + "/photo-mobile.png", fullPage: true });
    const photoAxe = createRequire(import.meta.url)("axe-core");
    await p.addScriptTag({ content: photoAxe.source });
    const photoViolations = (await p.evaluate(
      "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id))",
    )) as string[];
    check(
      "photo-confirmation form has no serious accessibility violations",
      photoViolations.length === 0,
    );
    await p.click('[data-confirm-place="gate-127"]');
    await p.select("#dx-destination", "cc-130");
    await p.click("button[type=submit]");
    await p.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "이 내용으로 요청 접수",
      ),
    );
    const sending = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/requests/create") &&
        r.request().method() === "POST",
    );
    await p.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "이 내용으로 요청 접수")!
        .click(),
    );
    const sent = await sending,
      body = await sent.json(),
      payload = JSON.parse(sent.request().postData() ?? "{}");
    check(
      "confirmed photo-derived pickup is accepted by the real API",
      sent.status() === 200 &&
        body.request.placeId === "gate-127" &&
        body.request.place.includes("127번"),
    );
    check(
      "API receives the canonical place id, never image or OCR text",
      payload.placeId === "gate-127" &&
        !JSON.stringify(payload).includes("CONCOURSE") &&
        !Object.keys(payload).some((k) => /photo|image|ocr/i.test(k)) &&
        !JSON.stringify(payload).includes("base64"),
    );
    receipt = payload.receipt;
    await p.waitForSelector('h2[role="status"]');
    check(
      "the temporary photo preview is removed after moving to request status",
      (await p.$('img[src^="blob:"]')) === null,
    );
    await p.type("#pickup-change-place-search", "125번 게이트");
    await p.waitForSelector('[data-confirm-place="cc-125"]');
    await p.click('[data-confirm-place="cc-125"]');
    const updating = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/requests/location") &&
        r.request().method() === "POST",
    );
    await p.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent === "새 만날 곳으로 변경")!
        .click(),
    );
    check(
      "location changes use the same confirmed search mechanism",
      (await updating).status() === 200,
    );
    const request = (await api(p, "/api/requests/status", { receipt })).body
      .request;
    check(
      "location change persists without re-submitting the original request",
      request.id === body.request.id && request.placeId === "cc-125",
    );
    const require = createRequire(import.meta.url),
      axe = require("axe-core");
    await p.addScriptTag({ content: axe.source });
    const violations = await p.evaluate(async () => {
      const r = await (
        window as unknown as {
          axe: {
            run: (
              d: Document,
              o: unknown,
            ) => Promise<{ violations: { id: string; impact: string }[] }>;
          };
        }
      ).axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations;
    });
    check(
      "picker has no serious automated accessibility violations",
      !violations.some((v) => ["critical", "serious"].includes(v.impact)),
    );
    await api(p, "/api/requests/cancel", { receipt });
    receipt = null;
    const second = await (await browser.createBrowserContext()).newPage();
    second.on("pageerror", (e) => errors.push(String(e)));
    await second.goto(base + "/help?lang=en");
    await second.waitForSelector("#dx-place-search");
    check(
      "English search finds the same gate",
      await second.$eval("#dx-place-search", (e) =>
        (e as HTMLInputElement).placeholder.includes("Gate"),
      ),
    );
    await second.type("#dx-place-search", "Gate 130");
    await second.waitForSelector('[data-confirm-place="cc-130"]');
    await second.click('[data-confirm-place="cc-130"]');
    check(
      "English candidate confirmation uses the same canonical place",
      await second.$eval(
        "#dx-place",
        (e) => (e as HTMLSelectElement).value === "cc-130",
      ),
    );
    await second.click(".place-confirmed button");
    await (await second.$("input#dx-place-photo"))!.uploadFile(file);
    await second.waitForSelector(".place-reading button");
    await second.click(".place-reading button");
    await second.type("#dx-place-search", "130");
    await second.waitForSelector('[data-confirm-place="cc-130"]');
    await second.click('[data-confirm-place="cc-130"]');
    await new Promise((resolve) => setTimeout(resolve, 1800));
    check(
      "cancelling OCR cannot overwrite a newer confirmed search",
      await second.$eval(
        "#dx-place",
        (e) => (e as HTMLSelectElement).value === "cc-130",
      ),
    );
    await second.click(".place-confirmed button");
    const unreadable = path.resolve(out, "unreadable.png");
    fs.writeFileSync(unreadable, "not an image");
    await (await second.$("input#dx-place-photo"))!.uploadFile(unreadable);
    await second.waitForSelector('.place-finder [role="alert"]');
    await second.type("#dx-place-search", "Gate 250");
    await second.waitForSelector('[data-confirm-place="t2-center"]');
    await second.click('[data-confirm-place="t2-center"]');
    check(
      "an unreadable photo still allows manual search and confirmation",
      await second.$eval(
        "#dx-place",
        (e) => (e as HTMLSelectElement).value === "t2-center",
      ),
    );
    check("no client runtime errors", errors.length === 0);
    console.log(`Pickup finder checks: ${checks.length} passed`);
  } catch (error) {
    await p
      .screenshot({ path: out + "/failure.png", fullPage: true })
      .catch(() => {});
    console.log(
      "Picker message:",
      await p.$$eval('.place-finder [role="alert"]', (es) =>
        es.map((e) => e.textContent),
      ),
    );
    throw error;
  } finally {
    if (receipt)
      await api(p, "/api/requests/cancel", { receipt }).catch(() => {});
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
