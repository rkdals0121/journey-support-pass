import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import QRCode from "qrcode";


// 점검용 브라우저가 쓰는 임시 폴더. 끝나면 지운다. 지우지 않으면 돌릴 때마다 수십 MB 씩 쌓인다.
const tempProfiles: string[] = [];
function tempProfile(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempProfiles.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const dir of tempProfiles) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // 브라우저가 아직 잡고 있으면 남겨 둔다.
    }
  }
});

export interface DemoPass {
  scene: string;
  flightNo: string;
  passNo: string;
  url: string;
}

export function loadDeployEnv(): void {
  const file = path.join(process.cwd(), ".env.deploy.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const fmt = (n: string) => `${n.slice(0, 3)} ${n.slice(3)}`;

/** 시연용 패스의 QR 을 한 장짜리 그림과 A4 PDF 로 뽑는다. 장면 이름은 시연하는 사람이 고르기 쉽게 붙인 것이다. */
export async function writeSheet(base: string, passes: DemoPass[], outDir: string, name: string): Promise<void> {
  const cells = await Promise.all(
    passes.map(async (p) => {
      const svg = await QRCode.toString(p.url, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
      return `<div class="pass">${svg}<div class="no">${fmt(p.passNo)}</div><div class="who">${p.scene}<br>${p.flightNo}</div></div>`;
    }),
  );
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    html, body { background: #fff; }
    body { margin: 0; padding: 10mm; font-family: "Malgun Gothic", sans-serif; color: #0f231b; }
    @media print { body { padding: 0; } }
    h1 { font-size: 15pt; margin: 0 0 2mm; }
    p { font-size: 9.5pt; margin: 0 0 6mm; color: #52635a; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
    .pass { border: 1px dashed #999; border-radius: 3mm; padding: 3mm 3mm 3mm; text-align: center; break-inside: avoid; background: #fff; }
    .pass svg { width: 40mm; height: 40mm; display: block; margin: 0 auto; }
    .no { font-family: "Arial Narrow", Arial, sans-serif; font-weight: 700; font-size: 18pt; letter-spacing: 0.1em; }
    .who { font-size: 8.5pt; color: #52635a; line-height: 1.35; }
  </style></head><body>
    <h1>Journey Support Pass · 시연용 패스</h1>
    <p>${base} 의 안내 키오스크 화면(/kiosk 에서 설치)에 QR 을 보여 주거나 번호를 누르면, 장면마다 다른 안내가 나옵니다.
    휴대전화 기본 카메라로 찍으면 그 패스의 화면이 열립니다. 모두 모의 항공편이며 출발하면(가장 이른 편이 약 1시간 뒤) 차례로 지워집니다.
    만든 때: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
    <div class="grid">${cells.join("")}</div>
  </body></html>`;

  const chrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    userDataDir: tempProfile("jsp-demo-"),
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
  await page.setContent(html);
  fs.mkdirSync(outDir, { recursive: true });
  await page.pdf({ path: path.join(outDir, `${name}.pdf`), format: "A4", printBackground: true });
  await page.screenshot({ path: path.join(outDir, `${name}.png`) as `${string}.png`, fullPage: true });
  await browser.close();
}
