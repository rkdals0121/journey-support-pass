/**
 * 스티커가 실제로 어떻게 인쇄되는지 본다. 이 컴퓨터의 개발 서버에만 쓴다.
 * 안내데스크 화면에서 패스를 찾은 뒤, 브라우저의 인쇄 결과를 PDF 로 뽑아 .e2e-shots/스티커.pdf 와 .png 로 저장한다.
 * 진짜 스티커 프린터 대신, 인쇄될 쪽의 크기(50×30mm)와 내용(QR 과 번호뿐)을 확인하는 용도다.
 *
 *   npx tsx scripts/sticker-check.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

const BASE = "http://localhost:3000";
const OUT = path.resolve(".e2e-shots");
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) =>
  fs.existsSync(p),
);

(async () => {
  const deskCode = readSeedZones().find((z) => z.isDesk)!.code;
  const login = await fetch(`${BASE}/api/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: deskCode }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const found = await (await fetch(`${BASE}/api/flights/search?q=MK`)).json();
  const flight = found.flights[0];
  if (!flight) throw new Error("모의 운항이 없습니다. npm run seed -- --mock-flights 를 먼저 하세요.");
  const reg = await (
    await fetch(`${BASE}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightDate: flight.flightDate, flightNo: flight.flightNo, choices: ["gd_large"], lang: "ko", consent: true, startedAt: new Date().toISOString(), editCount: 0 }),
    })
  ).json();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "jsp-sticker-")) });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900 });
  const [name, ...rest] = cookie.split("=");
  await page.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
  await page.goto(`${BASE}/staff/desk`, { waitUntil: "load", timeout: 300_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector("#desk-pass-no");
    return el !== null && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  }, { timeout: 300_000 });
  await page.type("#desk-pass-no", reg.passNo);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".sticker-qr svg", { timeout: 300_000 });

  fs.mkdirSync(OUT, { recursive: true });
  const pdf = path.join(OUT, "스티커.pdf");
  // 인쇄 쪽 크기는 화면의 @page 규칙(50×30mm)을 따른다.
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  await page.emulateMediaType("print");
  const info = await page.evaluate(() => {
    const el = document.querySelector(".sticker") as HTMLElement;
    const r = el.getBoundingClientRect();
    const qr = (document.querySelector(".sticker-qr") as HTMLElement).getBoundingClientRect();
    const visible = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).visibility === "visible" && (e as HTMLElement).offsetParent !== null);
    return {
      sticker: [r.left, r.top, r.width, r.height].map(Math.round),
      qr: [qr.left, qr.top, qr.width, qr.height].map(Math.round),
      display: getComputedStyle(el).display,
      visibleCount: visible.length,
      text: el.innerText.trim(),
    };
  });
  await page.setViewport({ width: 189, height: 113, deviceScaleFactor: 6 });
  await page.screenshot({ path: path.join(OUT, "스티커.png") as `${string}.png` });
  await browser.close();

  // PDF 의 쪽 수와 크기를 본다. 1mm = 72/25.4pt.
  const raw = fs.readFileSync(pdf).toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
  const mm = box ? [(Number(box[3]) * 25.4) / 72, (Number(box[4]) * 25.4) / 72].map((n) => Math.round(n * 10) / 10) : null;
  console.log(JSON.stringify({ ...info, pdfPages: pages, pdfSizeMm: mm }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
