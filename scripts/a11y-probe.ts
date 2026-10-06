/**
 * 접근성 자동 점검(axe-core)을 화면마다 돌려 위반을 적는다. 이 컴퓨터의 개발 서버에만 쓴다.
 * 자료를 바꾸지 않는 화면만 연다. 여객 카드처럼 열면 기록이 남는 화면은 scripts/e2e.ts 가 맡는다.
 *
 *   npx tsx scripts/a11y-probe.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

const BASE = "http://localhost:3000";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(
  (p) => fs.existsSync(p),
);
const AXE = fs.readFileSync(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf-8");

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

async function audit(page: Page, name: string): Promise<number> {
  await page.evaluate(AXE);
  const violations = (await page.evaluate(
    "axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }).then(r => r.violations)",
  )) as Violation[];
  console.log(`\n[${name}] 위반 ${violations.length}종`);
  for (const v of violations) {
    console.log(`  ${v.impact} ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) {
      console.log(`    ${n.target.join(" ")}  ${(n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim().slice(0, 140)}`);
    }
  }
  return violations.length;
}

(async () => {
  const seed = readSeedZones();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "jsp-a11y-")),
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
  page.setDefaultTimeout(120_000);
  const go = (p: string) => page.goto(`${BASE}${p}`, { waitUntil: "networkidle2", timeout: 120_000 });
  const login = async (code: string) => {
    await go("/staff/login");
    await page.waitForFunction(() => {
      const el = document.querySelector("#code");
      return el !== null && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    });
    await page.type("#code", code);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !location.pathname.includes("/login"));
    await new Promise((r) => setTimeout(r, 3000));
  };

  let total = 0;
  await go("/");
  total += await audit(page, "첫 화면");
  await go("/?lang=en");
  total += await audit(page, "첫 화면 (영어)");
  await go("/register");
  total += await audit(page, "등록 1단계");
  await go("/staff/login");
  total += await audit(page, "직원 로그인");
  await go(`/p/${"x".repeat(24)}`);
  total += await audit(page, "패스 QR (로그인 전)");

  await login(seed.find((z) => z.isCommon)!.code);
  total += await audit(page, "근무 구역 고르기");
  await login(seed.find((z) => z.id === "cc-end")!.code);
  total += await audit(page, "여객 목록");
  await go("/staff/scan");
  total += await audit(page, "패스 스캔");

  await login(seed.find((z) => z.isDesk)!.code);
  await go("/staff/desk");
  await new Promise((r) => setTimeout(r, 2500));
  total += await audit(page, "안내데스크");
  await go("/staff/desk/stats");
  total += await audit(page, "오늘 현황");
  await go("/staff/desk/passes");
  total += await audit(page, "미사용 패스");

  await browser.close();
  console.log(`\n위반 합계 ${total}종`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
