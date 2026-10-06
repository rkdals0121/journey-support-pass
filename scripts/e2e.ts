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
const WAIT = 60_000;

const seed = readSeedZones();
const DESK_CODE = seed.find((z) => z.isDesk)!.code;
const COMMON_CODE = seed.find((z) => z.isCommon)!.code;
const ZONE_CODE = seed.find((z) => z.id === "t2-wam")!.code;

const results: { name: string; ok: boolean; note?: string }[] = [];
let shotNo = 0;

function check(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note });
  console.log(`${ok ? "  통과" : "  실패"}  ${name}${note ? `  (${note})` : ""}`);
}

async function shot(page: Page, name: string, fullPage = false) {
  shotNo += 1;
  const file = path.join(SHOTS, `${String(shotNo).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file as `${string}.png`, fullPage: false });
  void fullPage;
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
  await page.waitForSelector(selector, { timeout: WAIT });
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
  await page.goto(`${BASE}/staff/login`, { waitUntil: "networkidle0" });
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

(async () => {
  if (!CHROME) throw new Error("Chrome 이나 Edge 를 찾지 못했습니다. CHROME_PATH 로 알려 주세요.");
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("이 점검은 이 컴퓨터의 개발 서버에만 씁니다.");
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.endsWith(".png")) fs.unlinkSync(path.join(SHOTS, f));

  let browser = await launch();
  let page = await open(browser);

  // ───────── 1. 여객: 첫 화면과 등록 ─────────
  console.log("\n[여객 등록]");
  await page.goto(BASE, { waitUntil: "networkidle0" });
  check("첫 화면이 열린다", await has(page, "한 번만 알려 주세요"));
  await shot(page, "여객-첫화면", true);
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
  await shot(page, "여객-필요한도움", true);
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
  await shot(page, "여객-접수번호", true);
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, receiptNo);
  check("완료 화면을 새로 고쳐도 접수 번호가 남아 있다", true);

  // ───────── 2. 로그인하지 않은 사람 ─────────
  console.log("\n[로그인 전]");
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
  check("직원 화면은 로그인 없이 열리지 않는다", page.url().includes("/staff/login"));
  await shot(page, "직원-로그인");
  await page.goto(`${BASE}/p/${"x".repeat(24)}`, { waitUntil: "networkidle0" });
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

  // ───────── 3. 현장 직원: 공통 코드 → 구역 고르기 → 목록 ─────────
  console.log("\n[현장 직원]");
  await login(page, COMMON_CODE);
  await waitText(page, "오늘 근무하는 구역을 골라 주세요");
  check("공통 직원 코드로 들어오면 근무 구역을 고르는 화면이 나온다", page.url().includes("/staff/zone"));
  await shot(page, "직원-구역고르기", true);
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
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
  await shot(page, "직원-내구역목록", true);

  await clickText(page, ".seg button", "전체");
  await waitText(page, "다른 구역");
  await waitText(page, "정하준");
  check("전체를 누르면 다른 구역 여객도 구역 이름과 함께 보인다", await has(page, "제2여객터미널 서편 AM"));
  await shot(page, "직원-전체목록", true);

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

  await page.goto(`${BASE}/staff/desk`, { waitUntil: "networkidle0" });
  check("현장 직원은 안내데스크 화면을 쓸 수 없다", await has(page, "안내데스크에서만 쓸 수 있습니다"));
  const forbidden = await page.evaluate(() => fetch("/api/desk/list", { method: "POST" }).then((r) => r.status));
  check("현장 직원의 안내데스크 요청은 403", forbidden === 403, String(forbidden));
  check("현장 직원 메뉴에는 안내데스크가 없다", !(await page.$eval(".staff-nav", (e) => (e as HTMLElement).innerText)).includes("안내데스크"));

  // 패스 번호로 여객 카드 열기
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "networkidle0" });
  await waitText(page, "카메라를 쓸 수 없습니다");
  check("카메라가 없으면 패스 번호를 입력하라고 안내한다", await has(page, "패스 번호 네 자리"));
  await shot(page, "직원-스캔-카메라없음");
  await fill(page, "#pass-no", "0000");
  await clickText(page, "button", "여객 카드 열기");
  await waitText(page, "패스 번호를 찾을 수 없습니다");
  check("없는 패스 번호는 찾을 수 없다고 알려 준다", true);

  // 여객 카드
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
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
  await shot(page, "직원-여객카드", true);
  await clickText(page, "button", "응대 시작");
  await waitText(page, "응대 완료");
  check("응대 시작을 누르면 응대 완료 버튼으로 바뀐다", true);
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, "응대 완료");
  check("카드를 다시 열어도 응대 중 상태가 이어진다", !(await has(page, "응대 시작")));
  await clickText(page, "button", "응대 완료");
  await waitText(page, "응대를 기록했습니다");
  check("응대 완료를 기록한다", true);
  await shot(page, "직원-응대완료");

  // 지연·탑승구 미정·탑승 중 카드
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
  await clickText(page, ".seg button", "전체");
  await clickText(page, ".case-row", "한미숙");
  await waitText(page, "소통 방식");
  await waitText(page, "응대 시작");
  check("지연 편은 바뀐 출발 시각과 지연 표시가 나온다", (await page.$$("s")).length === 1 && (await has(page, "지연")));
  await shot(page, "직원-여객카드-지연", true);
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
  await clickText(page, ".case-row", "이정자");
  await waitText(page, "글자나 표지를 보기 어렵습니다");
  check("탑승 중인 편은 상태가 함께 나온다", await has(page, "탑승중"));
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
  await clickText(page, ".case-row", "오대기");
  await waitText(page, "탑승구가 정해지면 표시됩니다");
  check("탑승구 미정 카드는 미정이라고 보여준다", await has(page, "미정"));
  const bad = await page.evaluate(() => fetch("/api/staff/case/00000000-0000-4000-8000-000000000000").then((r) => r.status));
  check("없는 등록의 카드는 열리지 않는다 (404)", bad === 404, String(bad));

  // 구역 코드로 들어온 직원 (예전 방식도 그대로 쓸 수 있다)
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
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
  console.log("\n[안내데스크]");
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
  await shot(page, "데스크-패스연결", true);

  await fill(page, "#receipt", "0000");
  await clickText(page, "button", "찾기");
  await waitText(page, "접수 번호를 찾을 수 없습니다");
  check("없는 접수 번호는 찾을 수 없다고 알려 준다", true);
  await fill(page, "#receipt", receiptNo);
  await clickText(page, "button", "찾기");
  await waitText(page, "이 여객에게 줄 패스를 스캔하세요");
  check("접수 번호로 찾으면 등록 내용을 대조할 수 있다", (await has(page, "점검여객")) && (await has(page, "휠체어를 이용합니다")));
  await shot(page, "데스크-패스연결-여객확인", true);
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
  await page.goto(`${BASE}/staff/desk/passes`, { waitUntil: "networkidle0" });
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
  await clickText(page, "button", "더 만들기");
  await waitText(page, "새로 만들었습니다");
  await page.waitForFunction((n) => document.querySelectorAll(".sheet-pass").length === n + 10, { timeout: WAIT }, idleBefore);
  check("패스 10장 더 만들기", true);

  await page.goto(`${BASE}/staff/desk`, { waitUntil: "networkidle0" });
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
  await page.goto(`${BASE}/staff`, { waitUntil: "networkidle0" });
  await waitText(page, "박민수");
  check("목록에 앞 구역의 응대 완료가 보인다", /탑승동 끝단 응대 완료 \d\d:\d\d/.test(await text(page)));
  await shot(page, "데스크-전체여객목록");
  await clickText(page, ".case-row", "박민수");
  await waitText(page, "앞선 응대");
  check("여객 카드에 앞선 응대 이력이 구역과 시각으로 나온다", /탑승동 끝단[\s\S]*\d\d:\d\d ~ \d\d:\d\d 완료/.test(await text(page)));
  await page.evaluate(() => document.querySelector(".trail")?.scrollIntoView({ block: "center" }));
  await shot(page, "직원-앞선응대");

  // 오늘 현황
  await page.goto(`${BASE}/staff/desk/stats`, { waitUntil: "networkidle0" });
  const stats = await text(page);
  check("오늘 현황: 등록·연결·응대 건수가 나온다", stats.includes("오늘 받은 등록") && stats.includes("응대 완료") && /응대 완료\s*1\s*회/.test(stats));
  check("오늘 현황에는 이름이나 편명이 없다", !stats.includes("박민수") && !stats.includes("MK102"));
  await shot(page, "데스크-오늘현황");

  await page.goto(`${BASE}/nope`, { waitUntil: "networkidle0" });
  check("없는 주소는 안내 화면을 보여준다", await has(page, "찾는 화면이 없습니다"));

  // 패스 QR 주소 분기
  await page.goto(`${BASE}/p/${"z".repeat(24)}`, { waitUntil: "networkidle0" });
  check("없는 패스 QR 주소는 사용할 수 없는 패스라고 알려 준다", await has(page, "사용할 수 없는 패스입니다"));
  await shot(page, "패스QR-사용불가");
  await browser.close();

  // ───────── 5. 카메라로 QR 스캔 ─────────
  console.log("\n[카메라 QR 스캔]");
  browser = await launch([
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${qrJpeg}`,
  ]);
  page = await open(browser);
  await login(page, DESK_CODE);
  await waitText(page, "김영희");
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "networkidle0" });
  await waitText(page, "연결되지 않은 패스입니다");
  check("카메라로 미사용 패스를 찍으면 연결되지 않은 패스라고 알려 준다", true);
  await shot(page, "직원-스캔-카메라");
  await page.goto(`${BASE}/staff/desk`, { waitUntil: "networkidle0" });
  await clickText(page, ".reg-row", "문접수");
  await waitText(page, "님께 이 번호의 패스를 드리세요");
  const scanned = await page.$eval(".pass-big b", (e) => (e as HTMLElement).innerText.trim());
  check("안내데스크: 카메라로 패스 QR 을 찍어 연결한다", scanned === scanPass, `패스 ${scanned}`);
  // 찍자마자 여객 카드로 넘어가므로 화면이 조용해지기를 기다리지 않는다.
  await page.goto(`${BASE}/staff/scan`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => location.pathname.startsWith("/staff/case/"), { timeout: WAIT });
  await waitText(page, "문접수");
  check("직원: 카메라로 패스 QR 을 찍으면 여객 카드가 열린다", true);
  await shot(page, "직원-스캔후-여객카드");
  await browser.close();
  fs.rmSync(qrJpeg, { force: true });

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
