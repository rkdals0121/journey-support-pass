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

/** 그림과 PDF 를 뽑을 브라우저(Chrome, 없으면 Edge). 둘 다 없으면 멈춘다. */
export function findBrowser(): string {
  const found = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome 이나 Edge 가 설치되어 있지 않아 QR 을 그림과 PDF 로 뽑을 수 없습니다. 둘 중 하나를 설치하고 다시 실행하세요.");
  return found;
}

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

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    userDataDir: tempProfile("jsp-demo-"),
  });
  // 중간에 실패해도 브라우저는 꼭 닫는다. 열린 채로 끝나면 브라우저가 임시 폴더를 잡고 있어 위의 정리가 지우지 못한다.
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(html);
    fs.mkdirSync(outDir, { recursive: true });
    await page.pdf({ path: path.join(outDir, `${name}.pdf`), format: "A4", printBackground: true });
    await page.screenshot({ path: path.join(outDir, `${name}.png`) as `${string}.png`, fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 서버를 부르기 전에 결과를 저장할 수 있는지 먼저 본다.
 * 서버는 부르는 순간 이전 패스를 못 쓰게 하고 새 패스를 만든다. 그 뒤에 저장이 실패하면 새 패스의 QR 은 어디에도 남지 않는다.
 * 지난번 PDF 를 열어 둔 채로 다시 돌리는 일이 흔한데, Windows 는 열려 있는 파일에 쓰지 못한다.
 * 그림과 PDF 를 뽑을 브라우저가 없는 컴퓨터도 같은 일이 생기므로 함께 본다.
 */
export function checkSheetWritable(outDir: string, name: string): void {
  findBrowser();
  fs.mkdirSync(outDir, { recursive: true });
  for (const ext of ["pdf", "png"]) {
    const file = path.join(outDir, `${name}.${ext}`);
    if (!fs.existsSync(file)) continue;
    try {
      fs.closeSync(fs.openSync(file, "r+"));
    } catch {
      throw new Error(`${file} 에 쓸 수 없습니다. 이 파일을 연 창(PDF 보기 등)을 닫고 다시 실행하세요.`);
    }
  }
}
