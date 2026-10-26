import fs from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local fixtures only");
  const setup = await fetch(base + "/api/admin/setup", {
    method: "POST",
    headers: {
      Authorization: "Bearer dx-local-check-only",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      codes: Object.fromEntries(readSeedZones().map((z) => [z.id, z.code])),
    }),
  });
  assert.equal(setup.status, 200);
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const out = ".e2e-shots/business-resolution",
    checks: string[] = [],
    errors: string[] = [];
  fs.mkdirSync(out, { recursive: true });
  const check = (name: string, ok: unknown) => {
    assert.ok(ok, name);
    checks.push(name);
    console.log("PASS", name);
  };
  async function api(p: Page, url: string, body?: unknown) {
    return p.evaluate(
      async (url, body) => {
        const r = await fetch(
          url,
          body === undefined
            ? {}
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
  try {
    const passenger = await (await browser.createBrowserContext()).newPage(),
      staff = await (await browser.createBrowserContext()).newPage();
    for (const p of [passenger, staff])
      p.on("pageerror", (e) => errors.push(String(e)));
    await passenger.setViewport({ width: 390, height: 844 });
    await passenger.goto(base + "/");
    const receipt = randomBytes(32).toString("hex"),
      created = await api(passenger, "/api/requests/create", {
        receipt,
        service: "guidance",
        topicId: "facility",
        placeId: "t2-arrivals-demo",
        note: "안내 표지가 잘 보이지 않습니다.",
        choices: [],
        party: 1,
        lang: "ko",
        consent: true,
      });
    check("referral enquiry accepted", created.status === 200);
    const id = created.body.request.id;
    await passenger.evaluate(
      (receipt) => sessionStorage.setItem("jsp-dx-receipt-v1", receipt),
      receipt,
    );
    await passenger.goto(base + "/help?resume=1");
    await staff.setViewport({ width: 1440, height: 1000 });
    await staff.goto(base + "/staff/login");
    check(
      "desk login",
      (
        await api(staff, "/api/staff/login", {
          code: readSeedZones().find((z) => z.isDesk)!.code,
        })
      ).status === 200,
    );
    await staff.goto(base + "/staff/requests");
    await staff.waitForSelector(`[data-select-request="${id}"]`);
    await staff.click(`[data-select-request="${id}"]`);
    const card = `[data-request-id="${id}"]`,
      prefix = "#business-" + id;
    await staff.$eval(card + " .business-handling details", (e) =>
      e.setAttribute("open", ""),
    );
    await staff.select(prefix + "-target", "shuttle");
    await staff.type(prefix + "-reason", "교통 문의로 분류 재확인");
    await staff.$eval(card + " .business-handling details form", (f) =>
        (f as HTMLFormElement).requestSubmit(),
    );
    await staff.waitForFunction(
      (card) =>
        document
          .querySelector(card)
          ?.textContent?.includes("담당 연결 참고 업무: 셔틀버스 운영"),
      {},
      card,
    );
    check("classification changed in staff detail", true);
    const assignedBefore = (
      await api(staff, "/api/staff/requests?business=shuttle")
    ).body;
    check(
      "business filter includes corrected enquiry",
      assignedBefore.requests.some((r: { id: string }) => r.id === id),
    );
    check(
      "old business filter excludes corrected enquiry",
      !(
        await api(staff, "/api/staff/requests?business=cleaning-t2")
      ).body.requests.some((r: { id: string }) => r.id === id),
    );
    const clickNext = async (label: string) => {
      await staff.waitForFunction(
        (card, label) =>
          Array.from(document.querySelectorAll(card + " button")).some(
            (b) =>
              b.textContent?.trim() === label && !b.hasAttribute("disabled"),
          ),
        {},
        card,
        label,
      );
      await staff.evaluate(
        (card, label) =>
          Array.from(
            document.querySelectorAll<HTMLButtonElement>(card + " button"),
          )
            .find((b) => b.textContent?.trim() === label)!
            .click(),
        card,
        label,
      );
    };
    await clickNext("제가 맡겠습니다");
    await clickNext("응대 시작");
    await staff.waitForSelector(card + " .business-result-form");
    check(
      "referral completion requires the result form",
      !(await staff.$$eval(card + " > button", (buttons) =>
        buttons.some((b) => b.textContent?.trim() === "지원 완료"),
      )),
    );
    await staff.select(prefix + "-kind", "handoff");
    await staff.select(prefix + "-result-business", "shuttle");
    await staff.type(
      prefix + "-message",
      "셔틀버스 담당 직원이 문의를 인계받았습니다. 안내받은 창구에서 이어서 상담해 주세요.",
    );
    check(
      "handover cannot complete before direct confirmation",
      await staff.$eval(
        card + " .business-result-form button",
        (b) => (b as HTMLButtonElement).disabled,
      ),
    );
    await staff.screenshot({
      path: out + "/staff-result-pc.png",
      fullPage: true,
    });
    await staff.setViewport({ width: 390, height: 844 });
    check(
      "mobile result form fits",
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await staff.screenshot({
      path: out + "/staff-result-mobile.png",
      fullPage: true,
    });
    await staff.click(card + " .business-confirm input");
    await staff.click(card + " .business-result-form button");
    await staff.waitForSelector(card + " .request-resolution");
    check("staff result saved", true);
    const history = await api(staff, `/api/staff/requests/${id}/history`);
    check(
      "classification and completion have audit entries",
      history.body.history.some(
        (h: { action: string }) => h.action === "classify_business",
      ) &&
        history.body.history.some(
          (h: { action: string; reason: string }) =>
            h.action === "complete" && h.reason.includes("셔틀버스"),
        ),
    );
    await passenger.reload();
    await passenger.waitForSelector(".request-resolution");
    check(
      "passenger receives actual recorded handover",
      await passenger.$eval(".request-resolution", (e) =>
        e.textContent?.includes("문의를 인계받았습니다"),
      ),
    );
    check(
      "handover is distinguished from issue resolution",
      await passenger.$eval(".request-resolution", (e) =>
        e.textContent?.includes("조치 완료와는 구분"),
      ),
    );
    await passenger.screenshot({
      path: out + "/passenger-result.png",
      fullPage: true,
    });
    await passenger.goto(base + "/");
    await passenger.waitForSelector(".my-request-panel .request-resolution");
    check("portal includes the same outcome", true);
    await passenger.goto(base + "/help?resume=1&lang=en");
    await passenger.waitForSelector(".request-resolution");
    check(
      "English result uses the same honest outcome",
      await passenger.$eval(".request-resolution", (e) =>
        e.textContent?.includes("Department handover confirmed by staff"),
      ),
    );
    check("no browser runtime errors", errors.length === 0);
    console.log(`Business handling checks: ${checks.length} passed`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
