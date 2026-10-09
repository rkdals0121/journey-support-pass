/**
 * 제안서 부록에 넣을 화면 세 장을 찍는다. 이 컴퓨터의 개발 서버(http://localhost:3000)에서 찍는다.
 * 개발 서버는 배포본과 같은 코드를 띄운 것이다. 배포 주소의 키오스크는 설치 코드를 넣어야 열려서 여기서 찍는다.
 *
 *   npx tsx scripts/appendix-shots.ts "저장할 폴더"
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

const BASE = "http://localhost:3000";
const OUT = path.resolve(process.argv[2] ?? ".e2e-shots");
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) =>
  fs.existsSync(p),
);
const WAIT = 300_000;

function devSecret(): string {
  const file = path.join(process.cwd(), ".env.local");
  const line = fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/).find((l) => l.startsWith("CRON_SECRET=")) : undefined;
  return line?.slice("CRON_SECRET=".length).replace(/^"(.*)"$/, "$1") || "dev-only-secret-change-me";
}

async function clickText(page: Page, selector: string, s: string) {
  await page.waitForFunction(
    (sel, t) =>
      [...document.querySelectorAll(sel)].some((e) => (e as HTMLElement).innerText?.includes(t) && Object.keys(e).some((k) => k.startsWith("__reactProps"))),
    { timeout: WAIT },
    selector,
    s,
  );
  await page.evaluate(
    (sel, t) => {
      const found = [...document.querySelectorAll(sel)]
        .filter((e) => (e as HTMLElement).innerText?.includes(t))
        .sort((a, b) => (a as HTMLElement).innerText.length - (b as HTMLElement).innerText.length)[0] as HTMLElement;
      found.click();
    },
    selector,
    s,
  );
}
const waitText = (page: Page, s: string) => page.waitForFunction((t) => (document.body?.innerText ?? "").includes(t), { timeout: WAIT }, s);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 제안서의 예시 장면(127번 탑승구)에 쓸 모의 항공편을 지금 시각 기준으로 넣는다.
  await fetch(`${BASE}/api/admin/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${devSecret()}` },
    body: JSON.stringify({ mockFlights: true }),
  });
  const found = await (await fetch(`${BASE}/api/flights/search?q=MK127`)).json();
  const flight = found.flights[0];
  const reg = await (
    await fetch(`${BASE}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flightDate: flight.flightDate,
        flightNo: "MK127",
        choices: ["gd_large", "mov_wheelchair_own", "fac_restroom", "stf_self"],
        lang: "ko",
        consent: true,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        editCount: 0,
      }),
    })
  ).json();
  const kioskCode = readSeedZones().find((z) => z.isKiosk)!.code;
  const login = await fetch(`${BASE}/api/kiosk/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: kioskCode, placeId: "cc-train" }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 900_000,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "jsp-appendix-")),
    args: ["--lang=ko-KR"],
  });

  // 1) 휴대전화: 등록 첫 질문에서 큰 글씨를 고른 모습
  const phone = await browser.newPage();
  phone.on("console", (m) => {
    if (m.type() === "error") console.log("휴대전화 화면 오류:", m.text().slice(0, 300));
  });
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.goto(`${BASE}/register`, { waitUntil: "load", timeout: WAIT });
  await clickText(phone, '[role="checkbox"]', "큰 글씨로 보여주세요");
  await phone.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).fontSize) === 20, { timeout: WAIT });
  await phone.evaluate(() => window.scrollTo(0, 0));
  await phone.screenshot({ path: path.join(OUT, "부록1-등록-큰글씨-바로적용.png") as `${string}.png` });

  // 2) 휴대전화: 등록 직후의 패스
  await phone.goto(`${BASE}/p/${reg.token}?new=1`, { waitUntil: "load", timeout: WAIT });
  await waitText(phone, "내 패스");
  await phone.waitForFunction(() => !!document.querySelector(".pass-qr-code svg") && !!document.querySelector(".flow-bar .bar-btn"), { timeout: WAIT });
  await phone.screenshot({ path: path.join(OUT, "부록2-내패스-QR과번호.png") as `${string}.png` });
  await phone.close();

  // 3) 안내 키오스크: 127번 탑승구 가는 길
  const kiosk = await browser.newPage();
  await kiosk.setViewport({ width: 1280, height: 1150, deviceScaleFactor: 1.5 });
  kiosk.on("console", (m) => {
    if (m.type() === "error") console.log("키오스크 화면 오류:", m.text().slice(0, 300));
  });
  const [name, ...rest] = cookie.split("=");
  await kiosk.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
  await kiosk.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: WAIT });
  await clickText(kiosk, "button", "패스 번호 누르기");
  await waitText(kiosk, "패스 번호 여섯 자리를 눌러 주세요");
  await kiosk.evaluate((no: string) => {
    const keys = [...document.querySelectorAll(".pad-num .pad-key")] as HTMLElement[];
    for (const d of no) keys.find((k) => k.innerText.trim() === d)?.click();
  }, reg.passNo);
  await waitText(kiosk, "나에게 맞춘 안내");
  await kiosk.screenshot({ path: path.join(OUT, "부록3-안내키오스크-맞춤안내.png") as `${string}.png` });
  await clickText(kiosk, ".gate-go", "127번 탑승구 가는 길");
  await waitText(kiosk, "지금 계신 곳");
  await kiosk.evaluate(() => window.scrollTo(0, 0));
  await kiosk.screenshot({ path: path.join(OUT, "부록3-안내키오스크-탑승구가는길.png") as `${string}.png` });
  await browser.close();
  console.log(`저장: ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
