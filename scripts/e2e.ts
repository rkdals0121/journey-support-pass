/**
 * 화면을 실제 브라우저로 처음부터 끝까지 눌러 보는 점검. 이 컴퓨터의 개발 서버에만 쓴다.
 *
 * 준비 (순서대로):
 *   1) 개발 서버를 끄고  npm run seed          (처음 한 번. 구역과 접속 코드를 넣는다)
 *   2) 개발 서버를 켜고  npx tsx scripts/e2e.ts
 * 모의 운항은 점검이 시작할 때 지금 시각 기준으로 스스로 다시 넣는다. 여객도 점검이 스스로 등록한다.
 * 여러 번 돌리면 오늘 현황의 숫자가 쌓인다. 숫자까지 깨끗하게 보려면 1)에서 .data/pglite 를 지우고 시작한다.
 *
 * 화면 그림은 SHOTS_DIR(기본 .e2e-shots)에 번호 순으로 저장한다.
 * 카메라 QR 스캔은 패스 QR 그림을 가짜 카메라 영상으로 넣어 확인한다. 진짜 카메라와 조명은 사람이 따로 확인한다.
 * 설치된 Chrome 을 새 프로필로 띄우므로 평소 쓰는 브라우저에는 영향이 없다.
 */
import type { CallDto } from "../src/lib/api/staff";
import type { GuideDto } from "../src/lib/guide";
import type { Summary } from "../src/lib/metrics";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page, type Viewport } from "puppeteer-core";
import QRCode from "qrcode";
import { passUrl } from "../src/lib/pass-format";
import { readSeedZones } from "../src/lib/zones";
import type { HubRule } from "../src/lib/service-hubs";


// 점검용 브라우저가 쓰는 임시 폴더. 끝나면 지운다. 지우지 않으면 돌릴 때마다 수십 MB 씩 쌓인다.
const tempProfiles: string[] = [];
function tempProfile(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempProfiles.push(dir);
  return dir;
}
// 가짜 카메라에 넣은 그림 파일. 끝나면 함께 지운다.
const tempFiles: string[] = [];
process.on("exit", () => {
  for (const file of tempFiles) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // 브라우저가 아직 잡고 있으면 남겨 둔다.
    }
  }
  for (const dir of tempProfiles) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // 브라우저가 아직 잡고 있으면 남겨 둔다.
    }
  }
});

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const SHOTS = path.resolve(process.env.SHOTS_DIR ?? ".e2e-shots");
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(
    (p) => fs.existsSync(p),
  );
const WAIT = Number(process.env.E2E_WAIT_MS ?? 240_000);
const AXE = fs.readFileSync(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf-8");

const seed = readSeedZones();
const DESK_CODE = seed.find((z) => z.isDesk)!.code;
const COMMON_CODE = seed.find((z) => z.isCommon)!.code;
const KIOSK_CODE = seed.find((z) => z.isKiosk)!.code;

// 개발 서버의 운영자 통로를 여는 값. .env.local 에 있으면 그 값을, 없으면 개발용 기본값을 쓴다.
function devSecret(): string {
  if (process.env.E2E_CRON_SECRET) return process.env.E2E_CRON_SECRET;
  const file = path.join(process.cwd(), ".env.local");
  const line = fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/).find((l) => l.startsWith("CRON_SECRET=")) : undefined;
  return line?.slice("CRON_SECRET=".length).replace(/^"(.*)"$/, "$1") || "dev-only-secret-change-me";
}
const CRON_SECRET = devSecret();

const results: { section: string; name: string; ok: boolean; note?: string }[] = [];
let current = "";

function section(name: string) {
  current = name;
  console.log(`\n[${name}]`);
}
let shotNo = 0;

function check(name: string, ok: boolean, note?: string) {
  results.push({ section: current, name, ok, note });
  console.log(`${ok ? "  통과" : "  실패"}  ${name}${note ? `  (${note})` : ""}`);
}

async function shot(page: Page, name: string) {
  shotNo += 1;
  const file = path.join(SHOTS, `${String(shotNo).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file as `${string}.png` });
  await audit(page, name);
}

/**
 * 그림을 뜨는 화면마다 접근성 자동 점검(axe-core, WCAG 2.2 AA 까지)을 돌린다.
 * 자동 점검은 대비·이름표·역할 같은 것만 잡는다. 화면 읽기 프로그램으로 실제로 써 보는 것을 대신하지 않는다.
 */
async function audit(page: Page, name: string) {
  // Next streams the root metadata during navigation; audit the settled document.
  await page.waitForFunction(() => document.title.trim().length > 0, { timeout: WAIT });
  // 나타나는 움직임(흐리게 시작해 또렷해지는 것)이 끝난 뒤에 본다. 도중에 보면 글자 대비가 낮게 잡힌다.
  // 끝없이 도는 움직임(하늘이 걷기 등)은 끝나지 않으니 빼고, 그래도 2초가 넘으면 기다리지 않는다.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((r) => setTimeout(r, 2000)),
    ]),
  );
  // 화면 아래에 붙은 「다음」 줄 밑으로 지나가는 항목은 axe 가 겹친 단추로 센다. 끝까지 내려 모든 항목이 드러난 상태에서 본다.
  const scrolled = await page.evaluate(() => {
    const y = window.scrollY;
    window.scrollTo(0, document.documentElement.scrollHeight);
    return y;
  });
  await page.evaluate(AXE);
  const found = (await page.evaluate(
    "axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }).then(r => r.violations.map(v => v.id + ' ' + v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')))",
  )) as string[];
  check(`접근성 자동 점검: ${name}`, found.length === 0, found.join(" / ").slice(0, 300) || undefined);
  await page.evaluate((y) => window.scrollTo(0, y), scrolled);
}

/** 키오스크 처음 화면(하늘이). 대기 중이면 「도움받아 시작」으로 깨워 필요한 도움 확인을 연다. */
async function kioskServices(page: Page) {
  await page.waitForSelector(".haneuli-welcome", { timeout: WAIT });
  if (!(await page.$(".haneuli-welcome.is-awake"))) await clickText(page, ".haneuli-start", "도움받아 시작");
  await page.waitForSelector(".haneuli-welcome.is-awake", { timeout: WAIT });
}
const isKioskHome = async (page: Page) => !!(await page.$(".haneuli-welcome"));

/** 화면에 그려진 QR(svg)을 읽어 그 안의 글자를 돌려준다. 못 읽으면 빈 글자. */
async function readQr(page: Page, selector: string): Promise<string> {
  await page.waitForSelector(selector, { timeout: WAIT });
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "jsqr", "dist", "jsQR.js") });
  return page.evaluate(async (sel) => {
    const svg = document.querySelector(sel)!;
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 600, 600);
    ctx.drawImage(img, 0, 0, 600, 600);
    const data = ctx.getImageData(0, 0, 600, 600);
    const read = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
    return read(data.data, 600, 600)?.data ?? "";
  }, selector);
}

const text = (page: Page) => page.evaluate(() => (document.body?.innerText ?? ""));
const has = async (page: Page, s: string) => (await text(page)).includes(s);

async function waitText(page: Page, s: string) {
  await page.waitForFunction((t) => (document.body?.innerText ?? "").includes(t), { timeout: WAIT }, s);
}

async function waitGone(page: Page, s: string) {
  await page.waitForFunction((t) => !(document.body?.innerText ?? "").includes(t), { timeout: WAIT }, s);
}

/** 글자가 들어 있는 것을 누른다. 화면에 보이는 것 가운데 글자가 가장 짧은 것을 고른다. */
async function clickText(page: Page, selector: string, s: string) {
  if(selector===".staff-nav a") {
    const menu=await page.$(".workspace-mobile-menu");
    if(menu&&await menu.isVisible()) {
      if(!await menu.evaluate(el=>el.hasAttribute("open"))) await page.click(".workspace-mobile-menu > summary");
      selector=".workspace-mobile-menu nav a";
    } else selector=".workspace-side nav a";
  }

  // 글자가 보이는 것만으로는 모자란다. 화면이 살아난 뒤(React 가 그 버튼을 넘겨받은 뒤)에 눌러야 눌림이 사라지지 않는다.
  await page.waitForFunction(
    (sel, t) =>
      [...document.querySelectorAll(sel)].some(
        (e) => (e as HTMLElement).innerText?.includes(t) && Object.keys(e).some((k) => k.startsWith("__reactProps")),
      ),
    { timeout: WAIT },
    selector,
    s,
  );
  await page.evaluate(
    (sel, t) => {
      const found = [...document.querySelectorAll(sel)]
        .filter((e) => (e as HTMLElement).innerText?.includes(t))
        .sort((a, b) => (a as HTMLElement).innerText.length - (b as HTMLElement).innerText.length)[0] as HTMLElement;
      found.scrollIntoView({ block: "center" });
      found.click();
    },
    selector,
    s,
  );
}

/**
 * 안내 키오스크가 탑승권(또는 번호)을 읽으면 먼저 "미리 등록하신 내용이에요"를 보여 준다(피드백 3).
 * 그 화면이 나오면 「이대로 안내 받기」를 누르고 안내 첫 화면을 기다린다.
 */
async function openGuide(page: Page, keep = "이대로 안내 받기", hello = "나에게 맞춘 안내") {
  await page.waitForFunction((a, b) => document.body.innerText.includes(a) || document.body.innerText.includes(b), { timeout: WAIT }, keep, hello);
  if (await has(page, keep)) {
    await clickText(page, "button", keep);
    await page.waitForFunction((a, b) => !document.body.innerText.includes(a) && document.body.innerText.includes(b), { timeout: WAIT }, keep, hello);
  }
}

async function fill(page: Page, selector: string, value: string) {
  // 화면이 살아난 뒤(React 가 입력란을 넘겨받은 뒤)에 친다. 그 전에 친 글자는 사라질 수 있다.
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el !== null && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    { timeout: WAIT },
    selector,
  );
  // 화면 가운데로 옮긴 뒤 누른다. 아래에 고정된 직원 메뉴 뒤에 입력란이 걸쳐 있으면 메뉴가 대신 눌린다.
  await page.$eval(selector, (e) => e.scrollIntoView({ block: "center" }));
  await page.click(selector, { count: 3 });
  // 세 번 눌러 고르기가 먹지 않는 입력란도 있다(대문자로 바꿔 다시 그리는 칸). 전체 고르기로 확실히 비운다.
  await page.$eval(selector, (e) => (e as HTMLInputElement).select?.());
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value, { delay: 15 });
}

async function isDisabled(page: Page, s: string) {
  return page.evaluate(
    (t) => ([...document.querySelectorAll("button")].find((b) => b.innerText.includes(t)) as HTMLButtonElement)?.disabled,
    s,
  );
}

/** 가장 최근에 연 화면. 점검이 도중에 멈추면 그때의 화면을 그림과 글로 남긴다. */
let lastPage: Page | null = null;

async function open(browser: Browser, viewport: Viewport): Promise<Page> {
  const page = await browser.newPage();
  lastPage = page;
  await page.setViewport(viewport);
  page.setDefaultTimeout(WAIT);
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => check("화면 오류 없음", false, String(e).slice(0, 120)));
  return page;
}

async function launch(extra: string[] = []) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    // 느린 컴퓨터에서 개발 서버와 함께 돌면 화면 하나를 묻는 데도 오래 걸린다.
    protocolTimeout: 900_000,
    userDataDir: tempProfile("jsp-e2e-"),
    args: ["--no-first-run", "--no-default-browser-check", "--lang=ko-KR", ...extra],
  });
}

/** 점검 결과를 docs/scenario-checklist.md 에 적는다. 무엇을 확인했는지 사람이 읽을 수 있게 남긴다. */
function writeReport() {
  const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" });
  const failed = results.filter((r) => !r.ok).length;
  const lines = [
    "# 화면 점검표",
    "",
    "`scripts/e2e.ts` 가 실제 브라우저로 화면을 처음부터 끝까지 눌러 보고 적은 결과다. 손으로 고치지 않는다.",
    "",
    `- 마지막 실행: ${when}`,
    `- 결과: ${results.length}개 가운데 통과 ${results.length - failed}개, 실패 ${failed}개`,
    "- 대상: 개발 컴퓨터의 서버와 모의 운항. 배포 주소에서 코드를 넣은 뒤의 화면(키오스크, 직원)은 사람이 따로 확인한다.",
    "- 카메라 QR 스캔은 패스 QR 그림을 가짜 카메라 영상으로 넣어 확인한다. 실물 스티커와 실제 조명, 스티커 프린터 출력은 다루지 않는다.",
    "- 길과 시설 위치는 시연용 모의 자료다 (src/lib/airport.ts).",
    "- \"접근성 자동 점검\"은 axe-core 로 WCAG 2.2 AA 까지의 규칙을 화면마다 돌린 것이다. 대비·이름표·역할 같은 것만 잡으며, 화면 읽기 프로그램으로 실제로 써 보는 것을 대신하지 않는다.",
    "",
    "다시 돌리는 방법은 `scripts/e2e.ts` 맨 위에 적혀 있다.",
  ];
  for (const name of [...new Set(results.map((r) => r.section))]) {
    lines.push("", `## ${name}`, "");
    for (const r of results.filter((x) => x.section === name)) {
      lines.push(`- [${r.ok ? "x" : " "}] ${r.name}${r.ok ? "" : " — **실패**"}${!r.ok && r.note ? ` (${r.note})` : ""}`);
    }
  }
  fs.writeFileSync(path.join(process.cwd(), "docs", "scenario-checklist.md"), `${lines.join("\n")}\n`, "utf-8");
}

// ── 서버에 직접 묻는 도우미 (화면을 거치지 않고 준비물을 만들 때) ──

interface TestApiBody {
 [key:string]:unknown;
 token:string;passNo:string;id:string;state:string;
 guide:GuideDto;result:{eligible:boolean};summary:Summary;calls:CallDto[];
}
async function post(pathname: string, body: unknown, cookie = ""): Promise<{ status: number; body: TestApiBody; cookie: string }> {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as TestApiBody,
    cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}

async function get(pathname: string, cookie = ""): Promise<{ status: number; body: TestApiBody }> {
  const res = await fetch(`${BASE}${pathname}`, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as TestApiBody };
}

interface Made {
  token: string;
  passNo: string;
}

/** 여객 한 명을 등록한다. cookie 가 키오스크의 것이면 키오스크 등록이 된다. */
async function register(flightNo: string, choices: string[], lang: "ko" | "en" = "ko", cookie = "", extra: Record<string, unknown> = {}): Promise<Made> {
  const found = await get(`/api/flights/search?q=${flightNo}`);
  const flight = (found.body.flights as { flightDate: string; flightNo: string }[]).find((f) => f.flightNo === flightNo);
  if (!flight) throw new Error(`${flightNo} 편이 없습니다. 모의 운항을 먼저 넣으세요.`);
  const res = await post(
    "/api/registrations",
    { flightDate: flight.flightDate, flightNo, choices, lang, consent: true, startedAt: new Date(Date.now() - 60_000).toISOString(), editCount: 0, ...extra },
    cookie,
  );
  if (res.status !== 200) throw new Error(`등록 실패 ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, passNo: res.body.passNo };
}

async function kioskCookie(placeId: string): Promise<string> {
  const res = await post("/api/kiosk/login", { code: KIOSK_CODE, placeId });
  if (res.status !== 200) throw new Error(`키오스크 설치 실패 ${res.status}`);
  return res.cookie;
}

async function staffCookie(code: string, zoneId?: string): Promise<string> {
  const res = await post("/api/staff/login", { code });
  if (res.status !== 200) throw new Error(`직원 로그인 실패 ${res.status}`);
  if (!zoneId) return res.cookie;
  const zone = await post("/api/staff/zone", { zoneId }, res.cookie);
  return zone.cookie;
}

async function useCookie(page: Page, cookie: string) {
  const [name, ...rest] = cookie.split("=");
  await page.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
}

/** 가짜 카메라에 넣을 장면. 패스 QR 을 가까이 댄 것(near)과 20~30cm 떨어져 작게 보이는 것(far). */
async function cameraFile(browser: Browser, token: string, far: boolean, raw = false): Promise<string> {
  const svg = await QRCode.toString(raw ? token : passUrl(BASE, token), { type: "svg", errorCorrectionLevel: "M", margin: 4 });
  const side = far ? 170 : 620;
  const p = await browser.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.setContent(
    `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#8d9a93">
       <div style="padding:14px 14px 40px;border-radius:10px;background:#fff"><div style="width:${side}px;height:${side}px">${svg.replace("<svg", `<svg width="${side}" height="${side}"`)}</div></div>
     </body>`,
  );
  const file = path.join(os.tmpdir(), `jsp-cam-${far ? "far" : "near"}-${Date.now()}.mjpeg`);
  fs.writeFileSync(file, await p.screenshot({ type: "jpeg", quality: far ? 86 : 92 }));
  tempFiles.push(file);
  await p.close();
  return file;
}

/** 증빙 서류 견본 사진(가상의 글자). 글자 인식 점검에 쓴다. */
async function docImage(browser: Browser, lines: string[]): Promise<string> {
  const p = await browser.newPage();
  await p.setViewport({ width: 1000, height: 420, deviceScaleFactor: 1 });
  await p.setContent(
    `<body style="margin:0;padding:40px;background:#fff;font:700 64px 'Malgun Gothic',sans-serif;color:#111">${lines.map((l) => `<div>${l}</div>`).join("")}</body>`,
  );
  const file = path.join(os.tmpdir(), `jsp-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`);
  fs.writeFileSync(file, await p.screenshot({ type: "png" }));
  tempFiles.push(file);
  await p.close();
  return file;
}

const CAMERA = (file: string) => ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`];

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const KIOSK_WIDE = { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: true };
const KIOSK_TALL = { width: 1080, height: 1920, deviceScaleFactor: 1, isMobile: false, hasTouch: true };

/** 문서의 기본 글자 크기(px). 큰 글씨를 고르면 이 값이 커지고, 화면의 모든 치수가 따라 커진다. */
const rootPx = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

/** 글자가 들어 있는 버튼의 화면 위 자리 (왼쪽, 위). 못 찾으면 null. */
async function spot(page: Page, selector: string, s: string): Promise<string | null> {
  return page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => (e as HTMLElement).innerText?.includes(t)) as HTMLElement | undefined;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${Math.round(r.left)},${Math.round(r.top)}`;
    },
    selector,
    s,
  );
}

/** 「도움 요청하기」 버튼의 왼쪽 끝과 세로 가운데. 글자가 바뀌어 너비가 달라져도 이 자리는 같아야 한다. */
async function callSpot(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector(".call-btn");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return `${Math.round(r.left)},${Math.round(r.top + r.height / 2)}`;
  });
}

/**
 * 「도움 요청하기」가 위쪽 줄의 버튼(이전, 처음으로, 설정)을 가리지 않는가.
 * 키오스크에서는 위쪽 줄의 오른쪽 끝에, 휴대전화에서는 위쪽 줄 바로 아래에 있다. 어느 쪽이든 겹치지만 않으면 된다.
 */
async function callClearOfBar(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const call = document.querySelector(".call-btn")?.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".flow-bar .bar-btn")].map((b) => b.getBoundingClientRect());
    return !!call && buttons.length >= 3 && buttons.every((b) => b.right <= call.left + 1 || b.left >= call.right - 1 || b.bottom <= call.top + 1 || b.top >= call.bottom - 1);
  });
}

/** 두 자리가 같은가. 큰 글씨를 켜면 위쪽 줄과 여백이 함께 커지므로 40화소까지는 같은 자리로 본다. */
function sameSpot(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const [ax, ay] = a.split(",").map(Number);
  const [bx, by] = b.split(",").map(Number);
  return Math.abs(ax - bx) <= 40 && Math.abs(ay - by) <= 40;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const count = (page: Page, selector: string) => page.evaluate((sel) => document.querySelectorAll(sel).length, selector);

const closeInView = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector(".settings .sheet-actions .btn-primary")?.getBoundingClientRect();
    return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
  });

/**
 * 모의 운항을 지금 시각 기준으로 다시 맞춘다. 탑승 마감 임박·지연·결항 같은 장면이 늘 같은 자리에 온다.
 * 점검이 오래 걸리면 금방 떠나는 편이 도중에 떠나 버리므로, 시각에 민감한 장면 앞에서 한 번 더 부른다.
 * 이미 등록한 여객은 편명으로 이어져 있어 그대로 남는다.
 */
async function resetFlights(clearLocks = false) {
  const res = await fetch(`${BASE}/api/admin/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` },
    // 이 점검은 일부러 틀린 번호를 여러 번 넣는다. 연달아 돌려도 "번호 잠금"에 걸리지 않게 앞선 실행의 틀린 기록을 지운다.
    body: JSON.stringify({ mockFlights: true, clearLocks }),
  });
  if (!res.ok) throw new Error(`모의 운항을 넣지 못했습니다 (${res.status}). .env.local 의 CRON_SECRET 을 확인하세요.`);
}

(async () => {
  if (!CHROME) throw new Error("Chrome 이나 Edge 를 찾지 못했습니다. CHROME_PATH 로 알려 주세요.");
  // 개발 서버는 처음 부르는 주소를 그 자리에서 만든다(10초 넘게 걸리기도 한다). 화면이 10초 안에 답을 기다리는 곳은 미리 한 번 불러 둔다.
  for (const warm of ["/api/staff/logout"]) await fetch(`${BASE}${warm}`).catch(() => undefined);
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("이 점검은 이 컴퓨터의 개발 서버에만 씁니다.");
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.endsWith(".png")) fs.unlinkSync(path.join(SHOTS, f));

  await resetFlights(true);
  // 앞선 점검이 도중에 멈췄으면 끝나지 않은 호출이 남아 있을 수 있다. 직원 화면의 점검이 그 호출에 걸리지 않게 모두 마친다.
  {
    const cleaner = await staffCookie(DESK_CODE);
    const left = await get("/api/staff/calls", cleaner);
    for (const c of (left.body.calls as { id: string; state: string }[]) ?? []) {
      if (c.state === "waiting" || c.state === "accepted") await post(`/api/staff/calls/${c.id}`, { action: "done" }, cleaner);
    }
  }

  // 개발 서버는 화면을 처음 열 때 그 화면을 만든다(느린 컴퓨터에서는 몇 분). 점검이 그 시간에 걸리지 않게 미리 한 번씩 열어 둔다.
  for (const p of ["/", "/register", "/p/0000000000000000", "/kiosk", "/kiosk/guide", "/kiosk/register", "/staff/login", "/staff/zone", "/staff", "/staff/desk", "/staff/desk/register", "/staff/desk/stats"]) {
    await fetch(`${BASE}${p}`, { redirect: "manual" }).catch(() => {});
  }
  for (const p of ["/api/guide", "/api/kiosk/resolve", "/api/kiosk/call", "/api/events", "/api/pass/erase", "/api/desk/register", "/api/desk/erase", "/api/staff/calls/x", "/api/staff/zone"]) {
    await fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }
  await fetch(`${BASE}/api/kiosk/call/x`).catch(() => {});
  await fetch(`${BASE}/api/staff/calls`).catch(() => {});
  await fetch(`${BASE}/api/desk/summary`).catch(() => {});

  let browser = await launch();
  let page = await open(browser, PHONE);

  // ───────── 1. 여객 휴대전화: 첫 화면과 등록 ─────────
  section("여객 휴대전화: 등록");
  await page.goto(BASE, { waitUntil: "load", timeout: 300_000 });
  check("첫 화면에서 사전등록·현장 요청·내 요청으로 연결된다", !!(await page.$('a[href="/prepare"]')) && !!(await page.$('a[href="/help"]')) && !!(await page.$('a[href="/requests"]')));
  check("첫 화면은 이름·연락처를 입력받지 않는다", !(await page.$('input[type="tel"],input[type="email"],input[autocomplete="name"]')));
  check("첫 화면은 직원이 먼저 돕겠다는 약속을 하지 않는다", !(await has(page, "다시 묻지 않습니다")) && !(await has(page, "먼저 다가")));
  check("직접 안내받을 수 있는 안내데스크 위치가 연결된다", !!(await page.$('a[href="/services/desks"]')));
  check("첫 화면은 서비스 묶음 제목·전체 서비스 링크·탑승구 바로 검색 없이 서비스 카드를 보여 준다", await page.evaluate(() => {
    const services = document.querySelector(".ph-services");
    return !!services && !services.querySelector(".ph-section-head, .ph-gate, #home-gate")
      && services.querySelectorAll(".task-action").length === 6;
  }));
  await shot(page, "휴대전화-첫화면");
  // 제안서 1단계: 항공권 예매 완료 화면의 링크로 들어온다(시연용 모의 화면).
  await page.click('a[href="/demo/booking"]');
  await waitText(page, "공항에서 필요한 도움이 있으신가요?");
  check("예매 완료 모의 화면은 시연용이라고 밝히고, 실제 항공사 이름을 쓰지 않는다", (await has(page, "시연용 모의 화면")) && !(await has(page, "대한항공")) && !(await has(page, "아시아나")));
  check("링크를 둘 수 없을 때의 대체 접점(예약 확인 문자)도 보여 준다", await has(page, "예약 확인 문자"));
  await shot(page, "예매완료-링크");
  await clickText(page, "a", "필요한 도움 미리 알려 두기");
  await waitText(page, "예약정보 불러오기");
  await clickText(page, "button", "시연값 넣기");
  await clickText(page, "button", "예약 조회");
  await waitText(page, "시연 항공편을 찾았어요");
  check("예매 연결에서 시연 예약 조회를 이용할 수 있다", await has(page, "DX9001"));
  await clickText(page, "a", "항공편 직접 선택해서 등록");
  await page.waitForFunction(() => location.pathname === "/register" && location.search.includes("via=booking"), { timeout: WAIT });
  check("링크에는 접점 표시(via=booking)만 있고 예약 정보는 싣지 않는다", !page.url().includes("DEMO01") && !page.url().includes("NRT"));

  // 체크리스트 1쪽: 어떤 점이 불편하세요?
  await waitText(page, "어떤 점이 불편하세요?");
  check("첫 질문은 어떤 점이 불편한지다. '잘 모르겠어요'와 '지금은 없어요'까지 여덟 가지", (await count(page, '[role="checkbox"]')) >= 8 && (await has(page, "지금은 없어요")) && (await has(page, "잘 모르겠어요")));
  check("함께 오신 분이 대신 표시해도 된다고 알린다", await has(page, "대신 표시해도"));
  check("진행 표시가 1단계다", await page.evaluate(() => /(^|\D)1\/\d+/.test((document.querySelector(".flow-progress") as HTMLElement)?.innerText ?? "")));
  check("「이전」과 「처음으로」가 화면 왼쪽 위에 있다", (await spot(page, ".bar-btn", "이전")) !== null && (await spot(page, ".bar-btn", "처음으로")) !== null);
  check("휴대전화 화면에는 「도움 요청하기」가 없다 (공항 키오스크에만 있다)", (await count(page, ".call-btn")) === 0);
  const basePx = await rootPx(page);
  await shot(page, "휴대전화-불편한점");

  // 설정: 글자와 그림의 크기를 그 자리에서 바꾼다.
  check("위쪽 줄에 「이전」「처음으로」「설정」이 나란히 있다", (await spot(page, ".bar-btn", "설정")) !== null);
  await clickText(page, ".bar-btn", "설정");
  await waitText(page, "화면 설정");
  check("설정에 글자와 그림 크기 네 단계가 있다", (await count(page, ".size-pick button")) === 4);
  await shot(page, "휴대전화-설정");
  await clickText(page, ".size-pick button", "아주 크게");
  await page.waitForFunction((b) => parseFloat(getComputedStyle(document.documentElement).fontSize) >= b * 1.45, { timeout: WAIT }, basePx);
  const iconPx = await page.evaluate(() => document.querySelector(".choice-icon svg")!.getBoundingClientRect().width);
  check("'아주 크게'를 누르면 글자가 1.5배가 되고 그림도 함께 커진다", (await rootPx(page)) === basePx * 1.5 && iconPx >= 34, `글자 ${await rootPx(page)}px, 그림 ${Math.round(iconPx)}px`);
  check("글자를 아주 크게 해도 설정의 닫는 버튼이 화면 안에 보인다 (휴대전화)", await closeInView(page));
  await shot(page, "휴대전화-설정-아주크게");
  await clickText(page, ".size-pick button", "작게");
  await page.waitForFunction((b) => parseFloat(getComputedStyle(document.documentElement).fontSize) < b, { timeout: WAIT }, basePx);
  check("'작게'를 누르면 보통보다 작아진다", (await rootPx(page)) < basePx);
  await clickText(page, ".sheet-box button", "처음 고른 대로 되돌리기");
  await page.waitForFunction((b) => parseFloat(getComputedStyle(document.documentElement).fontSize) === b, { timeout: WAIT }, basePx);
  check("'처음 고른 대로 되돌리기'를 누르면 원래 크기로 돌아온다", true);
  await clickText(page, ".sheet-box button", "확인");
  await waitGone(page, "화면 설정");

  await page.select(".registration-language select", "en");
  await waitText(page, "What is difficult for you?");
  check("언어를 English 로 바꾸면 질문과 항목이 바로 영어로 바뀐다", await has(page, "Walking"));
  check("영어 화면의 문서 언어가 en 이다 (화면 읽기 프로그램이 영어로 읽는다)", (await page.evaluate(() => document.documentElement.lang)) === "en");
  await shot(page, "휴대전화-영어");
  await page.select(".registration-language select", "ko");
  await waitText(page, "어떤 점이 불편하세요?");

  // '지금은 없어요'는 다른 것과 함께 고를 수 없다.
  await clickText(page, '[role="checkbox"]', "걷기");
  await clickText(page, '[role="checkbox"]', "지금은 없어요");
  check("'지금은 없어요'를 고르면 다른 불편은 풀린다", (await count(page, '[role="checkbox"][aria-checked="true"]')) === 1);
  // 빠르게 연달아 눌러도 하나도 빠지지 않아야 한다.
  // (화면 안에서 도는 코드에는 이름 붙은 함수를 두지 않는다. tsx 가 붙이는 도우미가 화면에는 없다.)
  await page.evaluate(() => {
    for (const t of ["걷기", "보기"]) {
      ([...document.querySelectorAll('[role="checkbox"]')].find((b) => (b as HTMLElement).innerText.trim().startsWith(t)) as HTMLElement).click();
    }
  });
  check("빠르게 연달아 두 개를 눌러도 두 개가 모두 고른 상태다. '지금은 없어요'는 풀린다", (await count(page, '[role="checkbox"][aria-checked="true"]')) === 2);

  // 큰 글씨 없이 시작한 자리를 적어 둔다. 다음 화면들에서 같은 자리인지 견준다.
  // 이 화면은 길어서 고르는 동안 아래로 내려가 있다. 화면 맨 위로 올린 뒤 잰다(다음 화면은 맨 위에서 시작한다).
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  const backAt = await spot(page, ".bar-btn", "이전");
  const homeAt = await spot(page, ".bar-btn", "처음으로");
  // 손이 떨려 「다음」을 두 번 빠르게 누른 여객: 두 번째 누름이 다음 화면의 「동의하고 계속」에 들어가면 안 된다.
  await sleep(700);
  {
    const r = await page.$eval(".flow-cta .btn-primary", (e) => {
      const b = (e as HTMLElement).getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(r.x, r.y);
    await sleep(80);
    await page.mouse.click(r.x, r.y);
  }
  await waitText(page, "등록 전에 확인해 주세요");
  await sleep(900);
  check("「다음」을 두 번 빠르게 눌러도 한 화면만 넘어간다. 동의 화면을 읽지 않고 지나치지 않는다", await has(page, "등록 전에 확인해 주세요"));
  check("두 번째는 동의다. 무엇을 받는지, 어디에 쓰는지, 언제 지우는지, 무엇이 남는지 네 가지를 보여준다", (await count(page, ".info-row")) === 4);
  check("동의 글에 이름과 연락처를 받지 않고, 증빙서류는 공항이 아닌 별도 서버가 보관한다고 적혀 있다", (await has(page, "이름과 연락처는")) && (await has(page, "별도 서버")));
  check("「이전」과 「처음으로」가 앞 화면과 같은 자리에 있다", (await spot(page, ".bar-btn", "이전")) === backAt && (await spot(page, ".bar-btn", "처음으로")) === homeAt);
  await shot(page, "휴대전화-동의");
  await clickText(page, "button", "동의하지 않습니다");
  await waitText(page, "등록하지 않았습니다");
  check("동의하지 않으면 등록 없이 기존 지원을 안내한다", await has(page, "기존 안내와 지원은 그대로"));
  await shot(page, "휴대전화-동의안함");
  await clickText(page, "button", "다시 살펴보기");
  await clickText(page, "button", "동의하고 계속");

  // 고른 불편마다 그 가지만 묻는다(걷기, 보기). 고르지 않은 가지는 묻지 않는다.
  await waitText(page, "「걷기」를 고르셨다면");
  await page.evaluate(() => {
    for (const t of ["휠체어를 써요", "계단과 에스컬레이터는 어려워요", "중간에 쉬어야 해요"]) {
      ([...document.querySelectorAll("button")].find((b) => b.innerText.includes(t)) as HTMLElement).click();
    }
  });
  check("빠르게 연달아 세 개를 눌러도 세 개가 모두 선택된다", (await count(page, '[role="checkbox"][aria-checked="true"]')) === 3);
  await clickText(page, '[role="checkbox"]', "중간에 쉬어야 해요");
  check("다시 누르면 선택이 풀린다", (await count(page, '[role="checkbox"][aria-checked="true"]')) === 2);
  check("'휠체어를 빌릴래요'에 예약이 아니라고 적혀 있다", await has(page, "예약은 아닙니다"));
  check("걷기 화면에 전동차를 어떻게 할지 함께 묻는다", await has(page, "걷다가 힘들면 그때 부를래요"));
  await clickText(page, '[role="radio"]', "걷다가 힘들면 그때 부를래요");
  await shot(page, "휴대전화-가지-걷기");
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "「보기」를 고르셨다면");
  await clickText(page, '[role="checkbox"]', "큰 글씨로 보여주세요");
  await page.waitForFunction((b) => parseFloat(getComputedStyle(document.documentElement).fontSize) > b, { timeout: WAIT }, basePx);
  const largePx = await rootPx(page);
  check("큰 글씨를 고르면 그 화면에서 바로 글자가 커진다", largePx >= basePx * 1.2, `${basePx}px → ${largePx}px`);
  // 큰 글씨가 켜진 뒤의 자리를 다시 적는다. 마지막 질문까지 이 자리에 있어야 한다.
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  const backAtLarge = await spot(page, ".bar-btn", "이전");
  const homeAtLarge = await spot(page, ".bar-btn", "처음으로");
  await clickText(page, '[role="checkbox"]', "로봇을 잡고 따라갈래요");
  await clickText(page, '[role="checkbox"]', "소리만 따라갈래요");
  check("'로봇을 잡고 따라갈래요'와 '소리만 따라갈래요'는 둘 중 하나만 고른다", !(await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"][aria-checked="true"]')].some((b) => (b as HTMLElement).innerText.includes("로봇을 잡고")))));
  await clickText(page, '[role="checkbox"]', "소리만 따라갈래요");
  await shot(page, "휴대전화-가지-보기-큰글씨");
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "함께 가시는 분이 있나요?");
  check("고르지 않은 가지(듣기·말하기, 아이와 함께 가기 등)는 묻지 않고 함께 가는 분으로 넘어간다", true);
  await clickText(page, '[role="radio"]', "혼자 가요");
  await shot(page, "휴대전화-함께가는분");
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "도움은 어떻게 받으시겠어요?");
  await clickText(page, '[role="checkbox"]', "제가 필요할 때 부를게요");
  check("직원 선방문 항목은 없고 필요할 때 호출하는 방식을 선택할 수 있다", await page.evaluate(() => {
    const options = [...document.querySelectorAll('[role="checkbox"]')];
    return !options.some((b) => (b as HTMLElement).innerText.includes("먼저 찾아와"))
      && options.some((b) => b.getAttribute("aria-checked") === "true" && (b as HTMLElement).innerText.includes("필요할 때"));
  }));
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "가시는 길에 들르실 곳이 있나요?");
  await clickText(page, '[role="checkbox"]', "화장실");
  await shot(page, "휴대전화-들를곳");
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "타실 항공편을 알려 주세요");
  // 사전등록은 예약번호로 찾는 칸이 먼저 열린다. 지금은 항공사와 연결되어 있지 않아 시연 예약(DEMO01 / KIM)만 찾는다.
  check("사전등록의 항공편은 예약번호로 찾기가 먼저 열린다", (await count(page, "#reg-booking-ref")) === 1 && (await count(page, "#reg-flight")) === 0);
  await fill(page, "#reg-booking-ref", "nope99");
  await fill(page, "#reg-booking-surname", "kim");
  await clickText(page, ".booking-find button", "예약 조회");
  await waitText(page, "찾지 못했습니다");
  check("없는 예약번호는 찾지 못했다고 알려 준다", (await isDisabled(page, "다음")) === true);
  await clickText(page, ".booking-find button", "시연값 넣기");
  await clickText(page, ".booking-find button", "예약 조회");
  await waitText(page, "DX9001");
  check("예약번호로 조회하면 그 예약의 항공편이 골라진다", (await has(page, "시연 예약에서 불러온")) && (await isDisabled(page, "다음")) === false);
  await shot(page, "휴대전화-예약번호로-찾기");
  await clickText(page, ".flight-methods .pick", "편명·도시로 찾기");
  await page.waitForSelector("#reg-flight", { timeout: WAIT });
  check("편명으로 찾기로 바꾸면 예약에서 고른 편은 비운다", (await isDisabled(page, "다음")) === true);
  check("이름을 묻는 칸이 없다", (await count(page, "input")) === 1 && !(await has(page, "이름")));
  check("항공편을 고르기 전에는 다음으로 갈 수 없다", (await isDisabled(page, "다음")) === true);
  // 항공권은 몇 달 전에 예매한다. 오늘·내일 편이 아니면 날짜와 편명으로 미리 등록한다.
  await clickText(page, "button", "출발 날짜를 골라 미리 등록하기");
  await waitText(page, "미리 등록하기");
  const farDate = new Date(Date.now() + 9 * 3600_000 + 60 * 86_400_000).toISOString().slice(0, 10);
  await page.evaluate((d) => {
    const el = document.querySelector("#later-date") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, d);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, farDate);
  await fill(page, "#later-no", "kor");
  await clickText(page, "button", "이 편으로 하기");
  await waitText(page, "편명은 항공사 두 글자와 숫자입니다");
  check("미리 등록: 편명 모양이 틀리면 알려 준다", true);
  await fill(page, "#later-no", "oz106");
  await clickText(page, "button", "이 편으로 하기");
  await waitText(page, "운항 정보는 출발 이틀 전쯤부터");
  check("미리 등록: 두 달 뒤 날짜와 편명을 넣으면 그 편으로 고르고, 운항 정보는 출발 이틀 전쯤 들어온다고 알린다", (await has(page, "OZ106")) && (await isDisabled(page, "다음")) === false);
  await shot(page, "휴대전화-미리등록");
  await clickText(page, ".link-btn", "오늘·내일 편에서 찾기");
  await page.waitForSelector("#reg-flight", { timeout: WAIT });
  check("미리 등록을 닫으면 오늘·내일 편 찾기로 돌아오고 고른 편은 비운다", (await isDisabled(page, "다음")) === true);
  await fill(page, "#reg-flight", "zz99");
  await waitText(page, "찾지 못했습니다");
  check("없는 편명은 찾지 못했다고 알려 준다", true);
  // 편명을 모르는 여객은 도착 도시를 눌러 고른다.
  await fill(page, "#reg-flight", "");
  await clickText(page, ".city-open", "도착 도시에서 고르기");
  await waitText(page, "어디로 가시나요?");
  await page.waitForFunction(() => document.querySelectorAll(".city").length >= 3, { timeout: WAIT });
  check("편명을 모르면 도착 도시를 눌러 고를 수 있다. 글자를 치는 칸은 치워진다", (await count(page, ".city")) >= 3 && (await count(page, "#reg-flight")) === 0);
  await shot(page, "휴대전화-도착도시-고르기");
  await clickText(page, ".pick", "ㅇ");
  await clickText(page, ".city", "오사카");
  await waitText(page, "언제 출발하나요?");
  check(
    "같은 곳으로 가는 편이 많으면 출발 시간대를 먼저 묻는다. 누르기 전에는 목록을 펼치지 않는다",
    (await count(page, ".flight-opt")) === 0 && (await count(page, ".pick-row .pick")) >= 3,
    `시간대 단추 ${await count(page, ".pick-row .pick")}개`,
  );
  await shot(page, "휴대전화-도착도시-시간대");
  await page.evaluate(() => (document.querySelector(".pick-row .pick") as HTMLElement).click());
  await page.waitForFunction(() => document.querySelectorAll(".flight-opt").length >= 1, { timeout: WAIT });
  const inBucket = await count(page, ".flight-opt");
  check("시간대를 누르면 그 시간대에 떠나는 편만 나온다", inBucket >= 1 && inBucket < 12, `${inBucket}편`);
  await page.evaluate(() => (document.querySelector(".flight-opt") as HTMLElement).click());
  await waitText(page, "다른 편 고르기");
  check("도시에서 편을 고르면 「다음」으로 갈 수 있다", (await isDisabled(page, "다음")) === false);
  await clickText(page, ".link-btn", "다른 편 고르기");
  check("「다른 편 고르기」를 누르면 고르던 목록으로 돌아간다", (await count(page, ".flight-opt")) === inBucket);
  await clickText(page, ".pick-row .pick", "전체");
  await waitText(page, "어느 항공사인가요?");
  check("시간대를 골라도 편이 많으면 항공사를 한 번 더 묻는다. 누르기 전에는 목록을 펼치지 않는다", (await count(page, ".flight-opt")) === 0);
  await page.evaluate(() => ([...document.querySelectorAll(".pick-row")][1].querySelector(".pick") as HTMLElement).click());
  await page.waitForFunction(() => document.querySelectorAll(".flight-opt").length >= 1, { timeout: WAIT });
  const byAirline = await page.$$eval(".flight-opt", (els) => els.map((e) => (e.querySelector(".flight-opt-main span:last-child") as HTMLElement).innerText.trim()));
  check("항공사를 누르면 그 항공사의 편만 나온다", byAirline.length >= 1 && new Set(byAirline).size === 1, byAirline.join(", "));
  await shot(page, "휴대전화-도착도시-항공사");
  await clickText(page, ".link-btn", "도시 다시 고르기");
  await waitText(page, "어디로 가시나요?");
  await clickText(page, ".pick", "ㄱ");
  await clickText(page, ".city", "괌");
  await page.waitForFunction(() => document.querySelectorAll(".flight-opt").length === 1, { timeout: WAIT });
  check("이름이 한 글자인 도시(괌)도 고르면 편이 나온다. 편이 적으면 시간대를 묻지 않고 바로 보여 준다", (await count(page, ".pick-row")) === 0 && (await has(page, "MK601")));
  await clickText(page, ".link-btn", "도시 다시 고르기");
  await waitText(page, "어디로 가시나요?");
  // 화면 아래에 붙은 「다음」 줄 밑에 단추가 깔려 있으면 그 줄이 대신 눌린다. 가운데로 올린 뒤 누른다.
  await page.$eval(".city-head .icon-btn", (e) => e.scrollIntoView({ block: "center" }));
  await page.click(".city-head .icon-btn");
  await page.waitForSelector("#reg-flight", { timeout: WAIT });
  check("도시 고르기를 닫으면 편명 넣는 칸으로 돌아온다", (await count(page, ".city")) === 0);

  await fill(page, "#reg-flight", "mk1");
  await page.waitForFunction(() => document.querySelectorAll(".flight-opt").length >= 2, { timeout: WAIT });
  check("편명을 넣는 동안 후보가 자동으로 뜬다 (찾기 버튼 없음)", (await count(page, ".flight-opt")) >= 2);
  check("후보에는 탑승구가 보이지 않는다", !(await has(page, "탑승구")));
  await shot(page, "휴대전화-편명찾기");
  await clickText(page, ".flight-opt", "MK127");
  await waitText(page, "항공편을 골랐습니다");
  await clickText(page, ".link-btn", "다른 편 고르기");
  await page.waitForFunction(() => document.querySelectorAll(".flight-opt").length >= 2, { timeout: WAIT });
  check("편명으로 고른 편도 「다른 편 고르기」로 다시 고를 수 있다 (키오스크는 편을 고르면 글자판이 사라진다)", (await isDisabled(page, "다음")) === true);
  await clickText(page, ".flight-opt", "MK127");
  await waitText(page, "항공편을 골랐습니다");
  await clickText(page, ".flow-cta button", "다음");

  // 보여주실 서류(휴대전화만): 고른 서류만 이 기기 안에서 글자를 읽어 확인한다. 서류와 종류는 서버에 보내지 않는다.
  await waitText(page, "보여주실 서류가 있나요?");
  await clickText(page, '[role="checkbox"]', "장애인복지카드");
  await waitText(page, "이 기기 밖으로 보내지 않아요");
  check("증빙을 내지 않고도 넘어갈 수 있다 (내지 않으면 체크인 카운터에서 확인)", await has(page, "지금 내지 않고 다음"));
  // 견본 복지카드 사진(가상의 글자)을 만들어 고른다. 이 기기 안에서 글자를 읽어 판정한다.
  const proofImage = await docImage(browser, ["장애인복지카드", "성명 홍길동(견본)", "발급 2020. 1. 2."]);
  const wrongImage = await docImage(browser, ["영수증", "합계 12,000원"]);
  const proofSent: string[] = [];
  page.on("request", (r) => {
    const body = r.postData() ?? "";
    if (r.method() === "POST" && (body.includes("PNG") || body.includes("복지카드") || body.length > 20_000)) proofSent.push(r.url());
  });
  await (await page.$(".proof-list input[type=file]"))!.uploadFile(wrongImage);
  await waitText(page, "서류를 알아보지 못했습니다");
  check("엉뚱한 사진(영수증)은 증빙으로 받지 않는다", await has(page, "지금 내지 않고 다음"));
  await (await page.$(".proof-list input[type=file]"))!.uploadFile(proofImage);
  await waitText(page, "복지카드로 확인되었습니다");
  check("복지카드 사진을 찍으면 이 기기 안에서 글자를 읽어 '복지카드로 확인'한다. 「다음」으로 바뀐다", !(await has(page, "지금 내지 않고 다음")));
  await shot(page, "휴대전화-증빙서류");
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "더 하고 싶은 말씀이 있나요?");
  await fill(page, "#reg-note", "엘리베이터를 꼭 타야 합니다");
  check("더 하고 싶은 말씀을 글로 남길 수 있다(글자 수 표시)", await has(page, "/ 200자"));
  await clickText(page, ".flow-cta button", "다음");

  await waitText(page, "이대로 등록할까요?");
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  check("마지막 질문까지 「이전」과 「처음으로」가 같은 자리에 있다", (await spot(page, ".bar-btn", "이전")) === backAtLarge && (await spot(page, ".bar-btn", "처음으로")) === homeAtLarge);
  const review = await text(page);
  check(
    "확인 화면에 항공편과 고른 것이 모두 나온다",
    ["MK127", "걷기", "휠체어를 써요", "계단과 에스컬레이터는 어려워요", "큰 글씨로 보여주세요", "혼자 가요", "제가 필요할 때 부를게요", "화장실", "장애인복지카드", "엘리베이터를 꼭 타야 합니다"].every((s) => review.includes(s)),
    ["MK127", "걷기", "휠체어를 써요", "계단과 에스컬레이터는 어려워요", "큰 글씨로 보여주세요", "혼자 가요", "제가 필요할 때 부를게요", "화장실", "장애인복지카드", "엘리베이터를 꼭 타야 합니다"].filter((s) => !review.includes(s)).join(", "),
  );
  await shot(page, "휴대전화-확인");
  await page.evaluate(() => (document.querySelector('.review-edit[aria-label^="들를 곳"]') as HTMLElement).click());
  await waitText(page, "가시는 길에 들르실 곳이 있나요?");
  check("확인 화면의 '고치기'는 그 질문으로 돌아간다. 골라 둔 것이 남아 있다", (await count(page, '[role="checkbox"][aria-checked="true"]')) === 1);
  for (const title of ["타실 항공편을 알려 주세요", "보여주실 서류가 있나요?", "더 하고 싶은 말씀이 있나요?", "이대로 등록할까요?"]) {
    await clickText(page, ".flow-cta button", "다음");
    await waitText(page, title);
  }
  await clickText(page, ".flow-cta button", "등록하기");

  // ───────── 2. 여객 휴대전화: 패스 ─────────
  section("여객 휴대전화: 패스");
  await page.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: WAIT });
  await waitText(page, "내 등록");
  const myToken = page.url().split("/p/")[1].split("?")[0];
  check("증빙서류 파일은 어디에도 보내지 않는다 (냈다는 사실만 보낸다)", proofSent.length === 0, proofSent.join(", "));
  check("등록을 마치면 준비 상황이 나온다: 등록됨, 증빙 확인됨, 아직 체크인 전", (await has(page, "필요한 도움을 등록했습니다")) && (await has(page, "증빙이 확인되었습니다")) && (await has(page, "탑승권 연결 전입니다")));
  check("체크인 전에는 탑승권 QR 이 없다 (체크인하면 전자토큰이 탑승권에 저장된다)", (await count(page, ".pass-qr-code")) === 0);
  await shot(page, "휴대전화-준비상황");
  // Existing boarding-pass linking replaced the former simulated issuance flow on main.
  const beforeLink = (await post("/api/guide", {token:myToken})).body.guide;
  const myNo = beforeLink.passNo;
  const boardingReference = Date.now().toString(16).slice(-10).toUpperCase();
  const qrText = `BP1:${beforeLink.flight.flightDate!.replaceAll("-", "")}:MK127:${boardingReference}`;
  const boardingFile = path.join(os.tmpdir(), `jsp-boarding-link-${Date.now()}.png`);
  tempFiles.push(boardingFile);
  await QRCode.toFile(boardingFile, qrText, {width:600,margin:4});
  await clickText(page, "button", "기존 탑승권 연결");
  await page.waitForSelector('.boarding-link-panel input[type="file"]', {timeout:WAIT});
  await Promise.all([
    page.waitForNavigation({waitUntil:"networkidle0",timeout:WAIT}),
    (await page.$('.boarding-link-panel input[type="file"]'))!.uploadFile(boardingFile),
  ]);
  await waitText(page, "기존 탑승권에 지원정보가 연결됐어요");
  check("기존 탑승권 이미지를 읽어 지원정보를 연결한다", (await post("/api/guide", {token:myToken})).body.guide.checkedIn);
  check("별도 지원 QR은 발급하지 않는다", (await count(page,".pass-qr-code"))===0);
  check("우대출구에서 기존 탑승권을 보여 주면 된다고 알린다", await has(page,"증빙서류는 꺼내지 않아도 됩니다"));
  check("번호 조회용 고유 일련 번호는 여섯 자리다", /^\d{6}$/.test(myNo),myNo.replace(/\d{3}$/, "***"));
  check("기존 탑승권 코드에는 서비스 토큰을 넣지 않는다", !qrText.includes(myToken));
  check("패스 화면에 내 항공편과 탑승구가 나온다", (await has(page, "MK127")) && (await page.$eval(".gate-sign b", (e) => (e as HTMLElement).innerText)) === "127");
  check("탑승 마감까지 남은 시간에 '추정'이 붙는다", await has(page, "(추정)"));
  check("패스 화면에 고른 도움과 말씀이 나온다", (await has(page, "휠체어를 써요")) && (await has(page, "엘리베이터를 꼭 타야 합니다")));
  // 글자 크기는 화면이 살아난 뒤(브라우저가 화면을 넘겨받은 뒤)에 적용된다. 그때까지 잠깐 기다린다.
  await page.waitForFunction((want) => parseFloat(getComputedStyle(document.documentElement).fontSize) === want, { timeout: WAIT }, largePx).catch(() => {});
  check("패스 화면도 큰 글씨로 열린다", (await rootPx(page)) === largePx);
  check("공항에서는 탑승권만 보여 주면 된다고 알린다", await has(page, "탑승권"));
  check("어디에도 이름이 없다", !(await has(page, "이름")));
  await page.waitForFunction(() => !location.search.includes("new"), { timeout: WAIT });
  check("주소의 ?new=1 은 바로 지워진다 (저장한 주소에 붙지 않는다)", true);
  await shot(page, "휴대전화-내패스");
  await page.reload({ waitUntil: "load", timeout: 300_000 });
  await waitText(page, "내 등록");
  check("화면을 다시 열어도 기존 탑승권 연결이 유지된다", (await post("/api/guide", {token:myToken})).body.guide.checkedIn);
  await page.goto(`${BASE}/P/${myToken}`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "내 등록");
  check("대문자 주소(/P/…)로도 같은 등록 화면이 열린다", (await has(page, "MK127")));

  // 지워 볼 패스를 하나 따로 만든다.
  const gone = await register("MK111", ["gd_voice"]);
  await page.goto(`${BASE}/p/${gone.token}`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "내 등록 지우기");
  await clickText(page, "button", "내 등록 지우기");
  await waitText(page, "등록을 지울까요?");
  check("지우기 전에 한 번 더 묻는다. 처음 초점은 '그만두기'에 있다", (await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText)) === "그만두기");
  await shot(page, "휴대전화-지우기확인");
  await clickText(page, ".sheet-box button", "지우기");
  await waitText(page, "등록을 지웠습니다");
  check("여객이 직접 등록을 지울 수 있다", true);
  await shot(page, "휴대전화-지운뒤");
  await page.goto(`${BASE}/p/${gone.token}`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "사용이 끝난 패스입니다");
  check("지운 패스의 주소를 다시 열면 '사용이 끝난 패스'라고만 나온다", !(await has(page, "MK111")));
  await shot(page, "휴대전화-끝난패스");
  await page.goto(`${BASE}/p/0000000000000000`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "등록된 패스가 아닙니다");
  check("없는 패스 주소는 '등록된 패스가 아닙니다'라고 나온다", true);

  // 영어로 등록한 패스
  const enPass = await register("MK102", ["tr_walk", "mov_no_stairs", "fac_calm", "stf_call"], "en");
  await page.goto(`${BASE}/p/${enPass.token}`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "My registration");
  check("영어로 등록한 패스는 영어로 열린다. 도착지는 공항 코드(BKK)로 나온다", (await has(page, "BKK")) && (await has(page, "Stairs and escalators")));
  await shot(page, "휴대전화-영어패스");

  // 먼 날짜에 미리 등록한 패스: 운항 정보가 아직 없어 날짜만 나온다.
  const farDay = new Date(Date.now() + 9 * 3600_000 + 60 * 86_400_000).toISOString().slice(0, 10);
  const farReg = await post("/api/registrations", { flightDate: farDay, flightNo: "OZ106", choices: ["gd_large"], lang: "ko", consent: true, startedAt: new Date(Date.now() - 60_000).toISOString(), editCount: 0 });
  check("두 달 뒤 편도 미리 등록된다", farReg.status === 200, String(farReg.status));
  await page.goto(`${BASE}/p/${farReg.body.token}`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "운항 정보는 출발 이틀 전쯤부터 들어옵니다");
  check("미리 등록한 패스는 출발 날짜를 보여 주고, 탑승구와 시각은 출발 이틀 전쯤 나온다고 알린다", await has(page, `${Number(farDay.slice(5, 7))}월 ${Number(farDay.slice(8, 10))}일`));
  await shot(page, "휴대전화-미리등록-패스");

  // ───────── 3. 키오스크 설치 ─────────
  section("키오스크 설치");
  await page.setViewport(KIOSK_WIDE);
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "현장 기기 설치");
  check("설치하지 않은 기기에서 키오스크 화면을 열면 설치 화면으로 간다", page.url().endsWith("/kiosk"));
  await shot(page, "키오스크-설치");
  check("키오스크 쓰임새는 공항 입구 안내로봇이 먼저다. 보안검색 전 자리를 고른다", (await has(page, "공항 입구 안내로봇")) && (await page.$$eval("#place option", (os) => os.some((o) => (o.textContent ?? "").includes("안내데스크")))));
  await clickText(page, ".setup-use label", "안내 키오스크");
  const guidePlaces = await page.$$eval("#place option", (os) => os.map((o) => (o as HTMLOptionElement).textContent ?? ""));
  check("안내 키오스크는 보안검색 뒤의 자리만 고를 수 있다", guidePlaces.length > 5 && !guidePlaces.some((p) => p.includes("안내데스크")));
  await page.select("#place", "cc-train");
  await fill(page, "#code", COMMON_CODE);
  await page.keyboard.press("Enter");
  await waitText(page, "설치 코드가 맞지 않습니다");
  check("직원 접속 코드로는 키오스크를 설치할 수 없다", true);
  await fill(page, "#code", KIOSK_CODE);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname === "/kiosk/guide", { timeout: WAIT });
  await kioskServices(page);
  check("설치 코드와 자리를 넣으면 안내 키오스크가 된다", await has(page, "탑승동 지하 1층 셔틀트레인 도착층"));
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "직원 로그인");
  check("키오스크가 된 기기로는 직원 화면을 열 수 없다", true);
  const noSession = await post("/api/kiosk/resolve", { passNo: myNo });
  // 로그인(설치)이 아예 없는 기기는 401 이다. 로그인이 풀린 안내데스크가 이 답을 보고 다시 로그인하러 간다.
  check("설치하지 않은 기기는 번호로 패스를 열 수 없다 (401)", noSession.status === 401);
  const pub = await post("/api/guide", { token: myToken });
  check("QR 값만 아는 기기(휴대전화)에는 길과 시설을 주지 않는다. 항공편과 고른 항목만 준다", pub.status === 200 && pub.body.guide.place === null && pub.body.guide.facilities.length === 0 && pub.body.guide.gateRoute === null);
  check("어느 응답에도 이름이 없다", !JSON.stringify(pub.body).includes("name\""));

  // ───────── 4. 안내 키오스크: 번호로 열기 ─────────
  section("안내 키오스크: 번호로 열기 (카메라 없음)");
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await kioskServices(page);
  await waitText(page, "이 기기에서는 카메라를 쓸 수 없습니다");
  check("카메라가 없으면 번호를 누르라고 알려 준다", true);
  const callAt = await callSpot(page);
  check("처음 화면에도 「도움 요청하기」가 있다. 「이전·처음으로·설정」 줄의 버튼들을 가리지 않는다", callAt !== null && (await callClearOfBar(page)), String(callAt));
  check("처음 화면에는 여객 정보가 하나도 없다", !(await has(page, "MK1")));
  await clickText(page, ".listen-start", "소리로 안내 듣기");
  await page.waitForFunction(() => document.querySelector(".listen-start")?.getAttribute("aria-pressed") === "true", { timeout: WAIT });
  check("처음 화면에 큰 「소리로 안내 듣기」가 있고, 누르면 켜진다 (QR 을 대기 전에도 소리 안내를 켤 수 있다)", await has(page, "소리 안내 끄기"));
  await clickText(page, ".listen-start", "소리 안내 끄기");
  await page.waitForFunction(() => document.querySelector(".listen-start")?.getAttribute("aria-pressed") === "false", { timeout: WAIT });
  await shot(page, "안내키오스크-처음-카메라없음");
  await clickText(page, ".haneuli-number", "번호로 찾기");
  await waitText(page, "고유 일련 번호 여섯 자리를 눌러 주세요");
  check("번호 화면에서도 「도움 요청하기」가 같은 자리에 있다", sameSpot(await callSpot(page), callAt));
  for (const d of "000000") await clickText(page, ".pad-num .pad-key", d);
  await waitText(page, "등록된 패스가 아닙니다");
  check("틀린 번호는 등록된 패스가 아니라고 알려 주고 칸을 비운다", (await count(page, ".code-boxes .filled")) === 0);
  await shot(page, "안내키오스크-번호-틀림");
  for (const d of myNo.slice(0, 2)) await clickText(page, ".pad-num .pad-key", d);
  await page.click(".pad-erase");
  check("지우기를 누르면 한 자리가 지워진다", (await count(page, ".code-boxes .filled")) === 1);
  for (const d of myNo.slice(1)) await clickText(page, ".pad-num .pad-key", d);
  await openGuide(page);
  check("여섯 자리를 다 누르면 바로 안내가 열린다 (버튼을 더 누르지 않는다)", true);

  const kioskBase = 18;
  const kPx = await rootPx(page);
  check("큰 글씨를 고른 여객이 번호를 넣으면 키오스크 글자가 커진다", kPx >= 22, `${kPx}px (기본 ${kioskBase}px 이상에서 더 큼)`);
  check("안내 화면에 내 항공편과 탑승구 127이 크게 나온다", (await page.$eval(".gate-sign b", (e) => (e as HTMLElement).innerText)) === "127");
  const goText = await page.$eval(".gate-go", (e) => (e as HTMLElement).innerText);
  check("탑승구 가는 길에 걸리는 시간과 거리, '계단 없는 길'이 나온다", /약 \d+분 · \d+m/.test(goText) && goText.includes("계단 없는 길"), goText.replace(/\n/g, " "));
  check("남은 시간과 견주어 '시간이 넉넉합니다'라고 알려 준다", goText.includes("시간이 넉넉합니다"));
  const tiles = await page.$$eval(".tile strong", (es) => es.map((e) => (e as HTMLElement).innerText));
  check("고른 시설(장애인 화장실)이 '자주 찾는 시설'로 맨 앞에 나온다", tiles[0] === "장애인 화장실" && (await has(page, "자주 찾는 시설")), tiles.join(", "));
  check("고르지 않은 시설은 '다른 시설'로 뒤에 나온다", (await has(page, "다른 시설")) && tiles.length === 6);
  check("안내 화면에서도 「도움 요청하기」가 같은 자리에 있다", sameSpot(await callSpot(page), callAt));
  check("'제가 필요할 때 부를게요'를 고른 여객에게는 「도움 요청하기」가 크게 보인다", (await count(page, ".call-btn.call-big")) === 1);
  check("모의 자료라는 안내가 화면에 있다", await has(page, "시연용 모의 자료"));
  check("안내 화면에 이름이 없다", !(await has(page, "이름")));
  check("안내 화면에서도 「도움 요청하기」가 위쪽 줄의 버튼을 가리지 않는다", await callClearOfBar(page));
  await clickText(page, ".bar-btn", "설정");
  await waitText(page, "화면 설정");
  await clickText(page, ".size-pick button", "아주 크게");
  await page.waitForFunction((b) => parseFloat(getComputedStyle(document.documentElement).fontSize) > b, { timeout: WAIT }, kPx);
  // ResizeObserver adjusts the top toolbar after the font-size change.
  await page.waitForFunction(() => {
    const call = document.querySelector(".call-btn")?.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".flow-bar .bar-btn")].map(b => b.getBoundingClientRect());
    return !!call && buttons.length >= 3 && buttons.every(b => b.right <= call.left + 1 || b.left >= call.right - 1 || b.bottom <= call.top + 1 || b.top >= call.bottom - 1);
  }, {timeout:WAIT});
  check("키오스크에서도 설정으로 글자와 그림을 더 키울 수 있다. 「도움 요청하기」는 여전히 위쪽 줄의 버튼을 가리지 않는다", (await rootPx(page)) > kPx && (await callClearOfBar(page)));
  check("글자를 아주 크게 해도 설정의 닫는 버튼이 화면 안에 보인다 (안내키오스크)", await closeInView(page));
  await shot(page, "안내키오스크-설정-아주크게");
  await clickText(page, ".sheet-box button", "처음 고른 대로 되돌리기");
  await clickText(page, ".sheet-box button", "확인");
  await waitGone(page, "화면 설정");
  await shot(page, "안내키오스크-안내-큰글씨-휠체어");

  // 단추가 다른 것(묻는 창, 도움 요청하기 줄)에 가려 있지 않은지 본다. 가려 있으면 여객이 눌러도 아무 일이 없다.
  const gateCover = await page.evaluate(() => {
    const b = document.querySelector(".gate-go")!;
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && b.contains(hit) ? "" : (hit?.className?.toString() ?? "없음");
  });
  check("「탑승구 가는 길」 단추가 다른 것에 가려 있지 않다", gateCover === "", gateCover);
  await clickText(page, ".gate-go", "가는 길");
  // 처음 화면의 단추에도 같은 글이 있으므로, 길 안내 목록이 실제로 나올 때까지 기다린다.
  await page.waitForSelector(".route > li", { timeout: WAIT });
  const steps = await page.$$eval(".route > li", (es) => es.map((e) => (e as HTMLElement).innerText.replace(/\n/g, " ")));
  check("길 안내가 '지금 계신 곳'에서 시작해 '도착'으로 끝난다", steps[0].includes("지금 계신 곳") && steps[steps.length - 1].includes("127 도착"), `${steps.length}줄`);
  check("휠체어를 쓰는 여객에게는 엘리베이터로 안내한다 (에스컬레이터 아님)", steps.some((s) => s.includes("엘리베이터를 타고 3층")) && !steps.some((s) => s.includes("에스컬레이터를 타고")));
  check("걷는 구간은 '127번 탑승구' 표지를 따라가라고 안내한다", steps.some((s) => s.includes("‘127번 탑승구’ 표지를 따라")));
  check("가는 길의 장애인 화장실을 알려 준다", steps.some((s) => s.includes("가는 길에") && s.includes("장애인 화장실")));
  check("길 안내 화면에서도 「도움 요청하기」가 같은 자리에 있다", sameSpot(await callSpot(page), callAt));
  check("「이전」「처음으로」가 왼쪽 위에 있다", (await spot(page, ".bar-btn", "이전")) !== null && (await spot(page, ".bar-btn", "처음으로")) !== null);
  await shot(page, "안내키오스크-탑승구가는길");
  await clickText(page, ".bar-btn", "이전");
  await openGuide(page);

  await clickText(page, ".tile", "교통약자 라운지");
  await waitText(page, "교통약자 라운지 도착");
  const lounge = await page.$$eval(".route > li", (es) => es.map((e) => (e as HTMLElement).innerText.replace(/\n/g, " ")));
  check("시설을 누르면 그 시설까지의 길이 나온다 (4층 라운지: 엘리베이터로 4층)", lounge.some((s) => s.includes("엘리베이터를 타고 4층")) && lounge[lounge.length - 1].includes("4층"));
  await shot(page, "안내키오스크-시설가는길");
  await clickText(page, "button", "안내 첫 화면으로");
  await openGuide(page);


  // New kiosk requests go through confirmation; legacy call handling remains available.
  check("안내 키오스크의 도움 요청은 사전등록 연결 화면으로 간다", (await page.$eval(".call-btn", e => (e as HTMLAnchorElement).getAttribute("href")))?.includes(`/p/${myToken}/help`) === true);
  const zoneStaff = await staffCookie(COMMON_CODE, "cc-center");
  const otherStaff = await staffCookie(COMMON_CODE, "t2-mid");
  const legacy = await post("/api/kiosk/call", {token:myToken,screen:"guide"}, await kioskCookie("cc-center"));
  check("이전 호출 API도 담당 구역의 배정·종료를 유지한다", (await post(`/api/staff/calls/${legacy.body.id}`,{action:"accept"},zoneStaff)).status === 200 && (await post(`/api/staff/calls/${legacy.body.id}`,{action:"done"},zoneStaff)).status === 200);

  // 끝내기 → 만족도 → 처음 화면
  await clickText(page, "button", "안내 끝내기");
  await waitText(page, "안내가 도움이 되었나요?");
  check("끝낼 때 만족도 한 문항을 묻는다. 얼굴 그림 세 개", (await count(page, ".face")) === 3);
  check("만족도 화면에서도 「도움 요청하기」가 같은 자리에 있다", sameSpot(await callSpot(page), callAt));
  await shot(page, "안내키오스크-만족도");
  await clickText(page, ".face", "도움이 됐어요");
  await waitText(page, "고맙습니다");
  await kioskServices(page);
  check("답하면 처음 화면으로 돌아가고 앞사람의 내용은 남지 않는다", !(await has(page, "MK127")) && !(await has(page, "127")));
  check("처음 화면은 다시 보통 글자 크기다 (앞사람의 큰 글씨가 남지 않는다)", (await rootPx(page)) < kPx);

  // 오래 그대로 두면 계속 쓸지 묻는다. 점검에서는 기다리는 시간을 20초로 줄여서 본다(주소의 ?idle=20, 개발 서버에서만 된다).
  // 이 장면만 따로 연다. 짧게 둔 채 다른 장면을 보면 느린 컴퓨터에서는 그림을 뜨는 사이에 묻는 창이 떠서 눌림을 가로챈다.
  await page.goto(`${BASE}/kiosk/guide?idle=20`, { waitUntil: "load", timeout: 300_000 });
  await clickText(page, ".haneuli-number", "번호로 찾기");
  await waitText(page, "고유 일련 번호 여섯 자리를 눌러 주세요");
  // 여섯 자리를 한꺼번에 누른다. 하나씩 누르다 시간이 지나면 번호 화면에서 묻는 창이 먼저 뜬다.
  await page.evaluate((no) => {
    const keys = [...document.querySelectorAll(".pad-num .pad-key")] as HTMLElement[];
    for (const d of no) keys.find((k) => k.innerText.trim() === d)?.click();
  }, myNo);
  await openGuide(page);
  await waitText(page, "계속 이용하시겠어요?");
  check("오래 그대로 두면 말없이 끊지 않고 '계속 이용하시겠어요?'를 묻는다", await has(page, "처음 화면으로 돌아갑니다"));
  await shot(page, "안내키오스크-계속이용확인");
  await clickText(page, ".sheet-box button", "계속 이용하기");
  await waitGone(page, "계속 이용하시겠어요?");
  check("'계속 이용하기'를 누르면 보던 안내가 그대로 있다", await has(page, "나에게 맞춘 안내"));
  await waitText(page, "계속 이용하시겠어요?");
  await clickText(page, ".sheet-box button", "끝내기");
  await kioskServices(page);
  // 앞사람이 「설정」을 열어 둔 채 떠난다. 처음 화면으로 돌아가면 설정 창이 닫혀 있어야 한다.
  await clickText(page, ".haneuli-number", "번호로 찾기");
  await waitText(page, "고유 일련 번호 여섯 자리를 눌러 주세요");
  await page.evaluate((no) => {
    const keys = [...document.querySelectorAll(".pad-num .pad-key")] as HTMLElement[];
    for (const d of no) keys.find((k) => k.innerText.trim() === d)?.click();
  }, myNo);
  await openGuide(page);
  await clickText(page, ".bar-btn", "설정");
  await waitText(page, "화면 설정");
  await waitText(page, "계속 이용하시겠어요?");
  await clickText(page, ".sheet-box button", "끝내기");
  await kioskServices(page);
  check("앞사람이 「설정」을 열어 둔 채 떠나도, 처음 화면으로 돌아가면 설정 창이 닫혀 있다", !(await has(page, "화면 설정")));
  check("묻는 창에서 '끝내기'를 누르면 처음 화면으로 돌아간다", !(await has(page, "MK127")));
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });

  // 번호를 여러 번 틀리면 잠근다
  await clickText(page, ".haneuli-number", "번호로 찾기");
  for (let i = 0; i < 9; i++) {
    for (const d of "999999") await clickText(page, ".pad-num .pad-key", d);
    await page.waitForFunction(() => document.querySelectorAll(".code-boxes .filled").length === 0 && !!document.querySelector(".error"), { timeout: WAIT });
  }
  for (const d of myNo) await clickText(page, ".pad-num .pad-key", d);
  await waitText(page, "잠시 후 다시 해 주세요");
  check("번호를 열 번 틀리면 맞는 번호도 잠시 받지 않는다 (번호 맞히기 방지)", !(await has(page, "나에게 맞춘 안내")));
  await shot(page, "안내키오스크-번호-잠김");
  await browser.close();

  // ───────── 5. 안내 키오스크: 카메라로 열기 ─────────
  section("안내 키오스크: QR 을 카메라에 보여 주기");
  const tmp = await launch();
  const voicePass = await register("MK112", ["tr_see", "tr_understand", "tr_walk", "gd_voice", "gd_easy", "gd_picture", "mov_need_rest", "fac_calm", "fac_nursing", "stf_call"]);
  const nearFile = await cameraFile(tmp, voicePass.token, false);
  const farFile = await cameraFile(tmp, myToken, true);
  const enFile = await cameraFile(tmp, enPass.token, false);
  await tmp.close();

  // ───────── 다음 여객으로 넘어갈 때 ─────────
  // 서버의 답을 일부러 늦게 건네 "앞사람의 늦은 답"을 만든다. 요청은 바로 보내고, 답만 붙잡아 두었다가 놓는다.
  section("안내 키오스크: 다음 여객으로 넘어갈 때");
  browser = await launch();
  page = await open(browser, KIOSK_WIDE);
  await page.evaluateOnNewDocument(`
    window.__said = [];
    if (window.speechSynthesis) { const s = window.speechSynthesis; const real = s.speak.bind(s); s.speak = function (u) { window.__said.push(u.text); try { real(u); } catch (e) {} }; }
    window.__holdUrl = ""; window.__holdMethod = ""; window.__held = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input.url;
      const method = (init && init.method) || "GET";
      const p = realFetch(input, init);
      // 붙잡은 요청을 화면이 중간에 끊으면(시간 제한) 놓기 전에 실패가 난다. 그 실패를 여기서 받아 두어
      // "처리하지 않은 오류"로 잘못 잡히지 않게 한다. 화면은 놓을 때 같은 실패를 그대로 받는다.
      p.catch(() => {});
      if (window.__holdUrl && url.includes(window.__holdUrl) && method === window.__holdMethod) {
        return new Promise((res, rej) => window.__held.push(() => p.then(res, rej)));
      }
      return p;
    };
    window.__release = () => { const h = window.__held; window.__held = []; window.__holdUrl = ""; h.forEach((f) => f()); return h.length; };
  `);
  const typeNo = (no: string) =>
    page.evaluate((n) => {
      const keys = [...document.querySelectorAll(".pad-num .pad-key")] as HTMLElement[];
      for (const d of n) keys.find((k) => k.innerText.trim() === d)?.click();
    }, no);
  const hold = (url: string, method: string) => page.evaluate((u, m) => Object.assign(window, { __holdUrl: u, __holdMethod: m, __held: [] }), url, method);
  // 앞의 점검이 이 기기(접속 주소와 브라우저 표시의 짝)의 번호 입력을 일부러 잠갔다. 다른 키오스크인 것으로 한다.
  await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) JSP-E2E-Kiosk-3");
  await useCookie(page, await kioskCookie("cc-center"));
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });

  // 앞사람(MK112)이 안내를 보는 중에 30초마다 다시 받는 답이 오는 사이 「처음으로」를 누른다.
  // 늦게 온 앞사람의 답이 안내를 되살리면, 다음 사람이 번호 화면을 열 때 앞사람의 항공편이 나온다.
  await clickText(page, ".haneuli-number", "번호로 찾기");
  await waitText(page, "여섯 자리를 눌러 주세요");
  await typeNo(voicePass.passNo);
  await waitText(page, "MK112");
  await hold("/api/guide", "POST");
  await page.waitForFunction("window.__held.length > 0", { timeout: 60_000 });
  await clickText(page, ".bar-btn", "처음으로");
  await kioskServices(page);
  const lateGuide = await page.evaluate("window.__release()");
  await sleep(2500);
  const startClean = !(await has(page, "MK112")) && (await isKioskHome(page));
  await clickText(page, ".haneuli-number", "번호로 찾기");
  await page.waitForFunction(() => /여섯 자리를 눌러 주세요|MK112|나에게 맞춘 안내/.test(document.body.innerText), { timeout: WAIT });
  check("「처음으로」를 누른 뒤 앞사람의 안내를 다시 받은 답이 늦게 와도, 다음 사람 화면에 앞사람의 항공편이나 안내가 나오지 않는다", startClean && !(await has(page, "MK112")) && !(await has(page, "나에게 맞춘 안내")), `늦은 답 ${lateGuide}개`);
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });

  await browser.close();

  // 기기 점검 화면(/check). 시연 전에 그 기기에서 카메라, 소리, 인터넷을 본다. 읽은 QR 로 여객 정보를 열지 않는다.
  section("기기 점검 화면");
  browser = await launch(CAMERA(nearFile));
  page = await open(browser, PHONE);
  // 개발 서버는 처음 여는 주소를 그 자리에서 만들어 몇 초씩 걸린다. 미리 한 번 열어 둔다.
  await fetch(`${BASE}/check`, { method: "HEAD" }).catch(() => {});
  await page.goto(`${BASE}/check`, { waitUntil: "load", timeout: 300_000 });
  // 개발 서버가 다른 일로 바빠 8초 안에 못 답하면 "닿지 않습니다"가 나온다. 그럴 때만 「다시 확인」을 한 번 더 누른다.
  await page.waitForFunction(() => /초 만에 답했습니다|연결은 되지만 느립니다|서버에 연결되지 않습니다/.test(document.body.innerText), { timeout: WAIT });
  if (await has(page, "서버에 연결되지 않습니다")) {
    await clickText(page, "button", "다시 확인");
    await page.waitForFunction(() => !/인터넷 연결을 확인하는 중/.test(document.body.innerText), { timeout: WAIT });
  }
  // 개발 서버가 바쁘면 "느립니다"로 나올 수 있다. 어느 쪽이든 걸린 시간을 알려 주면 된다. "닿지 않습니다"만 틀린 것이다.
  await page.waitForFunction(() => /초 만에 답했습니다|연결은 되지만 느립니다|서버에 연결되지 않습니다/.test(document.body.innerText), { timeout: WAIT });
  check("인터넷이 되는지 보고 서버가 답한 시간을 알려 준다", /초 만에 답했습니다|연결은 되지만 느립니다\(\d/.test(await text(page)) && !(await has(page, "서버에 연결되지 않습니다")));
  check("카메라, 소리, 인터넷, 화면, 인터넷 없이 열기, 화면 꺼짐 막기 여섯 가지를 본다", (await count(page, ".dc-item")) === 6);
  await page.waitForSelector(".dc-qr svg", { timeout: WAIT });
  check("다른 기기로 읽어 볼 점검용 QR 이 있고, 그 QR 은 이 점검 화면 주소다", (await readQr(page, ".dc-qr svg")) === `${BASE}/CHECK`.toUpperCase());
  await clickText(page, "button", "카메라 켜기");
  await waitText(page, "고유 일련 번호 화면의 QR을 읽었습니다");
  check("카메라를 켜고 QR 을 보여 주면 읽었다고 알려 준다", true);
  check("점검 화면은 읽은 QR 로 여객 정보를 열지 않는다", !(await has(page, "MK112")) && page.url().endsWith("/check"));
  await shot(page, "기기점검");
  await browser.close();

  browser = await launch(CAMERA(nearFile));
  page = await open(browser, KIOSK_TALL);
  // 기기에 QR 판독 기능이 있다고 나오지만 아무것도 읽지 못하는 기기를 흉내 낸다. 그래도 읽혀야 한다.
  await page.evaluateOnNewDocument("window.BarcodeDetector = function () { this.detect = function () { return Promise.resolve([]); }; };");
  // 소리 안내가 실제로 불리는지 센다.
  await page.evaluateOnNewDocument(
    "window.__said = []; if (window.speechSynthesis) { const s = window.speechSynthesis; const real = s.speak.bind(s); s.speak = function (u) { window.__said.push(u.text); try { real(u); } catch (e) {} }; }",
  );
  await useCookie(page, await kioskCookie("cc-center"));
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await openGuide(page);
  check("QR 을 카메라에 보여 주면 누르지 않아도 안내가 열린다 (기기의 QR 판독 기능이 먹통이어도)", true);
  // 마감까지 2시간 넘게 남으면 분 대신 "비행기 타는 문이 08:15에 닫힙니다"처럼 시각으로 알린다(밤에는 "내일 00:01에"). 어느 쪽이든 쉬운 말이다.
  check("쉬운 말을 고른 여객에게는 쉬운 말로 안내한다", /비행기 타는 문이 (닫히기까지|(내일 )?\d{2}:\d{2}에 닫힙니다)/.test(await text(page)) && (await has(page, "자주 가는 곳")));
  check("그림을 고른 여객에게는 그림을 크게 보여준다", await page.evaluate(() => document.documentElement.hasAttribute("data-picture")));
  check("'직원을 부르고 싶습니다'를 고른 여객에게는 「도움 요청하기」가 크게 보인다", (await count(page, ".call-btn.call-big")) === 1);
  const said = (await page.evaluate("window.__said")) as string[];
  check("소리 안내를 고른 여객에게는 화면을 소리로 읽어 준다", said.some((s) => s.includes("MK112") && s.includes("탑승구")), `${said.length}번 읽음`);
  const tall = await page.$$eval(".tile strong", (es) => es.map((e) => (e as HTMLElement).innerText));
  check("고른 들를 곳 두 곳(수유실, 조용히 쉴 곳)이 맨 앞에 나온다", tall.slice(0, 2).sort().join() === ["유아 휴게실·수유실", "심리안정실"].sort().join(), tall.join(", "));
  await shot(page, "안내키오스크-세로-쉬운말-그림");
  await page.click(".gate-go");
  await waitText(page, "가는 길");
  const easySteps = await text(page);
  check("쉬어 가야 하는 여객에게는 가는 길의 쉴 곳을 알려 준다", easySteps.includes("가는 길에") && easySteps.includes("쉴 곳"));
  check("같은 층이면 '같은 층'이라고 알려 준다 (계단이 없다)", easySteps.includes("같은 층"));
  const said2 = (await page.evaluate("window.__said")) as string[];
  check("화면이 바뀌면 새 화면을 다시 읽어 준다", said2.length > said.length && said2[said2.length - 1].includes("124"));
  await shot(page, "안내키오스크-세로-길안내-그림");
  await clickText(page, ".bar-btn", "처음으로");
  await kioskServices(page);
  await new Promise((r) => setTimeout(r, 3000));
  check("안내를 끝낸 직후에는 같은 QR 이 카메라 앞에 있어도 곧바로 다시 열리지 않는다", await isKioskHome(page));
  await shot(page, "안내키오스크-세로-처음");
  await browser.close();

  browser = await launch(CAMERA(farFile));
  page = await open(browser, KIOSK_WIDE);
  // 이번에는 기기의 QR 판독 기능이 오류를 내는 경우를 흉내 낸다.
  await page.evaluateOnNewDocument("window.BarcodeDetector = function () { this.detect = function () { return Promise.reject(new Error('unavailable')); }; };");
  await useCookie(page, await kioskCookie("t1-center"));
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await openGuide(page);
  check("20~30cm 떨어져 작게 보이는 QR 도 읽는다 (1920x1080 화면에 170화소, 기기 판독 기능은 오류)", true);
  await page.click(".gate-go");
  await waitText(page, "셔틀트레인을 타고 탑승동으로 갑니다");
  const train = await page.$$eval(".route > li", (es) => es.map((e) => (e as HTMLElement).innerText.replace(/\n/g, " ")));
  check(
    "제1여객터미널 키오스크에서 탑승동 탑승구로는 엘리베이터 → 셔틀트레인 → 엘리베이터 순으로 안내한다",
    train.findIndex((s) => s.includes("지하 1층으로 내려갑니다")) < train.findIndex((s) => s.includes("셔틀트레인을 타고")) &&
      train.findIndex((s) => s.includes("셔틀트레인을 타고")) < train.findIndex((s) => s.includes("3층으로 올라갑니다")),
  );
  await shot(page, "안내키오스크-가로-셔틀트레인길");
  await browser.close();

  browser = await launch(CAMERA(enFile));
  page = await open(browser, KIOSK_WIDE);
  await useCookie(page, await kioskCookie("cc-125"));
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await openGuide(page, "Guide me with this", "Guidance for you");
  check("영어로 등록한 여객이 QR 을 대면 키오스크가 영어로 바뀐다", (await has(page, "Way to Gate 130")) && (await has(page, "Request assistance")));
  check("계단이 어렵다고 한 여객의 라운지 길은 lift 로 안내한다", true);
  await clickText(page, ".tile", "Assistance lounge");
  await waitText(page, "Take the lift up to 4F");
  await shot(page, "안내키오스크-영어-라운지길");
  await browser.close();
  for (const f of [nearFile, farFile, enFile]) fs.rmSync(f, { force: true });

  // 길을 안내하지 못하는 경우들
  await resetFlights();
  browser = await launch();
  page = await open(browser, KIOSK_WIDE);
  // 바로 앞에서 번호 입력이 잠긴 것은 그 기기(접속 주소와 브라우저 표시의 짝)다. 다른 키오스크인 것으로 하고 이어 간다.
  await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) JSP-E2E-Kiosk-2");
  const kc = await kioskCookie("cc-center");
  await useCookie(page, kc);
  const cases: [string, string, string][] = [
    ["MK900", "탑승구가 아직 정해지지 않았습니다", "탑승구가 정해지지 않은 편은 그렇다고 알리고 시설 안내는 그대로 한다"],
    ["MK221", "제2여객터미널에서 출발합니다. 여기서는 걸어서 갈 수 없습니다", "다른 터미널에서 출발하는 편은 어느 터미널인지 알리고 직원을 부르라고 안내한다"],
    ["MK403", "결항된 편", "결항된 편은 결항이라고 알린다"],
  ];
  for (const [flightNo, expected, name] of cases) {
    const made = await register(flightNo, ["fac_calm"]);
    await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
    await clickText(page, ".haneuli-number", "번호로 찾기");
    for (const d of made.passNo) await clickText(page, ".pad-num .pad-key", d);
    await openGuide(page);
    check(name, (await has(page, expected)) && (await count(page, ".gate-go")) === 0 && (await count(page, ".tile")) === 6);
    if (flightNo === "MK900") await shot(page, "안내키오스크-탑승구미정");
    if (flightNo === "MK403") await shot(page, "안내키오스크-결항");
  }
  const late = await register("MK402", ["mov_need_rest"]);
  await page.goto(`${BASE}/kiosk/guide?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await clickText(page, ".haneuli-number", "번호로 찾기");
  for (const d of late.passNo) await clickText(page, ".pad-num .pad-key", d);
  await openGuide(page);
  check("탑승이 마감된 편은 빨갛게 알리고 직원을 부르라고 안내한다", (await has(page, "탑승이 마감되었습니다")) && (await has(page, "「도움 요청하기」를 눌러 주세요")) && (await count(page, ".gate-go.pace-late")) === 1);
  await shot(page, "안내키오스크-탑승마감");
  const changed = await register("MK250", ["gd_large"]);
  const delayed = await post("/api/kiosk/resolve", { passNo: changed.passNo }, await kioskCookie("t2-center"));
  check("지연된 편은 바뀐 출발 시각을 함께 준다", delayed.body.guide.flight.delayed === true && typeof delayed.body.guide.flight.estTime === "string");
  await browser.close();

  // ───────── 6. Retired sticker path and existing kiosk registration compatibility ─────────
  section("현장 등록: 기존 탑승권 경로");
  browser = await launch(); page = await open(browser,KIOSK_WIDE);
  const regKiosk=await kioskCookie("t1-info");
  await useCookie(page,regKiosk);
  await page.goto(`${BASE}/kiosk/register`,{waitUntil:"load",timeout:WAIT});
  await page.waitForFunction(()=>location.pathname==="/kiosk/entry",{timeout:WAIT});
  check("이전 등록 키오스크 주소는 기존 탑승권을 쓰는 입구 화면으로 연결된다",true);
  check("현장 첫 화면에서 별도 지원 QR이나 스티커를 발급하지 않는다",(await count(page,".pass-qr-code,.sticker"))===0);
  await shot(page,"현장등록-기존탑승권");
  const desk=await staffCookie(DESK_CODE);
  const kioskReg=await register("MK501",["tr_walk","mov_wheelchair_need","gd_picture"],"ko",regKiosk);
  const kioskNo=kioskReg.passNo,kioskQr=passUrl(BASE,kioskReg.token);
  check("기존 키오스크 등록 API의 고유 일련 번호 조회 호환성을 유지한다",/^\d{6}$/.test(kioskNo));
  await register("MK111",["fac_calm"],"ko",regKiosk);
  const oldRegCall=await post("/api/kiosk/call",{screen:"register"},regKiosk);
  check("이전 등록 호출 API의 취소 호환성을 유지한다",(await fetch(`${BASE}/api/kiosk/call/${oldRegCall.body.id}`,{method:"DELETE",headers:{Cookie:regKiosk}})).status===200);
  await browser.close();

  // ───────── 7. 직원 화면 ─────────
  section("직원: 호출 화면");
  browser = await launch();
  page = await open(browser, PHONE);
  // 새 호출 알림(진동)이 몇 번 울렸는지 센다. 호출 목록을 잠시 멈추는 손잡이(__hold)도 둔다.
  await page.evaluateOnNewDocument(`
    window.__buzz = 0;
    navigator.vibrate = function () { window.__buzz++; return true; };
    window.__hold = false;
    const realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input.url;
      if (window.__hold && url.includes("/api/staff/calls") && !(init && init.method === "POST")) return new Promise(() => {});
      return realFetch(input, init);
    };
  `);
  const buzz = () => page.evaluate("window.__buzz") as Promise<number>;
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "직원 로그인");
  check("로그인하지 않으면 직원 화면이 열리지 않는다", true);
  await shot(page, "직원-로그인");
  await fill(page, "#code", KIOSK_CODE);
  await page.keyboard.press("Enter");
  await waitText(page, "접속 코드가 맞지 않습니다");
  check("키오스크 설치 코드로는 직원 화면에 들어갈 수 없다", true);
  await fill(page, "#code", COMMON_CODE);
  await page.keyboard.press("Enter");
  await waitText(page, "오늘 근무하는 구역을 골라 주세요");
  await shot(page, "직원-구역고르기");
  await clickText(page, ".zone-opt", "중앙부");
  await waitText(page, "접수·배정");
  check("직원 로그인 후 통합 요청이 첫 화면이다",new URL(page.url()).pathname === "/staff/requests");
  await page.goto(`${BASE}/staff/legacy/calls`, {waitUntil:"load",timeout:300_000});
  await waitText(page, "직원 호출");
  await waitText(page, "탑승동 중앙부");
  check("공통 코드로 들어와 근무 구역을 고르면 호출 화면이 열린다", true);
  await waitText(page, "지금은 호출이 없습니다");
  check("호출이 없으면 '여객이 부를 때 갑니다'라고 안내한다 (먼저 다가가는 화면이 아니다)", (await has(page, "지금은 호출이 없습니다")) && (await has(page, "먼저 다가가 돕지 않고")));
  check("직원 화면에 여객 목록이 없다", !(await has(page, "여객 목록")));
  await page.focus(".seg-refresh");
  await sleep(6500);
  check("5초마다 저절로 다시 읽어도 「새로 고침」에 있던 초점이 사라지지 않는다 (키보드·화면 읽기 프로그램)", await page.evaluate(() => document.activeElement?.classList.contains("seg-refresh") === true));
  await shot(page, "직원-호출없음");

  // 여객이 키오스크에서 부른다 (화면 대신 서버에 직접). 다른 구역 호출이 먼저 온다.
  const c2 = await post("/api/kiosk/call", { screen: "guide" }, await kioskCookie("t2-center"));
  await page.waitForFunction(() => document.querySelectorAll(".seg .count")[1]?.textContent === "1", { timeout: WAIT });
  check("「내 구역」을 보고 있으면 다른 구역의 새 호출로는 울리지 않는다", (await buzz()) === 0, `${await buzz()}번`);
  const callKiosk = await kioskCookie("cc-center");
  const c1 = await post("/api/kiosk/call", { token: voicePass.token, screen: "guide" }, callKiosk);
  const c1again = await post("/api/kiosk/call", { token: voicePass.token, screen: "guide" }, callKiosk);
  check("여객이 버튼을 여러 번 눌러도 호출은 하나만 생긴다", c1.body.id === c1again.body.id);
  await waitText(page, "기다리는 중");
  check("내 구역에 새 호출이 오면 한 번 울린다", (await buzz()) === 1, `${await buzz()}번`);
  check("새 호출이 몇 초 안에 직원 화면에 저절로 뜬다 (새로 고치지 않아도)", await has(page, "탑승동 3층 중앙"));
  const card = await page.$eval(".call", (e) => (e as HTMLElement).innerText.replace(/\n/g, " "));
  check("호출 카드에 어느 키오스크인지, 언제 불렀는지, 여객이 고른 항목과 항공편이 나온다", ["탑승동 3층 중앙", "소리 안내", "쉬운 말", "쉬어 가기", "MK112", "124"].every((s) => card.includes(s)), card.slice(0, 160));
  check("호출 카드에 이름이 없다", !card.includes("이름"));
  check("내 구역 탭에는 내 구역 호출만 보인다", (await count(page, ".call")) === 1);
  await shot(page, "직원-호출옴");
  await clickText(page, ".seg button", "전체");
  await page.waitForFunction(() => document.querySelectorAll(".call").length === 2, { timeout: WAIT });
  check("전체 탭에는 다른 구역의 호출도 보인다 (점선 테두리)", (await count(page, ".call.call-other")) === 1);
  check("패스 없이 부른 호출은 '가서 여쭤봐 주세요'라고 안내한다", await has(page, "패스를 찍지 않고 불렀습니다"));
  await shot(page, "직원-호출-전체");
  // 다른 구역 직원이 먼저 받은 호출을 이 화면에서 늦게 누른다. 목록이 그 사이에 바뀌지 않게 잠시 멈춘다.
  await page.evaluate("window.__hold = true");
  await sleep(6000);
  await post(`/api/staff/calls/${c2.body.id}`, { action: "accept" }, otherStaff);
  await page.evaluate("window.__hold = false");
  await page.evaluate(() => {
    const other = document.querySelector(".call.call-other") as HTMLElement;
    ([...other.querySelectorAll("button")].find((b) => b.innerText.includes("가겠습니다")) as HTMLElement).click();
  });
  await waitText(page, "다른 직원이 먼저 받았거나 끝난 호출입니다");
  await sleep(6500);
  check("다른 직원이 먼저 받은 호출을 누르면 그렇다고 알리고, 목록을 다시 읽어도 그 알림이 바로 사라지지 않는다", await has(page, "다른 직원이 먼저 받았거나 끝난 호출입니다"));
  await clickText(page, ".seg button", "내 구역");
  await clickText(page, ".call button", "가겠습니다");
  await waitText(page, "내 구역이 가는 중");
  check("'가겠습니다'를 누르면 '가는 중'으로 바뀐다", (await get(`/api/kiosk/call/${c1.body.id}`, callKiosk)).body.state === "accepted");
  await shot(page, "직원-가는중");
  await clickText(page, ".call button", "도움 마침");
  await waitText(page, "방금 끝난 호출");
  await page.waitForFunction(() => document.querySelectorAll(".call").length === 0, { timeout: WAIT }).catch(() => {});
  check("'도움 마침'을 누르면 목록에서 내려가 '방금 끝난 호출'에 남는다", (await count(page, ".call")) === 0 && (await has(page, "도움 마침")));
  await shot(page, "직원-끝난호출");
  await post(`/api/staff/calls/${c2.body.id}`, { action: "done" }, otherStaff);
  check("알림은 새 호출마다 한 번씩만 울렸다 (같은 호출로 다시 울리지 않는다)", (await buzz()) === 1, `${await buzz()}번`);
  check("직원 메뉴에 안내데스크가 없다 (현장 직원 코드)", !(await page.evaluate(() => (document.querySelector(".staff-nav") as HTMLElement).innerText.includes("안내데스크"))));
  await page.goto(`${BASE}/staff/desk`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "안내데스크에서만 쓸 수 있습니다");
  check("현장 직원은 안내데스크 화면을 쓸 수 없다", true);
  await clickText(page, ".sign-btn, a, button", "통합 요청으로");
  await waitText(page, "접수·배정");
  await clickText(page, ".sign-btn", "구역 바꾸기");
  await waitText(page, "어느 구역으로 옮기나요?");
  await clickText(page, ".zone-opt", "끝단");
  await waitText(page, "탑승동 끝단");
  check("근무 중에 구역을 바꿀 수 있다", true);
  await clickText(page, ".sign-btn", "나가기");
  await waitText(page, "직원 로그인");
  check("나가기를 누르면 로그인 화면으로 돌아간다", true);

  section("직원: 안내데스크");
  // 앞에서 일부러 틀린 번호를 여러 번 넣었다. 틀린 횟수는 기기별로 세므로 안내데스크는 다른 기기로 본다.
  await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) JSP-E2E-Desk");
  await fill(page, "#code", DESK_CODE);
  await page.keyboard.press("Enter");
  await waitText(page, "접수·배정");
  await page.click(".workspace-mobile-menu > summary");
  check("안내데스크 코드로 들어오면 운영 메뉴에 안내데스크와 통합 현황이 있다", (await has(page, "안내데스크")) && (await has(page, "통합 운영 현황")));
  await clickText(page, ".staff-nav a", "안내데스크");
  await waitText(page, "여객 대신 등록하기");
  check("안내데스크는 이름으로 여객을 찾지 않는다 (이름을 받지 않는다)", !(await has(page, "이름으로")));
  await shot(page, "데스크-처음");
  await fill(page, "#desk-pass-no", "000000");
  await page.keyboard.press("Enter");
  await waitText(page, "등록된 패스가 아닙니다");
  await fill(page, "#desk-pass-no", kioskNo);
  await page.keyboard.press("Enter");
  await waitText(page, "찾은 패스");
  check("여객이 불러 준 번호로 패스를 찾는다. 항공편과 고른 항목이 줄인 말로 나온다", (await has(page, "MK501")) && (await has(page, "휠체어 대여")) && (await has(page, "글·그림")));
  await shot(page, "데스크-찾은패스");
  await clickText(page, "button", "등록 지우기");
  await waitText(page, "이 등록을 지울까요?");
  await clickText(page, ".sheet-box button", "지우기");
  await waitText(page, "등록을 지웠습니다");
  check("여객이 원하면 안내데스크에서 등록을 지운다", (await post("/api/guide", { token: kioskQr.split("/P/")[1] })).status === 410);

  await page.goto(`${BASE}/staff/desk/register`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "지원정보 대신 등록");
  check("대신 등록 화면에는 「도움 요청하기」가 없다", (await count(page, ".call-btn")) === 0);
  await clickText(page, "button", "대신 등록 시작");
  await waitText(page, "어떤 점이 불편하세요?");
  check("대신 등록도 여객이 보는 것과 같은 질문을 같은 순서로 쓴다", await has(page, "어떤 점이 불편하세요?"));
  await clickText(page, '[role="checkbox"]', "지금은 없어요");
  await clickText(page, ".flow-cta button", "다음");
  await clickText(page, "button", "동의하고 계속");
  for (const title of ["함께 가시는 분이 있나요?", "도움은 어떻게 받으시겠어요?", "가시는 길에 들르실 곳이 있나요?", "타실 항공편을 알려 주세요"]) {
    await waitText(page, title);
    if (title !== "타실 항공편을 알려 주세요") await clickText(page, ".flow-cta button", "다음");
  }
  await fill(page, "#reg-flight", "MK127");
  await clickText(page, ".flight-opt", "MK127");
  await clickText(page, ".flow-cta button", "다음");
  await waitText(page, "더 하고 싶은 말씀이 있나요?");
  await clickText(page, ".flow-cta button", "다음");
  await waitText(page, "이대로 등록할까요?");
  const [assistedResponse]=await Promise.all([
    page.waitForResponse(r=>r.url().endsWith("/api/desk/register")&&r.request().method()==="POST"),
    clickText(page,".flow-cta button","등록하기"),
  ]);
  const assistedPass=await assistedResponse.json();
  await waitText(page,"기존 탑승권 연결");
  check("직원 대신 등록은 기존 탑승권 연결로 이어지고 별도 QR/스티커는 발급하지 않는다",(await count(page,".pass-qr-code,.sticker"))===0&&await has(page,"별도 QR이나 스티커는 발급하지 않습니다"));
  const assistedGuide=(await post("/api/guide",{token:assistedPass.token})).body.guide;
  const assistedCode=`BP1:${assistedGuide.flight.flightDate!.replaceAll("-","")}:MK127:${Date.now().toString(16).slice(-10).toUpperCase()}`;
  const assistedImage=path.join(os.tmpdir(),`jsp-assisted-${Date.now()}.png`);tempFiles.push(assistedImage);
  await QRCode.toFile(assistedImage,assistedCode,{width:600,margin:4});
  await (await page.$('input[type="file"]'))!.uploadFile(assistedImage);
  await waitText(page,"기존 탑승권 연결 완료");
  check("직원이 대신 등록한 지원정보가 기존 탑승권에 연결된다",(await post("/api/guide",{token:assistedPass.token})).body.guide.checkedIn);
  await shot(page,"데스크-대신등록-연결완료");

  // ───────── 우대출구 ─────────
  // 증빙이 확인되고 체크인한 여객의 탑승권을 우대출구 직원이 찍는다. 대상 여부와 필요한 지원만 나온다.
  const exitPass = await register("MK127", ["tr_walk", "tr_see", "gd_large", "mov_no_stairs", "fac_calm", "stf_call"], "ko", "", { proof: true });
  check("모의 체크인으로 탑승권에 전자토큰을 저장한다", (await post("/api/pass/checkin", { token: exitPass.token })).status === 200);
  const tmpExit = await launch();
  const exitFile = await cameraFile(tmpExit, exitPass.token, false);
  await tmpExit.close();
  await browser.close();
  browser = await launch(CAMERA(exitFile));
  page = await open(browser, PHONE);
  await useCookie(page, zoneStaff);
  await page.goto(`${BASE}/staff/exit`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "교통약자 우대출구");
  await waitText(page, "우대 대상 확인됨");
  const exitText = await text(page);
  check("우대출구에서 탑승권을 찍으면 '우대 대상 확인됨'과 필요한 지원만 나온다", exitText.includes("계단 어려움") && exitText.includes("필요 시 호출") && exitText.includes("패스트트랙"));
  check("우대출구 화면에는 대상 유형, 증빙서류, 안내 화면 설정, 찾는 시설이 나오지 않는다", !["장애", "복지카드", "큰 글씨", "쉴 곳"].some((s) => exitText.includes(s)));
  await shot(page, "우대출구-확인됨");
  await browser.close();
  fs.rmSync(exitFile, { force: true });
  const noProof = await register("MK127", ["mov_no_stairs"]);
  await post("/api/pass/checkin", { token: noProof.token });
  const notOk = await post("/api/staff/exit", { scanned: noProof.token }, zoneStaff);
  check("증빙을 내지 않은 여객은 우대 확인이 안 되어 체크인 카운터로 안내한다", notOk.status === 200 && notOk.body.result.eligible === false);

  // ───────── 공항 입구 안내로봇 ─────────
  section("공항 입구 안내로봇과 이동지원");
  // 시간대에 따라 닫힌 운영 기준으로 UI 검사가 실패하지 않도록 격리된 로컬 fixture만 설정한다.
  if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Local fixture required for robot dispatch scenario");
  const originalMobilityRule = ((await get("/api/staff/visits", desk)).body.rules as HubRule[]).find((r: {hubId:string;service:string}) => r.hubId === "t1-departure" && r.service === "mobility");
  const openedMobilityRule = await post("/api/staff/visits", {...originalMobilityRule!, action:"rule", openHour:0, closeHour:24, capacity:2, state:"ready", battery:100, availableAfter:null, reason:""}, desk);
  check("로봇 이동지원 검사는 로컬 시험용 거점의 가용 시간에 독립적이다", openedMobilityRule.status === 200);
  // 미리 등록하지 않은 여객의 모의 탑승권(편과 탑승권 번호만)을 가짜 카메라에 보여 준다.
  const entryFlight = ((await get("/api/flights/search?q=MK5")).body.flights as { flightDate: string; flightNo: string; cancelled: boolean }[]).find((f) => !f.cancelled)!;
  const bpText = `BP1:${entryFlight.flightDate.replace(/-/g, "")}:${entryFlight.flightNo}:E2E${String(Date.now()).slice(-7)}`;
  const tmpBp = await launch();
  const bpFile = await cameraFile(tmpBp, bpText, false, true);
  await tmpBp.close();
  browser = await launch(CAMERA(bpFile));
  page = await open(browser, KIOSK_WIDE);
  await useCookie(page, await kioskCookie("t1-info"));
  await page.goto(`${BASE}/kiosk/entry?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await page.$eval(".robot-pass-entry", e => (e as HTMLDetailsElement).open = true);
  await waitText(page, "어떤 점이 불편하세요?");
  check("탑승권을 찍으면 로봇이 깨어나고, 등록하지 않은 여객에게 체크리스트 1쪽의 불편(여섯 가지)을 묻는다", (await count(page, ".easy-tile")) === 6 && (await has(page, "왔군요!")) && (await has(page, entryFlight.flightNo)));
  await shot(page, "입구로봇-불편고르기");
  await clickText(page, ".easy-tile", "걷기");
  await clickText(page, ".flow-cta button", "다음");
  await waitText(page, "우대출구를 쓰시려면 서류를 보여 주세요");
  check("그 자리에서 서류를 인식시켜 우대 확인을 받을 수 있고, 서류 없이도 계속할 수 있다", (await count(page, '[role="radio"]')) === 4 && (await has(page, "서류 없이 계속")));
  await clickText(page, ".flow-cta button", "서류 없이 계속");
  await waitText(page, "동의하고 등록하기");
  check("등록 전에 무엇을 받는지 알리고 동의를 받는다", await has(page, "이름과 연락처는 받지 않습니다"));
  await clickText(page, ".flow-cta button", "동의하고 등록하기");
  await waitText(page, "무엇을 도와드릴까요?");
  check("등록하면 맞춤 안내·이동지원 요청·접수 상태 확인으로 이어진다", (await count(page, ".svc-card")) === 3);
  await shot(page, "입구로봇-서비스");
  await clickText(page, ".svc-card", "이동지원 요청");
  await page.waitForSelector("#dx-place");
  check("안내로봇의 이동지원은 위치가 고정된 통합 요청으로 이어진다",await page.$eval('#dx-place',e=>(e as HTMLSelectElement).value === 't1-info' && (e as HTMLSelectElement).disabled) && await page.$eval('input[name="service"][value="mobility"]',e=>(e as HTMLInputElement).checked));
  await page.click('input[type="checkbox"][required]');await page.click('button[type="submit"]');
  await clickText(page,'button','이 내용으로 요청 접수');await page.waitForSelector('.request-state-pill[role="status"]');
  const integrated=await page.evaluate(async()=>{const receipt=sessionStorage.getItem('jsp-dx-receipt-v1');return (await(await fetch('/api/requests/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt})})).json()).request;});
  check("이동지원 접수가 기존 별도 API 대신 통합 요청에 저장된다", integrated.service === 'mobility' && integrated.source === 'kiosk');
  const staffBrowser=await launch();const staffPage=await open(staffBrowser,PHONE);await useCookie(staffPage,desk);
  await staffPage.goto(`${BASE}/staff/requests`,{waitUntil:'load',timeout:300_000});await staffPage.waitForSelector(`[data-request-id="${integrated.id}"]`);
  check("직원의 통합 화면에서 같은 이동지원 요청이 보인다",true);await shot(staffPage,"직원-통합이동지원");
  const accepted=await post('/api/staff/requests',{id:integrated.id,version:integrated.version,action:'assign'},desk);
  check("직원이 통합 요청을 배정한다",accepted.status === 200);await staffBrowser.close();
  await waitText(page,'담당자 배정');await shot(page,'입구로봇-통합배정');
  await clickText(page,'button','요청 취소');await waitText(page,'취소됨');
  await page.goto(`${BASE}/kiosk/entry?idle=1800`, { waitUntil: "load", timeout: 300_000 });
  await page.$eval(".robot-pass-entry", e => (e as HTMLDetailsElement).open = true);
  await waitText(page, "미리 등록하신 내용이에요");
  check("같은 탑승권을 다시 찍으면 등록한 여객으로 알아보고 고른 도움을 확인하게 한다", (await has(page, "계단과 에스컬레이터")) && (await has(page, "고치기")));
  await shot(page, "입구로봇-도움확인");
  await browser.close();
  const currentMobilityRule = ((await get("/api/staff/visits", desk)).body.rules as HubRule[]).find((r: {hubId:string;service:string}) => r.hubId === "t1-departure" && r.service === "mobility");
  const restoredMobilityRule = await post("/api/staff/visits", {...originalMobilityRule!, action:"rule", version:currentMobilityRule!.version}, desk);
  check("로컬 거점의 시험용 운영시간을 원래 기준으로 돌린다",restoredMobilityRule.status === 200);
  fs.rmSync(bpFile, { force: true });

  browser = await launch();
  page = await open(browser, KIOSK_WIDE);
  await useCookie(page, desk);

  await page.goto(`${BASE}/staff/desk/stats`, { waitUntil: "load", timeout: 300_000 });
  await waitText(page, "오늘 현황");
  const stats = await text(page);
  check("오늘 현황이 제안서의 확인 방법 네 가지로 나뉘어 있다", ["1. 자신에게 맞는 안내를 받는다", "2. 기기를 쓰기 어렵던 여객도 스스로 이용한다", "3. 직원의 업무 부담을 늘리지 않는다", "4. 예매 완료 화면에서 연결하고"].every((s) => stats.includes(s)));
  const summary = (await get("/api/desk/summary", desk)).body.summary;
  check("등록 경로가 휴대전화·키오스크·직원 대신 입력으로 나뉘어 세어진다", summary.byRoute.web >= 5 && summary.byRoute.kiosk >= 2 && summary.byRoute.assisted >= 1, JSON.stringify(summary.byRoute));
  check("안내 방식을 켠 여객과 켜지 않은 여객의 등록 완료 비율이 따로 나온다", summary.completion.adapted.started >= 2 && summary.completion.adapted.done >= 2 && summary.completion.plain.started >= 1, JSON.stringify(summary.completion));
  check("안내 화면을 연 횟수와 만족도 응답이 세어진다", summary.guideOpens >= 8 && summary.survey.good >= 1, `열람 ${summary.guideOpens}, 응답 ${summary.survey.total}`);
  check("「도움 요청하기」 횟수가 등록 중·안내 중으로 나뉘어 세어진다", summary.calls.total >= 3 && summary.calls.fromRegister >= 1 && summary.calls.fromGuide >= 2, JSON.stringify(summary.calls));
  check("현황에는 항공편이나 고른 항목이 없다 (건수와 시간뿐)", !JSON.stringify(summary).includes("MK") && !stats.includes("MK1"));
  check(
    "예매 링크 등록 완료율·증빙·모의 체크인 2건·우대출구 확인이 세어진다",
    summary.booking.done >= 1 && summary.proofDone >= 2 && summary.checkins === 2 && summary.exit.ok >= 1 && summary.exit.notOk >= 1 && summary.onsite >= 1,
    JSON.stringify({ booking: summary.booking, proofDone: summary.proofDone, checkins: summary.checkins, exit: summary.exit }),
  );
  const unifiedSummary=await get("/api/staff/requests?scope=all",desk);
  check("새 이동지원 접수는 통합 요청 현황에 취소 기록까지 남는다",(unifiedSummary.body.requests as {id:string;service:string;state:string}[]).some(r=>r.id===integrated.id&&r.service==="mobility"&&r.state==="cancelled"));
  await shot(page, "데스크-오늘현황");
  check("현장 직원은 오늘 현황을 받을 수 없다 (403)", (await get("/api/desk/summary", zoneStaff)).status === 403);
  await browser.close();

  writeReport();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n점검 ${results.length}개 가운데 통과 ${results.length - failed.length}개, 실패 ${failed.length}개`);
  for (const f of failed) console.log(`  실패: ${f.name}${f.note ? ` (${f.note})` : ""}`);
  console.log(`화면 그림 ${shotNo}장: ${SHOTS}`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  // 멈춘 순간의 화면을 남긴다. 무엇을 기다리다 멈췄는지 알 수 있다.
  try {
    if (lastPage) {
      await lastPage.screenshot({ path: path.join(SHOTS, "멈춘-화면.png") as `${string}.png` });
      console.log(`멈춘 화면의 주소: ${lastPage.url().replace(/\/p\/.*/i, "/p/…")}`);
      console.log(`멈춘 화면의 글: ${(await lastPage.evaluate(() => document.body?.innerText ?? "")).replace(/\s+/g, " ").slice(0, 400)}`);
    }
  } catch {
    // 화면을 남기지 못해도 결과는 적는다.
  }
  writeReport();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n중간에 멈춤. 그때까지 통과 ${results.length - failed.length}개, 실패 ${failed.length}개`);
  process.exit(1);
});
