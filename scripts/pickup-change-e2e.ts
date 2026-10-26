import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
import { placeOf } from "../src/lib/airport";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local fixtures only");
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!executablePath) throw new Error("Browser not installed");
  const browser = await puppeteer.launch({ executablePath, headless: true }),
    checks: string[] = [],
    errors: string[] = [];
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/pickup-change";
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  async function api(p: Page, route: string, body?: unknown) {
    return p.evaluate(
      async (route, body) => {
        const r = await fetch(
          route,
          body === undefined
            ? { cache: "no-store" }
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
        );
        return { status: r.status, body: await r.json() };
      },
      route,
      body,
    );
  }
  async function click(p: Page, text: string, id?: string) {
    const selector = id ? `[data-request-id="${id}"]` : "body";
    await p.waitForFunction(
      (selector, text) =>
        Array.from(
          document.querySelector(selector)?.querySelectorAll("button") ?? [],
        ).some((b) => b.textContent?.trim() === text && !b.disabled),
      {},
      selector,
      text,
    );
    await p.evaluate(
      (selector, text) =>
        Array.from(
          document
            .querySelector(selector)
            ?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        )
          .find((b) => b.textContent?.trim() === text)
          ?.click(),
      selector,
      text,
    );
  }
  try {
    const passenger = await (await browser.createBrowserContext()).newPage();
    passenger.on("pageerror", (e) => errors.push(String(e)));
    await passenger.goto(base + "/help");
    const receipt = crypto.randomBytes(32).toString("hex");
    const created = await api(passenger, "/api/requests/create", {
      receipt,
      service: "robot",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "위치 변경 화면 검증",
      lang: "ko",
      consent: true,
    });
    assert.equal(created.status, 200);
    const id = created.body.request.id;
    const current = async () =>
      (await api(passenger, "/api/requests/status", { receipt })).body.request;
    await passenger.goto(base + "/help/receipt/" + receipt, {
      waitUntil: "networkidle0",
    });
    await passenger.waitForSelector("#pickup-change-place");
    await passenger.select("#pickup-change-place", "cc-125");
    await click(passenger, "새 만날 곳으로 변경");
    await passenger.waitForFunction(
      (label) => document.body.innerText.includes("만날 곳: " + label),
      {},
      placeOf("cc-125")!.label,
    );
    check(
      "unassigned passenger pickup changes without another request",
      (await current()).id === id && (await current()).placeId === "cc-125",
    );
    const desk = await (await browser.createBrowserContext()).newPage();
    desk.on("pageerror", (e) => errors.push(String(e)));
    await desk.goto(base + "/staff/login");
    assert.equal(
      (
        await api(desk, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status,
      200,
    );
    await desk.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    await desk.waitForSelector(`[data-select-request="${id}"]`);
    await desk.click(`[data-select-request="${id}"]`);
    await desk.waitForSelector(`[data-request-id="${id}"]`);
    await click(desk, "제가 맡겠습니다", id);
    await passenger.waitForFunction(
      () =>
        document.querySelector('[role="status"].request-state-pill')
          ?.textContent === "담당자 배정",
    );
    await passenger.select("#pickup-change-place", "t1-info");
    await click(passenger, "위치 변경 요청 보내기");
    await passenger.waitForFunction(() =>
      document.body.innerText.includes("위치 변경 확인 대기:"),
    );
    let job = await current();
    check(
      "assigned pickup remains unchanged until confirmed",
      job.placeId === "cc-125" && job.pendingPlaceId === "t1-info",
    );
    await desk.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"]`)
          ?.textContent?.includes("위치 변경 확인 대기:"),
      {},
      id,
    );
    check(
      "staff movement button is hidden during a pending change",
      await desk.$eval(
        `[data-request-id="${id}"]`,
        (e) =>
          !Array.from(e.querySelectorAll("button")).some(
            (b) => b.textContent === "로봇 출발 · 모의",
          ),
      ),
    );
    check(
      "server also blocks bypassed movement",
      (
        await api(desk, "/api/staff/requests", {
          id,
          version: job.version,
          action: "travel",
        })
      ).status === 409,
    );
    await passenger.setViewport({ width: 390, height: 844 });
    await passenger.screenshot({
      path: path.join(out, "pending-pickup-mobile.png"),
      fullPage: true,
    });
    check(
      "pickup change fits a narrow phone",
      await passenger.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await click(desk, "새 만날 곳 수락", id);
    await passenger.waitForFunction(
      (label) =>
        document.body.innerText.includes("만날 곳: " + label) &&
        !document.body.innerText.includes("위치 변경 확인 대기:"),
      {},
      placeOf("t1-info")!.label,
    );
    check(
      "staff acceptance confirms the new pickup and preserves assignment",
      (await current()).state === "assigned" &&
        (await current()).placeId === "t1-info",
    );
    await click(desk, "로봇 출발 · 모의", id);
    await passenger.waitForFunction(
      () =>
        document.querySelector('[role="status"].request-state-pill')
          ?.textContent === "로봇 이동 중 · 모의",
    );
    await passenger.select("#pickup-change-place", "cc-108");
    await click(passenger, "위치 변경 요청 보내기");
    await desk.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"]`)
          ?.textContent?.includes("위치 변경 확인 대기:"),
      {},
      id,
    );
    await desk.$eval(`[data-request-id="${id}"] .work-secondary-actions`, (e) =>
      e.setAttribute("open", ""),
    );
    await desk.type(
      `#reason-${id}`,
      "다른 구역으로 변경은 안내데스크 확인이 필요합니다",
    );
    await click(desk, "사유 기록 후 위치 변경 거절", id);
    await passenger.waitForFunction(() =>
      document.body.innerText.includes(
        "다른 구역으로 변경은 안내데스크 확인이 필요합니다",
      ),
    );
    job = await current();
    check(
      "declined change preserves the prior pickup and movement stage",
      job.placeId === "t1-info" &&
        job.state === "en_route" &&
        !job.pendingPlaceId,
    );
    await passenger.select("#pickup-change-place", "cc-125");
    await click(passenger, "위치 변경 요청 보내기");
    await passenger.waitForFunction(() =>
      document.body.innerText.includes("위치 변경 확인 대기:"),
    );
    await click(passenger, "위치 변경 요청 철회");
    await passenger.waitForFunction(
      () => !document.body.innerText.includes("위치 변경 확인 대기:"),
    );
    check(
      "passenger can withdraw a proposal",
      (await current()).placeId === "t1-info" &&
        !(await current()).pendingPlaceId,
    );
    await desk.reload({ waitUntil: "networkidle0" });
    await click(desk, "현장 도착", id);
    await click(desk, "지원 시작", id);
    await passenger.waitForFunction(
      () =>
        document.querySelector('[role="status"].request-state-pill')
          ?.textContent === "지원 중",
    );
    check(
      "started assistance gives a staff-contact path instead of an unusable change form",
      !(await passenger.$("#pickup-change-place")) &&
        (await passenger.evaluate(() =>
          document.body.innerText.includes("현장 직원에게 직접 알려 주세요"),
        )),
    );
    job = await current();
    check(
      "requester cannot rewrite pickup after service starts",
      (
        await api(passenger, "/api/requests/location", {
          receipt,
          version: job.version,
          placeId: "cc-108",
        })
      ).status === 409,
    );
    await click(desk, "지원 완료", id);
    await click(desk, "처리·인계 이력 확인", id);
    await desk.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"] ol`)
          ?.textContent?.includes("위치 변경 거절"),
      {},
      id,
    );
    check(
      "work history includes requested accepted declined and withdrawn changes",
      true,
    );
    const future = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + 7 * 86400000));
    const registered = await api(passenger, "/api/registrations", {
      flightDate: future,
      flightNo: "MK9999",
      choices: [],
      party: 1,
      consent: true,
      lang: "en",
      startedAt: new Date().toISOString(),
    });
    assert.equal(registered.status, 200);
    const token = registered.body.token,
      linkedReceipt = crypto.randomBytes(32).toString("hex");
    const linked = await api(passenger, "/api/requests/create", {
      receipt: linkedReceipt,
      registrationToken: token,
      service: "guidance",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "",
      lang: "en",
      consent: true,
    });
    const assigned = await api(desk, "/api/staff/requests", {
      id: linked.body.request.id,
      version: linked.body.request.version,
      action: "assign",
    });
    assert.equal(
      (
        await api(passenger, "/api/requests/location", {
          receipt: linkedReceipt,
          version: assigned.body.request.version,
          placeId: "cc-125",
        })
      ).status,
      200,
    );
    await passenger.goto(base + "/p/" + token, { waitUntil: "networkidle0" });
    await passenger.waitForFunction(() =>
      document.body.innerText.includes("Pickup change awaiting confirmation"),
    );
    check(
      "original registration also shows the pending change in English",
      true,
    );
    await api(passenger, "/api/pass/erase", { token });
    check("no browser runtime errors", errors.length === 0);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Pickup browser checks:", checks.length);
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
