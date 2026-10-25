import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local mock server only");
  const chrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(fs.existsSync);
  if (!chrome) throw new Error("Browser not installed");
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
  });
  const checks: string[] = [];
  const check = (name: string, ok: boolean) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  const out = process.env.SHOTS_DIR ?? ".e2e-shots/operations";
  fs.mkdirSync(out, { recursive: true });
  const seed = readSeedZones();
  async function api(p: Page, url: string, body?: unknown) {
    return p.evaluate(
      async (url, body) => {
        const r = await fetch(
          url,
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
      url,
      body,
    );
  }
  async function click(p: Page, text: string, id?: string) {
    const selector = id ? `[data-request-id="${id}"]` : "body";
    await p.waitForFunction(
      (selector, text) =>
        Array.from(
          document.querySelector(selector)?.querySelectorAll("button") ?? [],
        ).some((e) => e.textContent?.trim() === text && !e.disabled),
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
          .find((e) => e.textContent?.trim() === text)
          ?.click(),
      selector,
      text,
    );
  }
  async function staff(zone?: string) {
    const p = await (await browser.createBrowserContext()).newPage();
    await p.goto(base + "/staff/login");
    const code = seed.find((z) => (zone ? z.isCommon : z.isDesk))!.code;
    assert.equal((await api(p, "/api/staff/login", { code })).status, 200);
    if (zone)
      assert.equal(
        (await api(p, "/api/staff/zone", { zoneId: zone })).status,
        200,
      );
    await p.goto(base + "/staff/requests", { waitUntil: "networkidle0" });
    return p;
  }
  async function current(p: Page, id: string) {
    const list = await api(p, "/api/staff/requests");
    return list.body.requests.find((r: { id: string }) => r.id === id);
  }
  try {
    const passenger = await (await browser.createBrowserContext()).newPage();
    await passenger.goto(base + "/register");
    const flights = await api(passenger, "/api/flights/search?q=MK127");
    const f = flights.body.flights[0];
    if (!f) throw new Error("Run dx-e2e.ts once to prepare local fixtures");
    const reg = await api(passenger, "/api/registrations", {
      flightDate: f.flightDate,
      flightNo: f.flightNo,
      choices: ["gd_large"],
      party: 2,
      consent: true,
      lang: "ko",
      startedAt: new Date().toISOString(),
    });
    assert.equal(reg.status, 200);
    await passenger.goto(base + `/p/${reg.body.token}/help`, {
      waitUntil: "networkidle0",
    });
    await passenger.select("#dx-place", "t1-info");
    await passenger.click('input[type="checkbox"][required]');
    await passenger.click('button[type="submit"]');
    await click(passenger, "이 내용으로 요청 접수");
    await passenger.waitForSelector('h2[role="status"]');
    const receipt = await passenger.evaluate(() =>
      sessionStorage.getItem("jsp-dx-receipt-v1"),
    );
    const created = (await api(passenger, "/api/requests/status", { receipt }))
      .body.request;
    const desk = await staff();
    await desk.waitForSelector(`[data-request-id="${created.id}"]`);
    await desk.select(`#target-${created.id}`, "cc-center");
    await click(desk, "선택 구역에 배정", created.id);
    await desk.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"]`)
          ?.textContent?.includes("담당자 배정"),
      {},
      created.id,
    );
    check(
      "desk dispatches to a chosen zone",
      (await current(desk, created.id)).assignedZone === "cc-center",
    );
    const first = await staff("cc-center");
    await first.waitForSelector(`[data-request-id="${created.id}"]`);
    check(
      "guidance response does not force travel and arrival",
      await first.$eval(
        `[data-request-id="${created.id}"]`,
        (e) =>
          e.textContent?.includes("응대 시작") === true &&
          !e.textContent?.includes("현장으로 출발"),
      ),
    );
    await click(first, "응대 시작", created.id);
    await passenger.waitForFunction(
      () =>
        document.querySelector('h2[role="status"]')?.textContent === "지원 중",
    );
    check("passenger sees actual response progress", true);
    await desk.waitForFunction((id) => document.querySelector(`[data-request-id="${id}"]`)?.textContent?.includes("지원 중"), {}, created.id);
    await desk.type(`#reason-${created.id}`, "교대 점검");
    await desk.select(`#target-${created.id}`, "cc-mid");
    await click(desk, "사유 기록 후 담당 인계", created.id);
    await desk.waitForFunction(
      async (id) => {
        const r = await fetch("/api/staff/requests");
        const b = await r.json();
        return b.requests.some(
          (r: { id: string; assignedZone: string }) =>
            r.id === id && r.assignedZone === "cc-mid",
        );
      },
      {},
      created.id,
    );
    const transferred = await current(desk, created.id);
    check(
      "handoff preserves service progress",
      transferred.state === "serving",
    );
    check(
      "previous zone loses completion authority",
      (
        await api(first, "/api/staff/requests", {
          id: created.id,
          version: transferred.version,
          action: "complete",
        })
      ).status === 403,
    );
    const second = await staff("cc-mid");
    await second.waitForSelector(`[data-request-id="${created.id}"]`);
    await click(second, "지원 완료", created.id);
    await passenger.waitForFunction(
      () => document.querySelector('h2[role="status"]')?.textContent === "완료",
    );
    check("new zone completes the same request", true);
    await click(desk, "처리·인계 이력 확인", created.id);
    await desk.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"] ol`)
          ?.textContent?.includes("교대 점검"),
      {},
      created.id,
    );
    const history = await api(
      desk,
      `/api/staff/requests/${created.id}/history`,
    );
    check(
      "atomic work history records acceptance response handoff and completion",
      history.body.history
        .map((h: { action: string }) => h.action)
        .join(",") === "created,assign,serve,transfer,complete",
    );
    await passenger.goto(base + `/p/${reg.body.token}`, {
      waitUntil: "networkidle0",
    });
    await passenger.waitForFunction(
      () =>
        document.body.innerText.includes("내 등록에 연결된 도움 요청") &&
        document.body.innerText.includes("완료"),
    );
    check("registration screen follows the result of on-site work", true);
    const kiosk = await (await browser.createBrowserContext()).newPage();
    await kiosk.goto(base + "/kiosk");
    await api(kiosk, "/api/kiosk/login", {
      code: seed.find((z) => z.isKiosk)!.code,
      placeId: "t1-info",
    });
    const call = await api(kiosk, "/api/kiosk/call", { screen: "guide" });
    const callId = `call:${call.body.id}`;
    await first.reload({ waitUntil: "networkidle0" });
    await first.waitForSelector(`[data-request-id="${callId}"]`);
    await click(first, "제가 맡겠습니다", callId);
    await first.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-request-id="${id}"]`)
          ?.textContent?.includes("지원 완료"),
      {},
      callId,
    );
    await click(first, "지원 완료", callId);
    await first.waitForFunction(
      async (id) =>
        (await (await fetch("/api/staff/requests")).json()).requests.some(
          (r: { id: string; state: string }) =>
            r.id === id && r.state === "done",
        ),
      {},
      callId,
    );
    check(
      "old call is handled in the same staff queue",
      (await api(kiosk, `/api/kiosk/call/${call.body.id}`)).body.state ===
        "done",
    );
    const assist = await api(kiosk, "/api/assist", { token: reg.body.token });
    assert.equal(assist.status, 200);
    const normalized = await api(first, "/api/staff/requests");
    const assistRow = normalized.body.requests.find(
      (r: { queue: string; state: string }) =>
        r.queue === "assist" && r.state === "received",
    );
    if (!assistRow) throw new Error("Legacy mobility row missing");
    await first.reload({ waitUntil: "networkidle0" });
    await first.waitForSelector(`[data-request-id="${assistRow.id}"]`);
    await click(first, "제가 맡겠습니다", assistRow.id);
    await click(first, "이동지원 시작", assistRow.id);
    await click(first, "지원 완료", assistRow.id);
    const native = await api(kiosk, "/api/assist/status", {
      token: reg.body.token,
    });
    check(
      "old mobility and its passenger endpoint stay synchronized",
      native.body.request.state === "done",
    );
    await desk.goto(base + "/staff/desk/stats", { waitUntil: "networkidle0" });
    check(
      "operations dashboard includes the shared workload",
      await desk.evaluate(
        () =>
          document.body.innerText.includes("통합 업무 현황") &&
          document.body.innerText.includes("접수 경로"),
      ),
    );
    const summary = (await api(desk, "/api/desk/summary")).body.summary
      .operations;
    check(
      "summary counts each physical source once",
      summary.total ===
        summary.byQueue.integrated +
          summary.byQueue.call +
          summary.byQueue.assist,
    );
    await desk.screenshot({
      path: path.join(out, "operations-summary.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks }, null, 2),
    );
    console.log(`Operations browser checks: ${checks.length} passed`);
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

