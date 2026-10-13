/** 태블릿 크기에서 키오스크 화면을 눌러 본다. (임시) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

const BASE = "http://localhost:3000";
const OUT = process.argv[2]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function tap(page: Page, sel: string, i = 0) {
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))), { timeout: 120_000 }, sel);
  await page.evaluate((s, n) => (document.querySelectorAll(s)[n] as HTMLElement).click(), sel, i);
  await sleep(450);
}
async function tapText(page: Page, sel: string, text: string) {
  await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => (e as HTMLElement).innerText?.includes(t)), { timeout: 60_000 }, sel, text);
  await page.evaluate((s, t) => ([...document.querySelectorAll(s)].find((e) => (e as HTMLElement).innerText?.includes(t)) as HTMLElement).click(), sel, text);
  await sleep(450);
}
async function note(page: Page, tag: string, name: string) {
  await sleep(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  const m = await page.evaluate(() => {
    const vh = innerHeight;
    const vw = innerWidth;
    const cta = document.querySelector(".flow-cta") as HTMLElement | null;
    const ctaTop = cta ? cta.getBoundingClientRect().top : vh;
    // 화면 아래 버튼 띠에 가려지는, 누를 수 있는 것들
    const hidden: string[] = [];
    const clipped: string[] = [];
    for (const el of document.querySelectorAll(".flow-body button, .flow-body [role=checkbox], .flow-body [role=radio], .flow-body input")) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (!r.width) continue;
      const label = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 14);
      if (r.top < vh && r.bottom > ctaTop + 2 && r.top < ctaTop) hidden.push(label);
      if (r.right > vw + 1 || r.left < -1) clipped.push(label);
      // 글자가 칸 밖으로 넘치는지
      if ((el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 2) clipped.push(`${label}(글자넘침)`);
    }
    const small = [...document.querySelectorAll("button, a, [role=checkbox], [role=radio]")]
      .map((e) => ({ r: (e as HTMLElement).getBoundingClientRect(), t: ((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().slice(0, 10) }))
      .filter((x) => x.r.width > 0 && (x.r.height < 44 || x.r.width < 44))
      .map((x) => `${x.t}(${Math.round(x.r.width)}x${Math.round(x.r.height)})`);
    return { rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize), screens: +(document.documentElement.scrollHeight / vh).toFixed(2), ox: document.documentElement.scrollWidth > vw + 1, hidden, clipped, small };
  });
  await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) as `${string}.png` });
  console.log(`[${tag}] ${name} 글자${m.rootPx}px 길이${m.screens}장${m.ox ? " ★가로넘침" : ""}${m.hidden.length ? " ★버튼띠에 걸침: " + m.hidden.join(",") : ""}${m.clipped.length ? " ★잘림: " + m.clipped.join(",") : ""}${m.small.length ? " 작은것: " + m.small.join(",") : ""}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsp-tab-"));
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: dir, protocolTimeout: 600_000 });
  try {
    const code = readSeedZones().find((z) => z.isKiosk)!.code;
    const login = async (placeId: string) => {
      const res = await fetch(`${BASE}/api/kiosk/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, placeId }) });
      return res.headers.get("set-cookie")!.split(";")[0].split("=");
    };
    const f = await (await fetch(`${BASE}/api/flights/search?q=MK127`)).json();
    const reg = await (
      await fetch(`${BASE}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightDate: f.flights[0].flightDate, flightNo: "MK127", choices: ["gd_large", "gd_picture", "mov_wheelchair_own", "mov_need_rest", "fac_restroom", "fac_rest", "stf_call"], lang: "ko", consent: true, startedAt: new Date(Date.now() - 60000).toISOString(), editCount: 0 }),
      })
    ).json();
    console.log("등록:", JSON.stringify(reg).slice(0, 120));

    for (const [w, h, tag] of [
      [1024, 768, "T가로1024"],
      [768, 1024, "T세로768"],
      [1180, 820, "T가로1180"],
      [820, 1180, "T세로820"],
    ] as const) {
      // 안내 키오스크
      {
        const [name, ...rest] = await login("cc-train");
        const k = await browser.newPage();
        await k.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: true });
        await k.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
        await k.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
        await tap(k, ".scan-alt button");
        await k.evaluate(() => window.history.length);
        await note(k, tag, "안내2-번호판");
        for (const d of reg.passNo as string) {
          await k.evaluate((x) => ([...document.querySelectorAll(".pad-num .pad-key")] as HTMLElement[]).find((e) => e.innerText.trim() === x)!.click(), d);
          await sleep(120);
        }
        await k.waitForSelector(".gate-go", { timeout: 60_000 });
        await note(k, tag, "안내3-맞춤안내");
        await tap(k, ".gate-go");
        await note(k, tag, "안내4-탑승구길");
        await tap(k, ".bar-btn", 0);
        await tap(k, ".call-btn");
        await note(k, tag, "안내5-직원부르는중");
        await tapText(k, ".sheet-box button", "기다리면서");
        await tap(k, ".bar-btn", 2);
        await tap(k, ".size-pick button", 3);
        await note(k, tag, "안내6-설정아주크게");
        await tap(k, ".settings .btn-primary");
        await note(k, tag, "안내7-아주크게-맞춤안내");
        await k.close();
        // 처음 화면은 새로 연다
        const k2 = await browser.newPage();
        await k2.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: true });
        await k2.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
        await k2.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
        await k2.waitForSelector(".register-qr svg");
        await note(k2, tag, "안내1-처음");
        await k2.close();
      }
      // 등록 키오스크
      {
        const [name, ...rest] = await login("t1-care");
        const k = await browser.newPage();
        await k.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: true });
        await k.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
        await k.goto(`${BASE}/kiosk/register?idle=1800`, { waitUntil: "load", timeout: 300_000 });
        await k.waitForSelector(".kiosk-start");
        await note(k, tag, "등록1-처음");
        await tap(k, ".kiosk-start .btn-primary");
        await tapText(k, '[role="checkbox"]', "큰 글씨");
        await note(k, tag, "등록2-안내방식-큰글씨");
        await tap(k, ".flow-cta .btn-primary");
        await note(k, tag, "등록3-동의");
        await tap(k, ".flow-cta .btn-primary");
        await note(k, tag, "등록4-이동");
        for (let i = 0; i < 3; i++) await tap(k, ".flow-cta .btn-primary");
        await k.waitForSelector("#reg-flight");
        await note(k, tag, "등록5-항공편");
        await tap(k, ".city-open");
        await k.waitForSelector(".city");
        await note(k, tag, "등록6-도시");
        await tapText(k, ".city", "오사카");
        await k.waitForSelector(".pick-row .pick");
        await tapText(k, ".pick", "전체");
        await note(k, tag, "등록7-시간대와항공사");
        await k.evaluate(() => ([...document.querySelectorAll(".pick-row")][1].querySelector(".pick") as HTMLElement).click());
        await sleep(400);
        await tap(k, ".flight-opt");
        await tap(k, ".flow-cta .btn-primary");
        await note(k, tag, "등록8-확인");
        await tap(k, ".flow-cta .btn-primary");
        await k.waitForSelector(".pass-qr-code svg", { timeout: 60_000 });
        await note(k, tag, "등록9-마침");
        await k.close();
      }
    }
  } catch (e) {
    console.error(String(e).slice(0, 400));
  } finally {
    await browser.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
})();
