/**
 * 미사용 패스의 QR 인쇄용 HTML 을 만든다 → out/passes.html
 *
 *   BASE_URL="https://배포주소" npx tsx scripts/print-passes.ts
 *
 * 한 장에는 QR 과 패스 번호 네 자리만 넣는다. 이름·날짜·그 밖의 글자는 넣지 않는다.
 * BASE_URL 이 바뀌면 QR 도 달라지므로, 배포 주소가 정해진 뒤에 인쇄할 것.
 * 개발 서버가 떠 있으면 먼저 끄고 실행한다.
 */
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { config } from "../src/lib/config";
import { getDb } from "../src/lib/db";

(async () => {
  const db = await getDb();
  const passes = await db.query<{ token: string; pass_no: string }>(
    "select token, pass_no from passes where state = 'idle' order by pass_no",
  );
  if (passes.length === 0) {
    console.error("미사용 패스가 없습니다. 먼저 npm run seed 를 실행하세요.");
    process.exit(1);
  }

  const cells: string[] = [];
  for (const p of passes) {
    const svg = await QRCode.toString(`${config.baseUrl}/p/${p.token}`, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
    });
    cells.push(`<div class="pass">${svg}<div class="no">${p.pass_no}</div></div>`);
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Journey Support Pass 인쇄용</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { margin: 0; font-family: "Malgun Gothic", sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6mm; }
  .pass { border: 0.3mm dashed #999; padding: 3mm; text-align: center; break-inside: avoid; }
  .pass svg { width: 25mm; height: 25mm; }
  .no { font-size: 16pt; font-weight: 700; letter-spacing: 0.1em; }
</style>
</head>
<body>
<div class="sheet">
${cells.join("\n")}
</div>
</body>
</html>
`;
  const out = path.join(process.cwd(), "out");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "passes.html"), html);
  console.log(`out/passes.html 에 ${passes.length}장 (QR 주소: ${config.baseUrl}/p/…)`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
