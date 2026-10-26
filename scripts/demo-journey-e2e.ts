import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer, { type Page, type ElementHandle } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Local demo fixtures only");
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
    }),
    checks: string[] = [],
    errors: string[] = [];
  const out = ".e2e-shots/demo-journey";
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
  const lastHeading = new WeakMap<Page, string>();
  async function click(p: Page, selector: string, text: string) {
    await p.bringToFront();
    const heading = await p
      .$eval("h1", (e) => e.textContent ?? "")
      .catch(() => "");
    // FlowShell intentionally blocks trusted taps for 500 ms after a step changes.
    if ((await p.$(".flow-body")) && lastHeading.get(p) !== heading)
      await new Promise((resolve) => setTimeout(resolve, 550));
    lastHeading.set(p, heading);
    const h = await p.waitForFunction(
      (selector, text) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
          (e) =>
            e.textContent?.trim().startsWith(text) &&
            e.getClientRects().length > 0 &&
            Object.keys(e).some((k) => k.startsWith("__reactProps")) &&
            !(e as HTMLButtonElement).disabled,
        ),
      {},
      selector,
      text,
    );
    const el = h.asElement() as ElementHandle<Element> | null;
    assert.ok(el, `Missing ${text}`);
    await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await el.click();
    await h.dispose();
  }
  async function next(p: Page) {
    const before = await p.$eval("h1", (e) => e.textContent);
    await click(p, ".flow-cta button", "");
    await p.waitForFunction(
      (before) => document.querySelector("h1")?.textContent !== before,
      {},
      before,
    );
  }
  async function shot(p: Page, name: string) {
    await p.bringToFront();
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  }
  const seed = readSeedZones();
  try {
    const preparation = await (await browser.createBrowserContext()).newPage();
    preparation.on("pageerror", (e) => errors.push(String(e)));
    await preparation.setViewport({ width: 1440, height: 1000 });
    await preparation.goto(base + "/staff/login");
    await preparation.waitForFunction(() =>
      Object.keys(document.querySelector("#code") ?? {}).some((k) =>
        k.startsWith("__reactProps"),
      ),
    );
    await preparation.type("#code", seed.find((z) => z.isDesk)!.code);
    await click(preparation, "button", "로그인");
    await preparation.waitForSelector(".work-master");
    await preparation.goto(base + "/staff/demo");
    const preparing = preparation.waitForResponse(
      (r) =>
        r.url().endsWith("/api/staff/demo-flight") &&
        r.request().method() === "POST",
    );
    await click(preparation, "button", "시연 항공편 준비");
    const prepared = await preparing;
    check(
      "desk prepares a demo flight through the actual screen",
      prepared.status() === 200,
    );
    const demoFlight = (await prepared.json()).flight;
    const flightNo = demoFlight.flightNo as string;
    await preparation.waitForSelector("[data-demo-flight]");
    check(
      "prepared flight can be found in passenger registration",
      (
        await api(preparation, `/api/flights/search?q=${flightNo}`)
      ).body.flights.some((f: { flightNo: string }) => f.flightNo === flightNo),
    );
    await shot(preparation, "00-preparation");
    const passenger = await (await browser.createBrowserContext()).newPage();
    passenger.on("pageerror", (e) => errors.push(String(e)));
    await passenger.setViewport({ width: 390, height: 844 });
    await passenger.goto(base + "/demo/booking");
    await shot(passenger, "01-booking");
    await click(passenger, "a", "필요한 도움 미리 알려 두기");
    await passenger.waitForSelector(".pretrip-site");
    check(
      "booking opens the separate preregistration entrance",
      new URL(passenger.url()).pathname === "/prepare" &&
        new URL(passenger.url()).searchParams.get("via") === "booking",
    );
    await click(passenger, 'a[href*="/register"]', "필요한 도움 등록하기");
    await passenger.waitForSelector('[role="checkbox"]');
    check(
      "booking source reaches actual registration",
      new URL(passenger.url()).searchParams.get("via") === "booking",
    );
    await click(passenger, '[role="checkbox"]', "걷기");
    await click(passenger, '[role="checkbox"]', "보기");
    await next(passenger);
    await click(passenger, ".flow-cta button", "동의하고 계속");
    await click(
      passenger,
      '[role="checkbox"]',
      "계단과 에스컬레이터는 어려워요",
    );
    await click(passenger, '[role="radio"]', "걷다가 힘들면 그때 부를래요");
    await next(passenger);
    await click(passenger, '[role="checkbox"]', "큰 글씨로 보여주세요");
    await next(passenger);
    await click(passenger, '[role="radio"]', "함께 가는 분이 있어요");
    await next(passenger);
    await click(passenger, '[role="checkbox"]', "제가 필요할 때 부를게요");
    await next(passenger);
    await click(passenger, '[role="checkbox"]', "화장실");
    await next(passenger);
    await passenger.waitForSelector("#reg-flight");
    await passenger.type("#reg-flight", flightNo);
    await click(passenger, ".flight-opt", flightNo);
    await next(passenger);
    // Documents are optional; this story does not assert an eligibility decision.
    await next(passenger);
    await passenger.waitForSelector("#reg-note");
    const savedNote = "계단 없는 경로로 동행인과 함께 이동하고 싶습니다.";
    await passenger.type("#reg-note", savedNote);
    await next(passenger);
    check(
      "registration review contains the real chosen needs and party",
      await passenger.evaluate(
        (flightNo) =>
          document.body.innerText.includes(flightNo) &&
          document.body.innerText.includes("계단과 에스컬레이터") &&
          document.body.innerText.includes("2명"),
        flightNo,
      ),
    );
    await shot(passenger, "02-registration-review");
    const registration = passenger.waitForResponse(
      (r) =>
        r.url().endsWith("/api/registrations") &&
        r.request().method() === "POST",
    );
    await click(passenger, ".flow-cta button", "등록하기");
    const regResponse = await registration;
    check(
      "actual registration submits successfully",
      regResponse.status() === 200,
    );
    await passenger.waitForFunction(() =>
      /^\/p\/[^/]+$/.test(location.pathname),
    );
    const reg = { token: new URL(passenger.url()).pathname.split("/")[2] };
    const regPayload = JSON.parse(regResponse.request().postData() ?? "{}");
    check(
      "registration retains booking source and note",
      regPayload.via === "booking" && regPayload.note === savedNote,
    );
    await passenger.waitForSelector(".dx-pass-help");
    check(
      "registration opens saved registration without creating a support request",
      (await api(passenger, "/api/pass/requests", { token: reg.token })).body
        .requests.length === 0,
    );
    await shot(passenger, "03-saved-registration");
    await click(passenger, ".dx-pass-help", "사전등록 내용으로 지금 도움 요청");
    await passenger.waitForSelector("#dx-place");
    await passenger.select("#dx-place", "cc-center");
    await passenger.click('input[name="service"][value="mobility"]');
    await passenger.select("#dx-destination", "cc-130");
    check(
      "saved party and support needs reach the onsite form",
      (await passenger.$eval(
        "#dx-party",
        (e) => (e as HTMLInputElement).value === "2",
      )) &&
        (await passenger.evaluate(() =>
          document.body.innerText.includes("계단과 에스컬레이터"),
        )),
    );
    check(
      "saved note reaches the onsite request without retyping",
      (await passenger.$eval(
        "#dx-note",
        (e) => (e as HTMLTextAreaElement).value,
      )) === savedNote,
    );
    await passenger.click('input[type="checkbox"][required]');
    await click(passenger, 'button[type="submit"]', "");
    await shot(passenger, "04-onsite-review");
    const accepting = passenger.waitForResponse(
      (r) =>
        r.url().endsWith("/api/requests/create") &&
        r.request().method() === "POST",
    );
    await click(passenger, "button", "이 내용으로 요청 접수");
    const accepted = await accepting;
    check(
      "onsite request accepted only after final review",
      accepted.status() === 200,
    );
    const request = (await accepted.json()).request;
    check(
      "linked request has the intended task and business",
      request.source === "preregistered" &&
        request.topicId === "mobility" &&
        request.businessId === "shuttle",
    );
    check(
      "linked request retains party note and destination",
      request.party === 2 &&
        request.note === savedNote &&
        request.destinationId === "cc-130",
    );
    await shot(passenger, "05-request-received");
    async function login(zone?: string) {
      const p = await (await browser.createBrowserContext()).newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      await p.setViewport(
        zone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      await p.goto(base + "/staff/login");
      await p.waitForFunction(() =>
        Object.keys(document.querySelector("#code") ?? {}).some((k) =>
          k.startsWith("__reactProps"),
        ),
      );
      await p.type(
        "#code",
        seed.find((z) => (zone ? z.isCommon : z.isDesk))!.code,
      );
      await click(p, "button", "로그인");
      if (zone) {
        await p.waitForSelector(".zone-opt");
        await click(
          p,
          ".zone-opt",
          seed
            .find((z) => z.id === zone)!
            .label.split("(")[0]
            .trim()
            .replace(/^(탑승동|제[12]여객터미널)\s+/, ""),
        );
      }
      await p.waitForSelector(`[data-select-request="${request.id}"]`);
      await click(p, `[data-select-request="${request.id}"]`, "");
      return p;
    }
    const card = `[data-request-id="${request.id}"]`;
    async function current(p: Page) {
      return (await api(p, "/api/staff/requests")).body.requests.find(
        (r: { id: string }) => r.id === request.id,
      );
    }
    async function act(p: Page, text: string) {
      const response = p.waitForResponse(
        (r) =>
          r.url().endsWith("/api/staff/requests") &&
          r.request().method() === "POST",
      );
      await click(p, card + " button", text);
      const r = await response;
      check(`staff action ${text}`, r.status() === 200);
      return current(p);
    }
    const desk = preparation;
    await desk.goto(base + "/staff/requests?scope=active");
    await desk.waitForSelector(`[data-select-request="${request.id}"]`);
    await click(desk, `[data-select-request="${request.id}"]`, "");
    check(
      "desk receives the saved passenger context",
      await desk.$eval(
        card,
        (e, note) => e.textContent?.includes(note),
        savedNote,
      ),
    );
    await shot(desk, "06-desk-intake");
    await click(desk, card + " .work-secondary-actions > summary", "");
    await desk.select(`#target-${request.id}`, "cc-center");
    let r = await act(desk, "선택 구역에 배정");
    check(
      "desk assigns the same request to the first field zone",
      r.assignedZone === "cc-center",
    );
    const gear = await api(desk, "/api/staff/resources", {
      action: "create",
      label: `시연 이동장비 ${Date.now().toString().slice(-8)}`,
      kind: "mobility",
      zoneId: "cc-center",
    });
    check("explicit pilot equipment is registered", gear.status === 200);
    await desk.waitForFunction(
      (id, gear) =>
        Array.from(
          document.querySelectorAll<HTMLOptionElement>(
            `#resource-${id} option`,
          ),
        ).some((o) => o.value === gear),
      {},
      request.id,
      gear.body.id,
    );
    await desk.select(`#resource-${request.id}`, gear.body.id);
    const allocating = desk.waitForResponse(
      (res) =>
        res.url().endsWith("/api/staff/resources") &&
        res.request().method() === "POST",
    );
    await click(desk, card + " button", "선택 장비 배차");
    check(
      "pilot equipment is allocated from the staff screen",
      (await allocating).status() === 200,
    );
    const first = await login("cc-center");
    check(
      "first field operator sees destination and saved note",
      await first.$eval(
        card,
        (e, note) =>
          e.textContent?.includes("130번") && e.textContent?.includes(note),
        savedNote,
      ),
    );
    await shot(first, "07-field-assignment");
    await act(first, "현장으로 출발");
    await passenger.bringToFront();
    await passenger.waitForFunction(() =>
      document
        .querySelector('h2[role="status"]')
        ?.textContent?.includes("현장으로 이동 중"),
    );
    check("passenger receives travel progress on the same request", true);
    await shot(passenger, "08-passenger-progress");
    await act(first, "현장 도착");
    await desk.bringToFront();
    await desk.waitForFunction(
      (card) =>
        document.querySelector(card)?.textContent?.includes("현장 도착"),
      {},
      card,
    );
    await desk.select(`#target-${request.id}`, "cc-end");
    await desk.type(`#reason-${request.id}`, "목적지 구역 직원에게 인계");
    r = await act(desk, "사유 기록 후 담당 인계");
    check(
      "handover preserves arrival state",
      r.state === "arrived" && r.assignedZone === "cc-end",
    );
    check(
      "previous field operator loses further action authority",
      (
        await api(first, "/api/staff/requests", {
          id: request.id,
          version: r.version,
          action: "serve",
        })
      ).status === 403,
    );
    const snapshot = (await api(desk, "/api/staff/resources")).body.resources;
    check(
      "handover retains the allocated equipment",
      snapshot.some(
        (g: { id: string; requestId: string }) =>
          g.id === gear.body.id && g.requestId === request.id,
      ),
    );
    const second = await login("cc-end");
    await act(second, "이동지원 시작");
    await click(
      second,
      card + " .business-handling summary",
      "처리 결과를 남기고 완료하기",
    );
    const prefix = "#business-" + request.id;
    await second.select(prefix + "-kind", "resolved");
    await second.select(prefix + "-result-business", "shuttle");
    const message = "130번 탑승구 앞 시연 만남 지점까지 이동을 지원했습니다.";
    await second.type(prefix + "-message", message);
    check(
      "completion requires direct confirmation of the pilot action",
      await second.$eval(
        card + " .business-result-form button",
        (b) => (b as HTMLButtonElement).disabled,
      ),
    );
    await second.click(card + " .business-confirm input");
    await act(second, "처리 결과 기록 후 완료");
    await passenger.bringToFront();
    await passenger.waitForSelector(".request-resolution");
    check(
      "passenger receives the recorded completion result",
      await passenger.$eval(
        ".request-resolution",
        (e, message) => e.textContent?.includes(message),
        message,
      ),
    );
    await shot(passenger, "09-passenger-result");
    await click(passenger, ".dx-toolbar a", "내 등록으로");
    await passenger.waitForSelector(".dx-pass-help");
    await passenger.waitForFunction(
      (message) =>
        document
          .querySelector(".request-resolution")
          ?.textContent?.includes(message),
      {},
      message,
    );
    check("saved registration also shows the same completed result", true);
    await shot(passenger, "10-registration-result");
    const history = (
      await api(desk, `/api/staff/requests/${request.id}/history`)
    ).body.history;
    check(
      "one audit trail covers assignment dispatch travel handover and completion",
      [
        "assign",
        "resource_assign",
        "travel",
        "arrive",
        "transfer",
        "serve",
        "complete",
      ].every((action) =>
        history.some((h: { action: string }) => h.action === action),
      ),
    );
    check(
      "completion releases equipment availability",
      (await api(desk, "/api/staff/resources")).body.resources.some(
        (g: { id: string; requestId: string | null }) =>
          g.id === gear.body.id && !g.requestId,
      ),
    );
    await desk.goto(base + "/staff/overview");
    await desk.waitForSelector(".overview-table");
    check(
      "business dashboard contains the completed outcome",
      await desk.$eval(
        '[data-result-kind="resolved"]',
        (e) => Number(e.textContent?.replace(/\D/g, "")) >= 1,
      ),
    );
    await shot(desk, "11-operations-overview");
    const overview = await api(desk, "/api/staff/overview");
    check(
      "dashboard completion totals reconcile",
      Object.values(overview.body.results as Record<string, number>).reduce(
        (n, v) => n + v,
        0,
      ) === overview.body.totals.todayCompleted,
    );
    check("no browser runtime errors", errors.length === 0);
    console.log(`Full demo journey checks: ${checks.length} passed`);
  } catch (error) {
    for (const [i, p] of (await browser.pages()).entries()) {
      await p
        .screenshot({ path: `${out}/failure-${i}.png`, fullPage: true })
        .catch(() => {});
      console.log(
        "Stopped screen",
        await p.$eval("h1", (e) => e.textContent).catch(() => "no heading"),
      );
    }
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
