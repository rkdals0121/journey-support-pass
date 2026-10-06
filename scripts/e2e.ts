/**
 * 화면을 실제 브라우저로 처음부터 끝까지 눌러 보는 점검. 이 컴퓨터의 개발 서버에만 쓴다.
 *
 * 준비 (순서대로):
 *   1) 개발 서버를 끄고  npm run seed -- --mock-flights
 *   2) 개발 서버를 켜고  npx tsx scripts/demo-passengers.ts
 *   3)                   npx tsx scripts/e2e.ts
 *
 * 화면 그림은 SHOTS_DIR(기본 .e2e-shots)에 번호 순으로 저장한다.
 * 카메라 QR 스캔은 패스 QR 그림을 가짜 카메라 영상으로 넣어 확인한다.
 * 설치된 Chrome 을 새 프로필로 띄우므로 평소 쓰는 브라우저에는 영향이 없다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const SHOTS = path.resolve(process.env.SHOTS_DIR ?? ".e2e-shots");
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(
    (p) => fs.existsSync(p),
  );
const WAIT = 90_000;
const AXE = fs.readFileSync(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf-8");

const seed = readSeedZones();
const DESK_CODE = seed.find((z) => z.isDesk)!.code;
const COMMON_CODE = seed.find((z) => z.isCommon)!.code;
const ZONE_CODE = seed.find((z) => z.id === "t2-wam")!.code;

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
  await page.evaluate(AXE);
  const found = (await page.evaluate(
    "axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }).then(r => r.violations.map(v => v.id + ' ' + v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')))",
  )) as string[];
  check(`접근성 자동 점검: ${name}`, found.length === 0, found.join(" / ").slice(0, 300) || undefined);
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
  await page.waitForFunction(
    (sel, t) => [...document.querySelectorAll(sel)].some((e) => (e as HTMLElement).innerText?.includes(t)),
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
  await page.click(selector, { count: 3 });
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value, { delay: 15 });
}

async function isDisabled(page: Page, s: string) {
  return page.evaluate(
    (t) => ([...document.querySelectorAll("button")].find((b) => b.innerText.includes(t)) as HTMLButtonElement)?.disabled,
    s,
  );
}

async function open(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(WAIT);
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => check("화면 오류 없음", false, String(e).slice(0, 120)));
  return page;
}

async function login(page: Page, code: string) {
  await page.goto(`${BASE}/staff/login`, { waitUntil: "load", timeout: 120_000 });
  await fill(page, "#code", code);
  await page.keyboard.press("Enter");
}

async function launch(extra: string[] = []) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "jsp-e2e-")),
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
    "- 대상: 개발 컴퓨터의 서버와 모의 운항. 배포 주소에서 로그인한 뒤의 화면은 사람이 따로 확인한다.",
    "- 카메라 QR 스캔은 패스 QR 그림을 가짜 카메라 영상으로 넣어 확인한다. 실물 패스와 실제 조명은 다루지 않는다.",
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

(async () => {
  if (!CHROME) throw new Error("Chrome 이나 Edge 를 찾지 못했습니다. CHROME_PATH 로 알려 주세요.");
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("이 점검은 이 컴퓨터의 개발 서버에만 씁니다.");
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.endsWith(".png")) fs.unlinkSync(path.join(SHOTS, f));

  let browser = await launch();
  let page = await open(browser);

  // ───────── 1. 여객: 첫 화면과 등록 ─────────
  section("여객 등록");
  await page.goto(BASE, { waitUntil: "load", timeout: 120_000 });
  check("첫 화면이 열린다", await has(page, "한 번만 알려 주세요"));
  await shot(page, "여객-첫화면");
  await clickText(page, "a", "지원 등록하기");
  await waitText(page, "등록 전에 확인해 주세요");
  check("등록 1단계: 동의 안내 네 가지가 보인다", (await has(page, "무엇을 받나요")) && (await has(page, "무엇이 남나요")));
  await shot(page, "여객-동의");

  await clickText(page, "button", "동의하지 않습니다");
  await waitText(page, "등록하지 않았습니다");
  check("동의하지 않으면 등록 없이 안내만 보여준다", await has(page, "기존 안내와 지원은 그대로"));
  await clickText(page, "button", "다시 살펴보기");
  await clickText(page, "button", "동의하고 시작하기");

  await waitText(page, "해당하는 것을 모두 골라 주세요");
  check("등록 2단계: 고르기 전에는 다음으로 갈 수 없다", (await isDisabled(page, "다음")) === true);
  await clickText(page, "button", "고령자입니다");
  await clickText(page, "button", "장애가 있습니다");
  await shot(page, "여객-구분");
  await clickText(page, "button", "다음");

  await waitText(page, "필요한 도움을 골라 주세요");
  check("등록 3단계: 고르지 않아도 넘어갈 수 있다", await has(page, "해당 없음, 다음"));
  // 빠르게 연달아 눌러도 하나도 빠지지 않아야 한다.
  // (화면 안에서 도는 코드에는 이름 붙은 함수를 두지 않는다. tsx 가 붙이는 도우미가 화면에는 없다.)
  await page.evaluate(() => {
    for (const t of ["휠체어를 이용합니다", "소리로 하는 안내를 듣기 어렵습니다", "글이나 그림으로 안내해 주세요", "동반자가 있습니다"]) {
      ([...document.querySelectorAll("button")].find((b) => b.innerText.includes(t)) as HTMLElement).click();
    }
  });
  const picked = await page.evaluate(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length);
  check("빠르게 연달아 네 개를 눌러도 네 개가 모두 선택된다", picked === 4, `${picked}개`);
  await shot(page, "여객-필요한도움");
  await clickText(page, "button", "다음");

  await waitText(page, "이름과 항공편을 알려 주세요");
  await fill(page, "#reg-name", "점검여객");
  await fill(page, "#reg-flight", "zz99");
  await waitText(page, "찾지 못했습니다");
  check("없는 편명은 찾지 못했다고 알려 준다", true);
  await fill(page, "#reg-flight", "mk1");
  await page.waitForFunction(() => document.querySelectorAll(".flight-opt").length >= 2, { timeout: WAIT });
  const optCount = await page.evaluate(() => document.querySelectorAll(".flight-opt").length);
  check("편명을 치는 동안 후보가 자동으로 뜬다 (찾기 버튼 없음)", optCount >= 2, `mk1 → ${optCount}편`);
  check("후보에는 탑승구가 보이지 않는다", !(await has(page, "탑승구")));
  await shot(page, "여객-편명검색");
  check("항공편을 고르기 전에는 다음으로 갈 수 없다", (await isDisabled(page, "다음")) === true);
  await clickText(page, ".flight-opt", "MK102");
  await waitText(page, "항공편을 골랐습니다");
  await clickText(page, "button", "다음");

  await waitText(page, "이대로 등록할까요?");
  const review = await text(page);
  check(
    "확인 화면에 이름·항공편·구분·도움이 모두 나온다",
    ["점검여객", "MK102", "고령자입니다", "휠체어를 이용합니다", "동반자가 있습니다"].every((s) => review.includes(s)),
  );
  await shot(page, "여객-확인");
  await page.evaluate(() => ([...document.querySelectorAll(".review-edit")][2] as HTMLElement).click());
  await waitText(page, "필요한 도움을 골라 주세요");
  check("확인 화면에서 고치기를 누르면 그 단계로 돌아간다", true);
  const kept = await page.evaluate(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length);
  check("돌아가도 고른 것이 그대로 남아 있다", kept === 4, `${kept}개`);
  await clickText(page, "button", "다음");
  await waitText(page, "이름과 항공편을 알려 주세요");
  check("돌아가도 이름과 항공편이 남아 있다", (await page.$eval("#reg-name", (e) => (e as HTMLInputElement).value)) === "점검여객");
  await clickText(page, "button", "다음");
  await waitText(page, "이대로 등록할까요?");
  await clickText(page, "button", "등록하기");

  await waitText(page, "안내데스크에서 이 화면을 보여 주세요");
  const receiptNo = await page.$eval(".ticket-no", (e) => (e as HTMLElement).innerText.trim());
  check("등록을 마치면 접수 번호 네 자리가 나온다", /^\d{4}$/.test(receiptNo), receiptNo);
  check("접수 번호는 주소에 들어 있지 않다", !page.url().includes(receiptNo));
  check("완료 화면에 이름과 편명이 함께 나온다", (await has(page, "점검여객")) && (await has(page, "MK102")));
  await shot(page, "여객-접수번호");
  await page.reload({ waitUntil: "load", timeout: 120_000 });
  await waitText(page, receiptNo);
  check("완료 화면을 새로 고쳐도 접수 번호가 남아 있다", true);

  // 영어로 등록
  await page.goto(BASE, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, "a", "English");
  await waitText(page, "Tell us once.");
  check("첫 화면을 영어로 바꿀 수 있다", await has(page, "Register for assistance"));
  await shot(page, "여객-영어-첫화면");
  await clickText(page, "a", "Register for assistance");
  await waitText(page, "Before you register");
  await clickText(page, "button", "Agree and start");
  await clickText(page, "button", "I am pregnant");
  await clickText(page, "button", "Next");
  await waitText(page, "What help do you need?");
  await clickText(page, "button", "I cannot stand for long");
  await clickText(page, "button", "Please explain slowly");
  await shot(page, "여객-영어-필요한도움");
  await clickText(page, "button", "Next");
  await fill(page, "#reg-name", "ENGLISH GUEST");
  await fill(page, "#reg-flight", "MK221");
  await clickText(page, ".flight-opt", "MK221");
  await clickText(page, "button", "Next");
  await waitText(page, "Is this correct?");
  check("영어 화면은 도착지를 공항 코드로 보여준다", (await has(page, "JFK")) && !(await has(page, "뉴욕")));
  check("영어 확인 화면에 고른 항목이 영어로 나온다", (await has(page, "I am pregnant")) && (await has(page, "Please explain slowly")));
  await clickText(page, "button", "Register");
  await waitText(page, "Show this screen at an information desk");
  const enReceipt = await page.$eval(".ticket-no", (e) => (e as HTMLElement).innerText.trim());
  check("영어로 등록해도 접수 번호가 나온다", /^\d{4}$/.test(enReceipt), enReceipt);
  await shot(page, "여객-영어-접수번호");

  // ───────── 2. 로그인하지 않은 사람 ─────────
  section("로그인 전");
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  check("직원 화면은 로그인 없이 열리지 않는다", page.url().includes("/staff/login"));
  await shot(page, "직원-로그인");
  await page.goto(`${BASE}/p/${"x".repeat(24)}`, { waitUntil: "load", timeout: 120_000 });
  check("패스 QR 주소는 로그인 전에는 직원 전용 안내만 보여준다", await has(page, "공항 직원 전용 QR입니다"));
  await shot(page, "패스QR-로그인전");
  for (const p of ["/api/staff/list", "/api/staff/zone"]) {
    const status = await page.evaluate((u) => fetch(u).then((r) => r.status), p);
    check(`${p} 는 로그인 없이 401`, status === 401, String(status));
  }
  const deskStatus = await page.evaluate(() => fetch("/api/desk/list", { method: "POST" }).then((r) => r.status));
  check("/api/desk/list 는 로그인 없이 401", deskStatus === 401, String(deskStatus));
  const cronStatus = await page.evaluate(() => fetch("/api/cron/purge").then((r) => r.status));
  check("예약 실행 경로는 비밀값 없이 401", cronStatus === 401, String(cronStatus));
  const headers = await page.evaluate(() =>
    fetch("/").then((r) => [r.headers.get("x-frame-options"), r.headers.get("referrer-policy")].join("|")),
  );
  check("보안 헤더가 붙는다", headers === "DENY|no-referrer", headers);

  await login(page, "999999");
  await waitText(page, "접속 코드가 맞지 않습니다");
  check("틀린 접속 코드는 받지 않는다", true);

  // 접속 코드 잠금. 다른 기기인 것처럼 브라우저 표시를 바꾼 창에서 해 본다(이 창의 로그인은 막히지 않아야 한다).
  const lockPage = await open(browser);
  await lockPage.setUserAgent("jsp-e2e-lock-test");
  await lockPage.goto(`${BASE}/staff/login`, { waitUntil: "load", timeout: 120_000 });
  const tries: number[] = [];
  for (let i = 0; i < 6; i++) {
    tries.push(
      await lockPage.evaluate(
        (code) =>
          fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.status),
        `00000${i}`,
      ),
    );
  }
  check("접속 코드를 5회 틀리면 그 기기는 잠긴다", tries.join(",") === "401,401,401,401,401,429", tries.join(","));
  const lockedRight = await lockPage.evaluate(
    (code) =>
      fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.status),
    COMMON_CODE,
  );
  check("잠긴 동안에는 맞는 코드도 받지 않는다", lockedRight === 429, String(lockedRight));
  await lockPage.close();

  const cronOk = await fetch(`${BASE}/api/cron/purge`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "dev-only-secret-change-me"}` },
  });
  check("예약 실행 경로는 비밀값이 맞으면 돈다 (출발 후 삭제)", cronOk.status === 200, String(cronOk.status));

  // ───────── 3. 현장 직원: 공통 코드 → 구역 고르기 → 목록 ─────────
  section("현장 직원");
  await login(page, COMMON_CODE);
  await waitText(page, "오늘 근무하는 구역을 골라 주세요");
  check("공통 직원 코드로 들어오면 근무 구역을 고르는 화면이 나온다", page.url().includes("/staff/zone"));
  await page.waitForSelector(".zone-opt", { timeout: WAIT });
  await shot(page, "직원-구역고르기");
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  check("구역을 고르기 전에는 여객 목록이 열리지 않는다", page.url().includes("/staff/zone"));
  const before = await page.evaluate(() => fetch("/api/staff/list?scope=all").then((r) => r.status));
  check("구역을 고르기 전에는 목록 자료도 받지 못한다 (409)", before === 409, String(before));
  await clickText(page, ".zone-opt", "끝단");
  await waitText(page, "내 근무 구역");
  await waitText(page, "김영희");
  check("구역을 고르면 그 구역의 여객 목록이 나온다", await has(page, "탑승동 끝단"));
  const list1 = await text(page);
  check("내 구역 목록에는 다른 구역 여객이 없다", !list1.includes("정하준") && !list1.includes("강도쿄"));
  check("마감이 가까운 여객이 위에 온다", list1.indexOf("이정자") < list1.indexOf("박민수"));
  check("탑승구 미정 여객은 따로 묶인다", list1.includes("탑승구 미정") && list1.includes("오대기"));
  check("공동운항 여객은 실제 운항 편의 탑승구로 보인다", list1.includes("윤공동") && /104[\s\S]*윤공동/.test(list1));
  check("운항 정보 기준 시각이 보인다", /운항 정보 \d\d:\d\d 기준/.test(list1));
  check("소통 방식이 줄인 말로 보인다", list1.includes("듣기 어려움") && list1.includes("천천히 설명"));
  await shot(page, "직원-내구역목록");

  // 통신이 끊기면 오래된 목록을 지우고 구두 확인을 안내한다.
  await page.setOfflineMode(true);
  await clickText(page, "button[aria-label='목록 새로 고침']", "");
  await waitText(page, "연결할 수 없습니다");
  check("통신이 끊기면 목록을 지우고 구두로 확인하라고 안내한다", !(await has(page, "김영희")));
  await shot(page, "직원-통신끊김");
  await page.setOfflineMode(false);
  await clickText(page, "button", "다시 시도");
  await waitText(page, "김영희");
  check("다시 연결되면 목록이 돌아온다", true);

  await clickText(page, ".seg button", "전체");
  await waitText(page, "다른 구역");
  await waitText(page, "정하준");
  check("전체를 누르면 다른 구역 여객도 구역 이름과 함께 보인다", await has(page, "제2여객터미널 서편 AM"));
  await shot(page, "직원-전체목록");

  await fill(page, 'input[type="search"]', "mk22");
  await waitText(page, "전체 구역에서 찾은 여객 1명");
  check("편명으로 찾는다 (소문자, 일부만 쳐도)", (await has(page, "정하준")) && !(await has(page, "김영희")));
  await fill(page, 'input[type="search"]', "한미");
  await waitText(page, "한미숙");
  check("이름으로 찾는다", !(await has(page, "정하준")));
  await shot(page, "직원-검색");
  await fill(page, 'input[type="search"]', "없는사람");
  await waitText(page, "찾는 여객이 없습니다");
  check("찾는 여객이 없으면 알려 준다", true);
  await clickText(page, "button[aria-label='검색어 지우기']", "");
  await waitText(page, "김영희");

  await clickText(page, "a", "구역 바꾸기");
  await waitText(page, "어느 구역으로 옮기나요?");
  await clickText(page, ".zone-opt", "중앙부");
  await waitText(page, "탑승동 중앙부");
  await waitText(page, "최서연");
  check("근무 중에 구역을 바꿀 수 있다", !(await has(page, "김영희")));

  await page.goto(`${BASE}/staff/desk`, { waitUntil: "load", timeout: 120_000 });
  check("현장 직원은 안내데스크 화면을 쓸 수 없다", await has(page, "안내데스크에서만 쓸 수 있습니다"));
  const forbidden = await page.evaluate(() => fetch("/api/desk/list", { method: "POST" }).then((r) => r.status));
  check("현장 직원의 안내데스크 요청은 403", forbidden === 403, String(forbidden));
  check("현장 직원 메뉴에는 안내데스크가 없다", !(await page.$eval(".staff-nav", (e) => (e as HTMLElement).innerText)).includes("안내데스크"));

  // 패스 번호로 여객 카드 열기
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "load", timeout: 120_000 });
  await waitText(page, "카메라를 쓸 수 없습니다");
  check("카메라가 없으면 패스 번호를 입력하라고 안내한다", await has(page, "패스 번호 네 자리"));
  await shot(page, "직원-스캔-카메라없음");
  await fill(page, "#pass-no", "0000");
  await clickText(page, "button", "여객 카드 열기");
  await waitText(page, "패스 번호를 찾을 수 없습니다");
  check("없는 패스 번호는 찾을 수 없다고 알려 준다", true);

  // 여객 카드
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, "a", "구역 바꾸기");
  await clickText(page, ".zone-opt", "끝단");
  await waitText(page, "박민수");
  await clickText(page, ".case-row", "박민수");
  await waitText(page, "소통 방식");
  await waitText(page, "응대 시작");
  const card = await text(page);
  check("여객 카드 맨 위에 소통 방식이 온다", card.indexOf("소통 방식") < card.indexOf("박민수") && card.includes("소리로 하는 안내를 듣기 어렵습니다"));
  check(
    "여객 카드에 구분·도움·동반·항공편·탑승구가 모두 나온다",
    ["장애가 있습니다", "휠체어를 이용합니다", "동반자가 있습니다", "MK102", "방콕", "130", "탑승 마감까지"].every((s) => card.includes(s)),
  );
  check("여객 카드에 운항 정보 기준 시각이 나온다", /운항 정보 \d\d:\d\d 기준/.test(card));
  await shot(page, "직원-여객카드");
  await clickText(page, "button", "응대 시작");
  await waitText(page, "응대 완료");
  check("응대 시작을 누르면 응대 완료 버튼으로 바뀐다", true);
  await page.reload({ waitUntil: "load", timeout: 120_000 });
  await waitText(page, "응대 완료");
  check("카드를 다시 열어도 응대 중 상태가 이어진다", !(await has(page, "응대 시작")));
  await clickText(page, "button", "응대 완료");
  await waitText(page, "응대를 기록했습니다");
  check("응대 완료를 기록한다", true);
  await shot(page, "직원-응대완료");

  // 지연·탑승구 미정·탑승 중 카드
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, ".seg button", "전체");
  await clickText(page, ".case-row", "한미숙");
  await waitText(page, "소통 방식");
  await waitText(page, "응대 시작");
  check("지연 편은 바뀐 출발 시각과 지연 표시가 나온다", (await page.$$("s")).length === 1 && (await has(page, "지연")));
  await shot(page, "직원-여객카드-지연");
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, ".case-row", "이정자");
  await waitText(page, "글자나 표지를 보기 어렵습니다");
  check("탑승 중인 편은 상태가 함께 나온다", await has(page, "탑승중"));
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, ".case-row", "오대기");
  await waitText(page, "탑승구가 정해지면 표시됩니다");
  check("탑승구 미정 카드는 미정이라고 보여준다", await has(page, "미정"));
  // 여객 카드를 열어 둔 채 두면 2분 뒤 목록으로 돌아간다.
  const openedAt = Date.now();
  await page.waitForFunction(() => location.pathname === "/staff", { timeout: 170_000 });
  const closedAfter = Math.round((Date.now() - openedAt) / 1000);
  check("여객 카드는 조작 없이 2분쯤 지나면 닫히고 목록으로 돌아간다", closedAfter >= 60 && closedAfter <= 150, `${closedAfter}초`);
  const bad = await page.evaluate(() => fetch("/api/staff/case/00000000-0000-4000-8000-000000000000").then((r) => r.status));
  check("없는 등록의 카드는 열리지 않는다 (404)", bad === 404, String(bad));

  // 구역 코드로 들어온 직원 (예전 방식도 그대로 쓸 수 있다)
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, "button[aria-label='로그아웃']", "");
  await page.waitForFunction(() => location.pathname === "/staff/login", { timeout: WAIT });
  check("로그아웃하면 로그인 화면으로 간다", true);
  const afterLogout = await page.evaluate(() => fetch("/api/staff/list").then((r) => r.status));
  check("로그아웃한 뒤에는 목록 자료를 받지 못한다", afterLogout === 401, String(afterLogout));
  await login(page, ZONE_CODE);
  await waitText(page, "제2여객터미널 서편 AM");
  await waitText(page, "정하준");
  check("구역 코드로 로그인하면 그 구역 목록으로 바로 간다", !(await has(page, "구역 바꾸기")));

  // ───────── 4. 안내데스크 ─────────
  section("안내데스크");
  await login(page, DESK_CODE);
  await waitText(page, "안내데스크");
  await waitText(page, "김영희");
  check("안내데스크는 모든 구역의 여객을 본다", (await has(page, "정하준")) && (await has(page, "강도쿄")));
  check("안내데스크 메뉴에는 안내데스크가 있다", (await page.$eval(".staff-nav", (e) => (e as HTMLElement).innerText)).includes("안내데스크"));
  await clickText(page, ".staff-nav a", "안내데스크");
  await waitText(page, "패스를 기다리는 등록");
  await waitText(page, "점검여객");
  const deskText = await text(page);
  check("여객이 방금 등록한 건이 접수 번호와 함께 목록에 보인다", deskText.includes(receiptNo) && deskText.includes("서연결"));
  check("미사용 패스 장수가 보인다", /미사용 패스\s*\d+\s*장/.test(deskText));
  await shot(page, "데스크-패스연결");

  // 영어로 등록한 여객도 직원에게는 한국어로 보인다.
  await clickText(page, ".reg-row", "ENGLISH GUEST");
  await waitText(page, "이 여객에게 줄 패스를 스캔하세요");
  const enGuest = await text(page);
  check(
    "영어로 등록한 여객의 내용이 직원에게는 한국어로 보인다",
    enGuest.includes("임신 중입니다") && enGuest.includes("오래 서 있기 어렵습니다") && enGuest.includes("천천히 설명해 주세요"),
  );
  await clickText(page, "button[aria-label='뒤로']", "");
  await waitText(page, "패스를 기다리는 등록");

  await fill(page, "#receipt", "0000");
  await clickText(page, "button", "찾기");
  await waitText(page, "접수 번호를 찾을 수 없습니다");
  check("없는 접수 번호는 찾을 수 없다고 알려 준다", true);
  await fill(page, "#receipt", receiptNo);
  await clickText(page, "button", "찾기");
  await waitText(page, "이 여객에게 줄 패스를 스캔하세요");
  check("접수 번호로 찾으면 등록 내용을 대조할 수 있다", (await has(page, "점검여객")) && (await has(page, "휠체어를 이용합니다")));
  await shot(page, "데스크-패스연결-여객확인");
  await clickText(page, "button", "자동 배정");
  await waitText(page, "님께 이 번호의 패스를 드리세요");
  const autoPass = await page.$eval(".pass-big b", (e) => (e as HTMLElement).innerText.trim());
  check("자동 배정: 패스 번호를 크게 보여준다", /^\d{4}$/.test(autoPass), autoPass);
  await shot(page, "데스크-연결완료");
  await clickText(page, "button", "다음 여객");
  await waitText(page, "패스를 기다리는 등록");
  await waitGone(page, "점검여객");
  check("연결한 등록은 기다리는 목록에서 빠진다", true);

  // 미사용 패스 화면에서 번호 하나를 가져와 손으로 연결
  await page.goto(`${BASE}/staff/desk/passes`, { waitUntil: "load", timeout: 120_000 });
  await waitText(page, "미사용 패스");
  const idleBefore = await page.evaluate(() => document.querySelectorAll(".sheet-pass").length);
  const manualPass = await page.$eval(".sheet-pass .sheet-no", (e) => (e as HTMLElement).innerText.trim());
  const scanPass = await page.evaluate(() => (document.querySelectorAll(".sheet-pass .sheet-no")[1] as HTMLElement).innerText.trim());
  check("미사용 패스 화면: 패스마다 QR 과 번호만 있다", (await page.$$(".sheet-pass svg")).length === idleBefore && idleBefore > 0, `${idleBefore}장`);
  await shot(page, "데스크-미사용패스");
  // 가짜 카메라에 넣을 QR 그림을 떠 둔다 (두 번째 패스).
  const qrEl = (await page.$$(".sheet-pass"))[1];
  const qrJpeg = path.join(os.tmpdir(), `jsp-qr-${Date.now()}.mjpeg`);
  await qrEl.evaluate((e) => e.scrollIntoView({ block: "center" }));
  fs.writeFileSync(qrJpeg, await qrEl.screenshot({ type: "jpeg", quality: 92 }));
  // 같은 패스를 멀리서 비춘 장면도 만든다. 1920x1080 화면 한가운데에 QR 이 170화소(25cm 거리에서 2.5cm QR 이 보이는 크기)로 놓인다.
  const farJpeg = path.join(os.tmpdir(), `jsp-qr-far-${Date.now()}.mjpeg`);
  const qrSvg = await page.evaluate(() => new XMLSerializer().serializeToString(document.querySelectorAll(".sheet-pass svg")[1]));
  const farPage = await browser.newPage();
  await farPage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await farPage.setContent(
    `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#8d9a93">
       <div style="padding:14px 14px 40px;border-radius:10px;background:#fff"><div style="width:170px;height:170px">${qrSvg.replace("<svg", '<svg width="170" height="170"')}</div></div>
     </body>`,
  );
  fs.writeFileSync(farJpeg, await farPage.screenshot({ type: "jpeg", quality: 88 }));
  await farPage.close();
  // 인쇄 모양: A4 한 장에 실제 패스 크기(QR 25mm)로 나오는지 PDF 로 떠서 본다.
  const pdf = path.join(SHOTS, "패스-인쇄.pdf");
  await page.pdf({ path: pdf, format: "A4", margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
  await page.emulateMediaType("print");
  const printed = await page.evaluate(() => {
    const svg = document.querySelector(".sheet-pass svg")!.getBoundingClientRect();
    const hidden = [".staff-nav", ".mock-banner", ".no-print"].every(
      (sel) => getComputedStyle(document.querySelector(sel)!).display === "none",
    );
    return { mm: (svg.width / 96) * 25.4, hidden };
  });
  await page.emulateMediaType("screen");
  check("인쇄할 때 QR 은 25mm 크기로 나온다", Math.abs(printed.mm - 25) < 0.6, `${printed.mm.toFixed(1)}mm`);
  check("인쇄할 때 메뉴·버튼·시범 띠는 찍히지 않는다", printed.hidden && fs.statSync(pdf).size > 5000);
  // 휴대전화 기본 카메라로 찍으면 QR 에 담긴 주소(/p/토큰)가 열린다. 세 번째 패스의 QR 을 읽어 그 주소를 얻는다.
  const linkPassNo = await page.evaluate(() => (document.querySelectorAll(".sheet-pass .sheet-no")[2] as HTMLElement).innerText.trim());
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "jsqr", "dist", "jsQR.js") });
  const qrUrl = await page.evaluate(async () => {
    const svg = document.querySelectorAll(".sheet-pass svg")[2];
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
  });
  check("패스 QR 에는 /p/토큰 주소만 들어 있다 (이름·번호 없음)", /^http:\/\/localhost:3000\/p\/[A-Za-z0-9_-]{24}$/.test(qrUrl), qrUrl.replace(/\/p\/.*/, "/p/…"));

  await clickText(page, "button", "더 만들기");
  await waitText(page, "새로 만들었습니다");
  await page.waitForFunction((n) => document.querySelectorAll(".sheet-pass").length === n + 10, { timeout: WAIT }, idleBefore);
  check("패스 10장 더 만들기", true);

  // 안내데스크가 미사용 패스를 기본 카메라로 찍은 경우: 연결 화면으로 가고, 등록을 고르면 그 패스로 바로 연결된다.
  await page.goto(qrUrl, { waitUntil: "load", timeout: 120_000 });
  await waitText(page, "방금 찍은 패스는 아직 연결되지 않았습니다");
  check("기본 카메라로 미사용 패스를 찍으면 안내데스크 연결 화면으로 간다", page.url().includes("/staff/desk?token="));
  await clickText(page, ".reg-row", "ENGLISH GUEST");
  await clickText(page, "button", "방금 찍은 패스로 연결");
  await waitText(page, "님께 이 번호의 패스를 드리세요");
  check("방금 찍은 패스로 연결된다", (await page.$eval(".pass-big b", (e) => (e as HTMLElement).innerText.trim())) === linkPassNo, linkPassNo);
  // 이제 같은 QR 을 기본 카메라로 찍으면 여객 카드가 열린다.
  await page.goto(qrUrl, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(() => location.pathname.startsWith("/staff/case/"), { timeout: WAIT });
  await waitText(page, "ENGLISH GUEST");
  check("기본 카메라로 연결된 패스를 찍으면 여객 카드가 열린다", await has(page, "임신 중입니다"));

  await page.goto(`${BASE}/staff/desk`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, ".reg-row", "서연결");
  await waitText(page, "이 여객에게 줄 패스를 스캔하세요");
  await fill(page, "#pass-no", "0000");
  await clickText(page, "button", "연결");
  await page.waitForFunction(() => document.querySelector(".error") !== null, { timeout: WAIT });
  check("미사용이 아닌 패스 번호로는 연결되지 않는다", await has(page, "쓸 수 있는 패스 번호가 아닙니다"));
  await fill(page, "#pass-no", manualPass);
  await clickText(page, "button", "연결");
  await waitText(page, "님께 이 번호의 패스를 드리세요");
  check("패스 번호를 손으로 넣어 연결한다", (await page.$eval(".pass-big b", (e) => (e as HTMLElement).innerText.trim())) === manualPass);
  await clickText(page, "button", "다음 여객");

  // 대신 등록 → 취소
  await clickText(page, ".seg button", "대신 등록");
  await waitText(page, "여객에게 물어보며 입력");
  await shot(page, "데스크-대신등록");
  await clickText(page, "button", "종이 체크리스트 옮겨 적기");
  await waitText(page, "여객께 동의를 받아 주세요");
  check("대신 등록도 동의부터 받는다", true);
  await clickText(page, "button", "동의하고 시작하기");
  await clickText(page, "button", "임신 중입니다");
  await clickText(page, "button", "다음");
  await clickText(page, "button", "해당 없음, 다음");
  await fill(page, "#reg-name", "종이여객");
  await fill(page, "#reg-flight", "MK221");
  await clickText(page, ".flight-opt", "MK221");
  await clickText(page, "button", "다음");
  await waitText(page, "여객과 함께 확인해 주세요");
  await clickText(page, "button", "등록하기");
  await waitText(page, "이 여객에게 줄 패스를 스캔하세요");
  check("대신 등록을 마치면 접수 번호 없이 바로 패스 연결로 넘어간다", await has(page, "종이여객"));

  // 등록 내용 고치기
  await clickText(page, "button", "등록 내용 고치기");
  await waitText(page, "해당하는 것을 모두 골라 주세요");
  check("고치기: 동의를 다시 받지 않고 고른 것이 채워진 채로 시작한다", (await page.evaluate(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length)) === 1);
  await clickText(page, "button", "고령자입니다");
  await clickText(page, "button", "다음");
  await clickText(page, "button", "천천히 설명해 주세요");
  await clickText(page, "button", "다음");
  await waitText(page, "이름과 항공편을 알려 주세요");
  check("고치기: 이름과 항공편이 채워져 있다", (await page.$eval("#reg-name", (e) => (e as HTMLInputElement).value)) === "종이여객");
  await fill(page, "#reg-name", "고친여객");
  await clickText(page, "button", "다음");
  await waitText(page, "이렇게 고칠까요?");
  await shot(page, "데스크-등록고치기");
  await clickText(page, "button", "고친 내용 저장");
  await waitText(page, "이 여객에게 줄 패스를 스캔하세요");
  const edited = await text(page);
  check("고치기: 저장하면 고친 내용이 바로 보인다", edited.includes("고친여객") && edited.includes("고령자입니다") && edited.includes("천천히 설명해 주세요"));
  await clickText(page, "button", "이 등록 취소하기");
  await waitText(page, "이 등록을 취소할까요?");
  check("등록 취소는 한 번 더 묻는다. 처음 초점은 그만두기에 있다", await page.evaluate(() => document.activeElement?.textContent?.trim() === "그만두기"));
  await shot(page, "데스크-등록취소-확인");
  await page.keyboard.press("Escape");
  await waitGone(page, "이 등록을 취소할까요?");
  check("Esc 를 누르면 취소하지 않고 닫힌다", await has(page, "고친여객"));
  await clickText(page, "button", "이 등록 취소하기");
  await waitText(page, "이 등록을 취소할까요?");
  await clickText(page, ".sheet-box button", "등록 취소");
  await waitText(page, "등록을 취소했습니다");
  check("등록 취소: 여객 정보를 지운다", await has(page, "지웠습니다"));
  await shot(page, "데스크-등록취소");
  await clickText(page, "button", "다음 여객");
  await waitText(page, "패스를 기다리는 등록");
  check("취소한 등록은 목록에 없다", !(await has(page, "고친여객")) && !(await has(page, "종이여객")));

  // 재발급
  await clickText(page, ".seg button", "재발급");
  await waitText(page, "패스를 잃어버린 여객을 골라 주세요");
  await waitText(page, "김영희");
  await fill(page, 'input[type="search"]', "김영");
  await page.waitForFunction(() => document.querySelectorAll(".reg-row").length === 1, { timeout: WAIT });
  const oldPass = await page.$eval(".reg-row .reg-no", (e) => (e as HTMLElement).innerText.replace(/\D/g, ""));
  await shot(page, "데스크-재발급");
  await clickText(page, ".reg-row", "김영희");
  await waitText(page, "새로 줄 패스를 스캔하세요");
  await clickText(page, "button", "자동 배정");
  await waitText(page, "재발급했습니다");
  const newPass = await page.$eval(".pass-big b", (e) => (e as HTMLElement).innerText.trim());
  check("재발급: 새 패스 번호를 준다", /^\d{4}$/.test(newPass) && newPass !== oldPass, `${oldPass} → ${newPass}`);
  const oldGone = await page.evaluate(
    (n) => fetch("/api/staff/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passNo: n }) }).then((r) => r.json()),
    oldPass,
  );
  check("재발급하면 이전 패스는 열리지 않는다", oldGone.kind === "unknown", JSON.stringify(oldGone));
  const newOk = await page.evaluate(
    (n) => fetch("/api/staff/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passNo: n }) }).then((r) => r.json()),
    newPass,
  );
  check("새 패스 번호로는 여객 카드가 열린다", newOk.kind === "active", newOk.kind);

  // 앞선 응대 이력
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await waitText(page, "박민수");
  check("목록에 앞 구역의 응대 완료가 보인다", /탑승동 끝단 응대 완료 \d\d:\d\d/.test(await text(page)));
  await shot(page, "데스크-전체여객목록");
  await clickText(page, ".case-row", "박민수");
  await waitText(page, "앞선 응대");
  check("여객 카드에 앞선 응대 이력이 구역과 시각으로 나온다", /탑승동 끝단[\s\S]*\d\d:\d\d ~ \d\d:\d\d 완료/.test(await text(page)));
  await page.evaluate(() => document.querySelector(".trail")?.scrollIntoView({ block: "center" }));
  await shot(page, "직원-앞선응대");

  // 오늘 현황
  await page.goto(`${BASE}/staff/desk/stats`, { waitUntil: "load", timeout: 120_000 });
  const stats = await text(page);
  check("오늘 현황: 등록·연결·응대 건수가 나온다", stats.includes("오늘 받은 등록") && stats.includes("응대 완료") && /응대 완료\s*1\s*회/.test(stats));
  check("오늘 현황에는 이름이나 편명이 없다", !stats.includes("박민수") && !stats.includes("MK102"));
  await shot(page, "데스크-오늘현황");

  await page.goto(`${BASE}/nope`, { waitUntil: "load", timeout: 120_000 });
  check("없는 주소는 안내 화면을 보여준다", await has(page, "찾는 화면이 없습니다"));

  // 넓은 화면(안내데스크 컴퓨터)에서도 가운데 한 줄로 보인다.
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/staff/desk`, { waitUntil: "load", timeout: 120_000 });
  await waitText(page, "패스를 기다리는 등록");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check("넓은 화면에서 가로로 넘치지 않는다", wide);
  await page.waitForSelector(".reg-row", { timeout: WAIT });
  await shot(page, "데스크-넓은화면");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  const narrow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check("휴대전화 너비에서 가로로 넘치지 않는다", narrow);

  // 패스 QR 주소 분기
  await page.goto(`${BASE}/p/${"z".repeat(24)}`, { waitUntil: "load", timeout: 120_000 });
  check("없는 패스 QR 주소는 사용할 수 없는 패스라고 알려 준다", await has(page, "사용할 수 없는 패스입니다"));
  await shot(page, "패스QR-사용불가");

  // 로그인하지 않은 직원이 기본 카메라로 패스를 찍은 경우: 로그인 → 구역 고르기 → 그 여객 카드로 이어진다.
  await page.goto(`${BASE}/staff`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, "button[aria-label='로그아웃']", "");
  await page.waitForFunction(() => location.pathname === "/staff/login", { timeout: WAIT });
  await page.goto(qrUrl, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, "a", "직원 로그인");
  await fill(page, "#code", COMMON_CODE);
  await page.keyboard.press("Enter");
  await waitText(page, "오늘 근무하는 구역을 골라 주세요");
  await clickText(page, ".zone-opt", "서편 AM");
  await page.waitForFunction(() => location.pathname.startsWith("/staff/case/"), { timeout: WAIT });
  await waitText(page, "ENGLISH GUEST");
  check("패스를 먼저 찍고 로그인·구역 선택을 해도 그 여객 카드로 이어진다", true);
  await browser.close();

  // ───────── 5. 카메라로 QR 스캔 ─────────
  section("카메라 QR 스캔");
  browser = await launch([
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${qrJpeg}`,
  ]);
  page = await open(browser);
  await login(page, DESK_CODE);
  await waitText(page, "김영희");
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "load", timeout: 120_000 });
  await waitText(page, "연결되지 않은 패스입니다");
  check("카메라로 미사용 패스를 찍으면 연결되지 않은 패스라고 알려 준다", true);
  await shot(page, "직원-스캔-카메라");
  await page.goto(`${BASE}/staff/desk`, { waitUntil: "load", timeout: 120_000 });
  await clickText(page, ".reg-row", "문접수");
  await waitText(page, "님께 이 번호의 패스를 드리세요");
  const scanned = await page.$eval(".pass-big b", (e) => (e as HTMLElement).innerText.trim());
  check("안내데스크: 카메라로 패스 QR 을 찍어 연결한다", scanned === scanPass, `패스 ${scanned}`);
  // 찍자마자 여객 카드로 넘어가므로 화면이 조용해지기를 기다리지 않는다.
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(() => location.pathname.startsWith("/staff/case/"), { timeout: WAIT });
  await waitText(page, "문접수");
  check("직원: 카메라로 패스 QR 을 찍으면 여객 카드가 열린다", true);
  await shot(page, "직원-스캔후-여객카드");
  await browser.close();
  fs.rmSync(qrJpeg, { force: true });

  // 멀리서 비춘 작은 QR. 화면을 통째로 줄여 읽으면 한 칸이 2화소도 안 되어 읽히지 않는다. 가운데를 잘라 읽어야 한다.
  browser = await launch([
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${farJpeg}`,
  ]);
  page = await open(browser);
  await login(page, COMMON_CODE);
  await waitText(page, "오늘 근무하는 구역을 골라 주세요");
  await clickText(page, ".zone-opt", "끝단");
  await waitText(page, "내 근무 구역");
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(() => location.pathname.startsWith("/staff/case/"), { timeout: WAIT });
  await waitText(page, "문접수");
  check("20~30cm 거리에서 작게 보이는 패스 QR 도 읽는다 (1920x1080 화면에 170화소)", true);
  await browser.close();
  fs.rmSync(farJpeg, { force: true });

  writeReport();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n점검 ${results.length}개 가운데 통과 ${results.length - failed.length}개, 실패 ${failed.length}개`);
  for (const f of failed) console.log(`  실패: ${f.name}${f.note ? ` (${f.note})` : ""}`);
  console.log(`화면 그림 ${shotNo}장: ${SHOTS}`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n중간에 멈춤. 그때까지 통과 ${results.length - failed.length}개, 실패 ${failed.length}개`);
  process.exit(1);
});
