import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import sharp from "sharp";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { readSeedZones } from "../src/lib/zones";
// 시연 예약의 출발일은 「내일」이라 날마다 바뀐다. 고정 그림(tests/fixtures/boarding)은 2026-10-28 용이라
// 그날이 아니면 맞지 않으므로, 점검할 때마다 그 날짜의 휴대전화 QR·종이 PDF417(돌린 그림)을 새로 만든다.
async function boardingArtwork(out: string, flightDate: string) {
  prepareZXingModule({
    overrides: { wasmBinary: Uint8Array.from(fs.readFileSync("node_modules/zxing-wasm/dist/writer/zxing_writer.wasm")).buffer },
    fireImmediately: true,
  });
  const payload = `BP1:${flightDate.replaceAll("-", "")}:DX9001:D3M0123456`;
  const make = async (format: "QRCode" | "PDF417", rotate: number, name: string) => {
    const r = await writeBarcode(payload, { format, scale: 4 });
    assert.ok(r.image, r.error);
    const file = path.resolve(out, name);
    await sharp(Buffer.from(await r.image.arrayBuffer()))
      .extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#fff" })
      .rotate(rotate)
      .png()
      .toFile(file);
    return file;
  };
  return { mobile: await make("QRCode", 0, "mobile-boarding.png"), paper: await make("PDF417", 90, "paper-boarding.png") };
}
async function main() {
  const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
  const local = ["localhost", "127.0.0.1"].includes(new URL(base).hostname);
  assert.ok(local || base === "https://journey-support-pass.vercel.app");
  const out = process.env.FEEDBACK_OUTPUT ?? ".e2e-shots/feedback";
  fs.mkdirSync(out, { recursive: true });
  const b = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const p = await b.newPage(),
    errors: string[] = [],
    checks: string[] = [];
  let token = "",
    assistedToken = "";
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(String(e)));
  const check = (n: string, v: unknown) => {
    assert.ok(v, n);
    checks.push(n);
    console.log("PASS", n);
  };
  async function api(page: Page, url: string, body: unknown) {
    return page.evaluate(
      async (url, body) => {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: await r.json() };
      },
      url,
      body,
    );
  }
  try {
    for (const width of [390, 1440]) {
      await p.setViewport({ width, height: 1000 });
      await p.goto(base + "/help?topic=facility&fresh=1");
      await p.waitForSelector("#task-facility");
      check(
        `${width}px facility example is explicit`,
        await p.$eval("#task-facility", (e) =>
          (e as HTMLInputElement).placeholder.includes("다음 단계"),
        ),
      );
      await p.type("#task-facility", "남자화장실");
      await p.type("#task-issue", "바닥에 물이 고여요");
      // 휴대전화·PC 모두 단계별 화면이다(요청 내용 → 위치 확인)
      await p.click("[data-request-next]");
      await p.waitForSelector("#report-area", { visible: true });
      await p.select("#report-area", "CONCOURSE");
      await p.select("#report-level", "2");
      await p.type("#report-location", "130번 탑승구 연결 통로 아래층");
      check(
        `${width}px report collects the actual floor and landmark`,
        !(await p.$("#dx-place-search")) && !!(await p.$("#report-location")),
      );
      check(
        `${width}px official floor map is available before selection`,
        !!(await p.$(".official-map-panel summary")),
      );
      await p.screenshot({
        path: `${out}/facility-location-${width}.png`,
        fullPage: true,
      });
      check(
        `${width}px redundant photo and area explanations removed`,
        await p.evaluate(
          () =>
            !document.body.textContent?.includes("구역으로 좁히기") &&
            !document.body.textContent?.includes("사진 이용 안내"),
        ),
      );
      check(
        `${width}px report skips generic extra preferences`,
        !(await p.$('[data-request-step="2"]')),
      );
      await p.click('input[required][type="checkbox"]');
      await p.click('button[type="submit"]');
      await p.waitForSelector(".request-review-card");
      check(
        `${width}px report reaches review`,
        await p.$eval(".request-review-card", (e) =>
          e.textContent?.includes("남자화장실"),
        ),
      );
      await p.screenshot({
        path: `${out}/facility-review-${width}.png`,
        fullPage: true,
      });
      // 이동 도움받기는 첫 화면(길 안내·도움 요청하기 등)에서 「도움 요청하기」로 들어가
      // 지도에서 만날 곳을 고른 뒤 「이 장소에서 도움받기」를 눌러야 필요한 도움(동행·휠체어·차량)을 고른다.
      await p.goto(base + "/help?topic=mobility&flow=staff&fresh=1");
      await p.waitForSelector("#mobility-start-fallback-search");
      await p.evaluate(() => {
        let d = document.querySelector("[data-place-finder]")?.closest("details") ?? null;
        while (d) {
          d.open = true;
          d = d.parentElement?.closest("details") ?? null;
        }
      });
      await p.type("#mobility-start-fallback-search", "130");
      await p.waitForSelector('[data-confirm-place="cc-130"]');
      await p.click('[data-confirm-place="cc-130"]');
      await p.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent?.includes("이 장소에서 도움받기") && !b.disabled,
        ),
      );
      await p.evaluate(() =>
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent?.includes("이 장소에서 도움받기"))
          ?.click(),
      );
      await p.waitForSelector('input[value="mobility-wheelchair"]');
      await p.click('input[value="mobility-wheelchair"]');
      check(
        `${width}px wheelchair handover asks no destination`,
        !(await p.$("#dx-destination")),
      );
      check(
        `${width}px mobility does not ask wheelchair or speech preferences again`,
        !(await p.$(".request-needs")) &&
          !(await p.$('[data-request-step="2"]')),
      );
      await p.click('input[required][type="checkbox"]');
      await p.click('button[type="submit"]');
      await p.waitForSelector(".request-review-card");
      check(
        `${width}px wheelchair choice retained in review`,
        await p.$eval(".request-review-card", (e) =>
          e.textContent?.includes("휠체어 지원"),
        ),
      );
      await p.goto(base + "/help?topic=traffic&fresh=1");
      await p.waitForSelector('[data-traffic-intent="info"]');
      await p.click('[data-traffic-intent="info"]');
      check(
        `${width}px information requests need no location or intake form`,
        !(await p.$("form")) && !!(await p.$('a[href="tel:15772600"]')),
      );
      await p.$eval(".traffic-information button.btn-primary", (e) =>
        (e as HTMLButtonElement).click(),
      );
      await p.waitForSelector("#task-zone");
      check(
        `${width}px transport avoids duplicate mandatory description`,
        !(await p.$("#task-issue")),
      );
      await p.goto(base + "/help?topic=other&fresh=1");
      await p.waitForSelector("#task-purpose");
      check(
        `${width}px customer does not classify staff business`,
        !(await p.$("#dx-business")),
      );
      await p.type("#task-purpose", "공항 이용 관련 문의");
      check(
        `${width}px no-meeting skips the entire location stage`,
        !(await p.$('[data-request-step="1"]')) &&
          !(await p.$("[data-request-next]")),
      );
      check(
        `${width}px other request defaults to no meeting`,
        (await p.$eval('[data-request-step="0"]', (e) =>
          e.textContent?.includes("만나지 않음"),
        )) && !(await p.$("#dx-place-search")),
      );
      await p.click('input[required][type="checkbox"]');
      await p.click('button[type="submit"]');
      await p.waitForSelector(".request-review-card");
      check(
        `${width}px no-meeting request reaches review without a fabricated pickup`,
        await p.$eval(".request-review-card", (e) =>
          e.textContent?.includes("만나지 않음"),
        ),
      );
      await p.screenshot({
        path: `${out}/other-review-${width}.png`,
        fullPage: true,
      });
      check(
        `${width}px short flows fit`,
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
    }
    await p.goto(base + "/help?topic=lost-property");
    await p.waitForSelector("h1");
    check(
      "lost property legacy entry leads to handover guidance",
      p.url().includes("/services/lost-property") && !(await p.$("form")),
    );
    await p.click('a[href^="/services/desks"]');
    await p.waitForSelector(".desk-locations");
    check(
      "information desk action opens actual terminal/floor locations",
      await p.$eval(".desk-locations", (e) =>
        e.textContent?.includes("8번 출입구"),
      ),
    );
    await p.goto(base + "/services");
    await p.waitForSelector("[data-service-topic]");
    check(
      "lost property is removed from the main service catalogue",
      !(await p.$('[data-service-topic="lost-property"]')),
    );
    if (local) {
      const h = (
        await api(p, "/api/booking/lookup", {
          airline: "demo",
          reference: "DEMO01",
          surname: "KIM",
        })
      ).body.handoff;
      const artwork = await boardingArtwork(out, h.flight.flightDate);
      const reg = await api(p, "/api/registrations", {
        flightDate: h.flight.flightDate,
        flightNo: h.flight.flightNo,
        bookingContext: h.context,
        choices: [],
        consent: true,
        lang: "ko",
      });
      assert.equal(reg.status, 200);
      token = reg.body.token;
      await p.goto(base + "/p/" + token);
      await p.waitForSelector(".ready-btn");
      await p.click(".ready-btn");
      await p.waitForSelector('.boarding-link-panel input[type="file"]');
      const linked = p.waitForResponse(
        (r) =>
          r.url().endsWith("/api/pass/boarding-link") &&
          r.request().method() === "POST",
      );
      await (await p.$('.boarding-link-panel input[type="file"]'))!.uploadFile(
        artwork.mobile,
      );
      check(
        "mobile QR image links existing boarding identity",
        (await linked).status() === 200,
      );
      // 연결 안내는 「준비 상황」 줄 안에 합쳐져 있다(따로 된 안내 칸은 없앰)
      await p.waitForFunction(() => document.body.innerText.includes("기존 탑승권에 지원정보가 연결됐어요"));
      check(
        "no new boarding or support QR is displayed",
        !(await p.$(".pass-qr-code")),
      );
      await p.screenshot({
        path: `${out}/boarding-linked.png`,
        fullPage: true,
      });
      const staff = await b.newPage();
      await staff.goto(base + "/staff/login");
      const zones = readSeedZones();
      await staff.evaluate(
        async (codes) => {
          await fetch("/api/admin/setup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer dx-local-check-only",
            },
            body: JSON.stringify({ codes }),
          });
        },
        Object.fromEntries(zones.map((z) => [z.id, z.code])),
      );
      assert.equal(
        (
          await api(staff, "/api/staff/login", {
            code: zones.find((z) => z.isDesk)!.code,
          })
        ).status,
        200,
      );
      await staff.goto(base + "/staff/desk");
      await staff.waitForSelector('.scan input[type="file"]');
      await (await staff.$('.scan input[type="file"]'))!.uploadFile(
        artwork.paper,
      );
      await staff.waitForSelector(".desk-found");
      check(
        "paper PDF417 resolves the same linked registration at the staff desk",
        await staff.$eval(".desk-found", (e) =>
          e.textContent?.includes("DX9001"),
        ),
      );
      await staff.goto(base + "/staff/desk/register");
      await staff.waitForSelector(".flow-cta .btn-primary");
      await staff.click(".flow-cta .btn-primary");
      await staff.waitForSelector(".flow-body h1");
      for (let i = 0; i < 20; i++) {
        const input = await staff.$("#reg-flight");
        if (input) {
          await input.type("DX9001");
          await staff.waitForSelector(".flight-opt");
          await staff.$eval(".flight-opt", (e) =>
            (e as HTMLButtonElement).click(),
          );
        }
        const primary = await staff.$eval(".flow-cta .btn-primary", (e) =>
          e.textContent?.trim(),
        );
        if (primary === "등록하기") break;
        const heading = await staff.$eval(
          ".flow-body h1",
          (e) => e.textContent,
        );
        await staff.$eval(".flow-cta .btn-primary", (e) =>
          (e as HTMLButtonElement).click(),
        );
        await staff.waitForFunction(
          (before) =>
            document.querySelector(".flow-body h1")?.textContent !== before,
          {},
          heading,
        );
      }
      const assistedDone = staff.waitForResponse(
        (r) =>
          r.url().endsWith("/api/desk/register") &&
          r.request().method() === "POST",
      );
      await staff.$eval(".flow-cta .btn-primary", (e) =>
        (e as HTMLButtonElement).click(),
      );
      const saved = await assistedDone;
      check(
        "assisted registration still saves successfully",
        saved.status() === 200,
      );
      assistedToken = (await saved.json()).token;
      await staff.waitForFunction(() =>
        document.body.textContent?.includes("지원정보 저장 완료"),
      );
      check(
        "assisted registration links an existing pass without QR or sticker issuance",
        !(await staff.$(".pass-qr")) &&
          !(await staff.$(".sticker")) &&
          !!(await staff.$('.scan input[type="file"]')),
      );
    }
    check("no runtime errors", errors.length === 0);
    fs.writeFileSync(
      `${out}/checks.json`,
      JSON.stringify({ checks, errors }, null, 2),
    );
  } finally {
    for (const owned of [token, assistedToken])
      if (owned)
        await api(p, "/api/pass/erase", { token: owned }).catch(() => {});
    await b.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
