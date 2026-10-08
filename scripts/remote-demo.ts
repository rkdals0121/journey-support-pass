/**
 * 배포된 곳에 시연용 여객을 넣고, 그 패스 QR 을 한 장짜리 그림과 A4 PDF 로 뽑는다.
 * 여기서 나온 QR 은 직원으로 로그인해 찍으면 실제로 여객 카드가 열린다.
 *
 *   npx tsx scripts/remote-demo.ts "저장할 폴더"
 *
 * 다시 실행하면 앞서 넣은 시연용 여객은 지워지고(그 패스는 못 쓰게 된다) 새로 만들어진다.
 * 모의 운항은 지금 시각 기준으로 2~13시간 뒤에 떠나도록 들어간다. 떠난 뒤에는 여객이 지워지므로 그때 다시 실행한다.
 * 여객 이름은 모두 지어낸 것이다. 필요한 것: .env.deploy.local 의 BASE_URL, CRON_SECRET.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import QRCode from "qrcode";

function loadDeployEnv() {
  const file = path.join(process.cwd(), ".env.deploy.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

interface DemoPass {
  name: string;
  flightNo: string;
  passNo: string;
  url: string;
}

(async () => {
  loadDeployEnv();
  const out = path.resolve(process.argv[2] ?? ".");
  const base = process.env.BASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) throw new Error(".env.deploy.local 에 BASE_URL 과 CRON_SECRET 이 필요합니다.");

  const res = await fetch(`${base}/api/admin/demo`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  const body = (await res.json()) as { ok: boolean; error?: string; passes?: DemoPass[] };
  if (!res.ok || !body.ok || !body.passes) throw new Error(`실패 ${res.status}: ${body.error ?? ""}`);

  const wrongHost = body.passes.filter((p) => !p.url.startsWith(base));
  if (wrongHost.length > 0) console.log(`주의: QR 주소가 ${base} 로 시작하지 않습니다. 서버의 BASE_URL 설정을 확인하세요.`);

  const cells = await Promise.all(
    body.passes.map(async (p) => {
      const svg = await QRCode.toString(p.url, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
      return `<div class="pass">${svg}<div class="no">${p.passNo}</div><div class="who">${p.name} · ${p.flightNo}</div></div>`;
    }),
  );
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    html, body { background: #fff; }
    body { margin: 0; padding: 10mm; font-family: "Malgun Gothic", sans-serif; color: #0f231b; }
    @media print { body { padding: 0; } }
    h1 { font-size: 15pt; margin: 0 0 2mm; }
    p { font-size: 9.5pt; margin: 0 0 6mm; color: #5a6b62; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
    .pass { border: 1px dashed #999; border-radius: 3mm; padding: 3mm 3mm 4mm; text-align: center; break-inside: avoid; background: #fff; }
    .pass svg { width: 44mm; height: 44mm; display: block; margin: 0 auto; }
    .no { font-family: "Arial Narrow", Arial, sans-serif; font-weight: 700; font-size: 20pt; letter-spacing: 0.14em; }
    .who { font-size: 9pt; color: #5a6b62; }
  </style></head><body>
    <h1>Journey Support Pass · 시연용 패스 (찍으면 열립니다)</h1>
    <p>${base} 에 직원으로 로그인한 뒤 "패스 스캔"에서 찍으면 여객 카드가 열립니다. 여객은 모두 지어낸 이름이고,
    모의 항공편이 떠나면(가장 이른 편이 약 2시간 뒤) 차례로 지워집니다. 만든 때: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
    <div class="grid">${cells.join("")}</div>
  </body></html>`;

  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(
    (p) => fs.existsSync(p),
  );
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "jsp-demo-")),
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.pdf({ path: path.join(out, "시연용_패스QR.pdf"), format: "A4", printBackground: true });
  await page.screenshot({ path: path.join(out, "시연용_패스QR.png") as `${string}.png`, fullPage: true });
  await browser.close();
  // 주소(토큰)는 화면에 찍지 않는다. 번호와 이름만 보여준다.
  for (const p of body.passes) console.log(`${p.passNo}  ${p.name}  ${p.flightNo}`);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
