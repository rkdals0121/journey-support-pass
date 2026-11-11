/**
 * 화면 배치 빠른 점검 (10분 안팎). 주요 화면을 여러 화면 크기 × 글자 크기로 열어
 * 「옆으로 넘침」「잘려서 닿을 수 없는 내용」「안 보이는 진행 버튼」「겹친 단추」를 찾는다.
 * 전체 점검(scripts/e2e.ts, 30~40분)과 달리 화면을 누르며 흐름을 따라가지는 않는다. 배치만 본다.
 *
 * 쓰는 법: 개발 서버를 띄운 뒤
 *   npx tsx scripts/layout-check.ts                 (http://localhost:3000)
 *   LAYOUT_BASE=http://localhost:3002 npx tsx scripts/layout-check.ts
 * 키오스크 화면은 db/seed-zones.json 의 공개 시연 코드로 설치해 본다. 로컬 DB에 구역이 없으면 건너뛴다.
 * 직원 화면도 같은 파일의 안내데스크 구역으로 들어가 본다(여객 화면을 직원 화면 안에 띄우는 곳 포함).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

const BASE = process.env.LAYOUT_BASE ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => fs.existsSync(p));

/** 화면 크기. 브라우저 안쪽 크기다(주소창·작업표시줄을 뺀 값). AGENTS.md 의 기준과 같다. */
const PHONE = { name: "휴대전화 390", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const SIZES = [
  PHONE,
  { name: "좁은 휴대전화 320", width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "태블릿 768", width: 768, height: 1024 },
  { name: "작은 노트북 1280×633", width: 1280, height: 633 },
  { name: "노트북 1366×657", width: 1366, height: 657 },
  { name: "큰 화면 1920×937", width: 1920, height: 937 },
];
// 실제 기기 해상도: 55인치 가로 키오스크 1920×1080, 19.5인치 장애인 키오스크 1024×768(4:3), 27인치 안내로봇 1080×1920.
// 키오스크는 글자 기준이 화면 크기에 따라 커지므로 노트북 크기에서 맞아도 실제 해상도에서 따로 본다.
const KIOSK_SIZES = [
  { name: "가로 키오스크 1920×1080", width: 1920, height: 1080, hasTouch: true },
  { name: "장애인 키오스크 1024×768", width: 1024, height: 768, hasTouch: true },
  { name: "가로 키오스크 1280×800", width: 1280, height: 800, hasTouch: true },
  { name: "세로 키오스크 1080×1920", width: 1080, height: 1920, hasTouch: true },
];
/** 글자 배율. 1.5 는 설정의 「아주 크게」다. 이 서비스는 큰 글자를 쓰는 사람이 주 이용자다. */
const SCALES = [1, 1.5];
const PAGES = ["/", "/prepare", "/register", "/services", "/help", "/navigate", "/visits", "/requests", "/stamp", "/staff/login"];
const KIOSK_PAGES = ["/kiosk/guide", "/kiosk/entry", "/kiosk/visits"];
/** 직원 화면. 도움 요청 대신 접수·지원정보 대신 등록은 여객·키오스크 화면을 왼쪽 메뉴 옆 본문 칸에 띄운다. */
const STAFF_PAGES = ["/staff", "/staff/requests", "/staff/requests/new", "/staff/desk", "/staff/desk/register", "/staff/overview"];

type Problem = { where: string; what: string };
const problems: Problem[] = [];
let checked = 0;

async function inspect(page: Page, where: string) {
  checked++;
  const found = (await page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    const scale = Number(getComputedStyle(doc).getPropertyValue("--scale")) || 1;
    // 닫힌 접기 칸(<details>) 안의 내용은 보이지 않지만 크기는 잡혀 있다. 제목(summary)만 본다.
    const folded = (e: Element) => {
      const d = e.closest("details:not([open])");
      return !!d && !d.querySelector(":scope > summary")?.contains(e);
    };
    if (document.querySelector(".ph-home") && innerWidth >= 1101 && innerHeight >= 633 && scale === 1
      && doc.scrollHeight > innerHeight + 1) {
      out.push(`첫 화면에 불필요한 세로 스크롤 ${doc.scrollHeight - innerHeight}px`);
    }
    // 키오스크·안내로봇 화면은 스크롤 없이 한 화면이어야 한다(AGENTS.md 「키오스크·안내로봇 화면」, docs/ui-guide.md 3절).
    // 글자 1배에서만 본다. 1.5배에서는 넘치면 페이지가 내려가도 된다.
    if (doc.hasAttribute("data-kiosk") && scale === 1 && doc.scrollHeight > innerHeight + 1) {
      out.push(`키오스크 화면에 세로 스크롤 ${doc.scrollHeight - innerHeight}px`);
    }
    // 찌그러진 단추: 칸이 좁아 글자가 한 글자씩 세로로 쌓인 단추(폭보다 높이가 훨씬 큼)
    const squeezed = [...document.querySelectorAll("button, a.btn, .listen-start")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return !folded(e) && r.width > 0 && r.width < 80 && r.height > r.width * 2 && (e.textContent || "").trim().length >= 4;
      })
      .slice(0, 2);
    if (squeezed.length) out.push(`찌그러진 단추 (${squeezed.map((e) => (e.textContent || "").trim().slice(0, 12)).join(", ")})`);
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const wide = [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1 && e.getBoundingClientRect().width > 0)
        .slice(0, 2)
        .map((e) => (e.className?.toString() || e.tagName).slice(0, 40));
      out.push(`옆으로 넘침 ${doc.scrollWidth - doc.clientWidth}px (${wide.join(", ")})`);
    }
    // 직원 화면: 본문이 왼쪽 메뉴를 덮으면 안 된다(여객 화면의 바·본문이 화면 전체 폭으로 잡히던 일)
    const side = document.querySelector(".workspace-side")?.getBoundingClientRect();
    if (side && side.width > 0 && side.height > 0) {
      const over = [...document.querySelectorAll(".workspace-content *")].find((e) => {
        const r = e.getBoundingClientRect();
        return !folded(e) && r.width > 0 && r.height > 0 && r.left < side.right - 1 && r.right > side.left + 1 && r.top < side.bottom && r.bottom > side.top;
      });
      if (over) out.push(`본문이 왼쪽 메뉴를 덮음 (${(over.className?.toString() || over.tagName).slice(0, 40)})`);
    }
    // 잘려서 닿을 수 없는 내용: 넘치는데 스크롤도 안 되는 칸
    for (const e of document.querySelectorAll("main, .flow-body, .flow-form-area, .flow-workspace, section")) {
      const s = getComputedStyle(e);
      const hidden = e.scrollHeight - e.clientHeight;
      if (hidden > 2 && (s.overflowY === "hidden" || s.overflowY === "clip") && e.clientHeight > 0) {
        out.push(`잘린 내용 ${hidden}px, 스크롤 불가 (${(e.className?.toString() || e.tagName).slice(0, 40)})`);
      }
    }
    // 진행 버튼(「다음」 줄)은 화면 안에 있거나 스크롤로 닿아야 한다
    const cta = document.querySelector(".flow-cta");
    if (cta) {
      const r = cta.getBoundingClientRect();
      const reach = doc.scrollHeight > window.innerHeight + 1 || r.bottom <= window.innerHeight + 1;
      if (!reach) out.push("「다음」 버튼 줄이 화면 밖이고 스크롤로도 닿지 않음");
    }
    // 「도움 요청하기」가 위쪽 바의 단추를 가리면 안 된다
    const call = document.querySelector(".call-btn")?.getBoundingClientRect();
    if (call) {
      for (const b of document.querySelectorAll(".flow-bar .bar-btn, .flow-bar a, .flow-bar button")) {
        if (b.classList.contains("call-btn")) continue;
        const r = b.getBoundingClientRect();
        const apart = r.right <= call.left + 1 || r.left >= call.right - 1 || r.bottom <= call.top + 1 || r.top >= call.bottom - 1;
        if (!apart && r.width > 0) {
          out.push(`「도움 요청하기」가 위쪽 바의 단추를 가림 (${(b.textContent || "").trim().slice(0, 12)})`);
          break;
        }
      }
    }
    // 누르는 것은 24px 이상(WCAG 2.2 최소). 보이지 않거나 글 안의 링크는 뺀다.
    const tiny = [...document.querySelectorAll("button, [role=button], input[type=checkbox], input[type=radio], select")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        // 라벨 안의 선택 칸은 라벨 전체가 누르는 곳이다. 라벨 크기로 본다.
        const box = (e.matches("input") && e.closest("label")?.getBoundingClientRect()) || r;
        return !folded(e) && r.width > 0 && r.height > 0 && (box.width < 24 || box.height < 24) && !e.closest(".sr-only");
      })
      .slice(0, 2);
    if (tiny.length) out.push(`너무 작은 누르는 곳 (${tiny.map((e) => (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 12)).join(", ")})`);
    return out;
  })) as string[];
  for (const what of found) problems.push({ where, what });
}

async function openAt(browser: Browser, size: (typeof SIZES)[number] | (typeof KIOSK_SIZES)[number], scale: number, url: string, cookie?: string) {
  const page = await browser.newPage();
  await page.setViewport(size);
  // tsx 가 이름 붙은 함수에 __name(...) 을 덧붙이는데, 브라우저 쪽에는 그 함수가 없다.
  await page.evaluateOnNewDocument("window.__name = (f) => f");
  if (cookie) {
    const [name, ...rest] = cookie.split("=");
    await page.setCookie({ name, value: rest.join("="), url: BASE, httpOnly: true });
  }
  // 글자 배율은 설정 화면과 같은 저장소(sessionStorage "jsp:view")에 넣는다.
  await page.evaluateOnNewDocument((s) => {
    try {
      sessionStorage.setItem("jsp:view", JSON.stringify({ scale: s, voice: null, picture: null }));
    } catch {
      /* 저장소를 못 쓰면 기본 배율로 본다 */
    }
  }, scale);
  await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 120_000 });
  // 나타나는 움직임이 끝나기를 잠깐 기다린다(끝없이 도는 움직임은 기다리지 않는다).
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}

async function staffCookie(): Promise<string | null> {
  const desk = readSeedZones().find((z) => z.isDesk);
  if (!desk) return null;
  const res = await fetch(`${BASE}/api/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: desk.code }),
  });
  if (!res.ok) return null;
  return res.headers.get("set-cookie")?.split(";")[0] ?? null;
}

/** 안내 키오스크 첫 화면에서 깨운 뒤 → 숫자판 → 여권 화면까지 차례로 열어 각각 본다. */
async function guideSteps(page: Page, where: string) {
  const click = async (selector: string) => {
    const ok = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return false;
      el.click();
      return true;
    }, selector);
    await new Promise((r) => setTimeout(r, 1000));
    return ok;
  };
  // 화면만 눌러 깨운다(나랑이를 누르면 깨어난다).
  if (await click(".haneuli-character")) await inspect(page, where + " · 깨운 뒤");
  if (await click(".haneuli-number")) await inspect(page, where + " · 예약번호 숫자판");
  await page.goto(page.url(), { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 1200));
  await click(".haneuli-character");
  if (await click(".haneuli-passport")) await inspect(page, where + " · 여권 화면");
}

async function kioskCookie(placeId: string): Promise<string | null> {
  const kiosk = readSeedZones().find((z) => z.isKiosk);
  if (!kiosk) return null;
  const res = await fetch(`${BASE}/api/kiosk/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: kiosk.code, placeId }),
  });
  if (!res.ok) return null;
  return res.headers.get("set-cookie")?.split(";")[0] ?? null;
}

(async () => {
  if (!CHROME) throw new Error("Chrome 이나 Edge 를 찾지 못했습니다. CHROME_PATH 로 알려 주세요.");
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("이 점검은 이 컴퓨터의 개발 서버에만 씁니다.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jsp-layout-"));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR"] });
  try {
    for (const url of PAGES)
      for (const size of SIZES)
        for (const scale of SCALES) {
          const page = await openAt(browser, size, scale, url);
          await inspect(page, `${url} · ${size.name} · 글자 ×${scale}`);
          await page.close();
        }
    const guide = await kioskCookie("cc-center");
    const entry = await kioskCookie("t1-info");
    if (!guide || !entry) console.log("키오스크 화면은 건너뜀 (로컬 DB에 구역이 없음. /api/admin/setup 으로 시연 구역을 넣으세요)");
    else
      for (const url of KIOSK_PAGES)
        for (const size of KIOSK_SIZES)
          for (const scale of SCALES) {
            const page = await openAt(browser, size, scale, url, url === "/kiosk/entry" ? entry : guide);
            await inspect(page, `${url} · ${size.name} · 글자 ×${scale}`);
            if (url === "/kiosk/guide" && scale === 1) await guideSteps(page, `${url} · ${size.name} · 글자 ×${scale}`);
            await page.close();
          }
    const staff = await staffCookie();
    if (!staff) console.log("직원 화면은 건너뜀 (로컬 DB에 안내데스크 구역이 없음)");
    else
      for (const url of STAFF_PAGES)
        for (const size of SIZES)
          for (const scale of SCALES) {
            const page = await openAt(browser, size, scale, url, staff);
            await inspect(page, `${url} · ${size.name} · 글자 ×${scale}`);
            await page.close();
          }
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
  console.log(`\n화면 ${checked}개를 봤습니다. 문제 ${problems.length}개.`);
  for (const p of problems) console.log(`  ✗ ${p.where}: ${p.what}`);
  process.exit(problems.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
