/**
 * 배포된 서버의 초기 설정 통로(/api/admin/setup)를 부른다.
 * DB 비밀번호는 이 컴퓨터로 내려오지 않는다. 서버가 직접 테이블과 자료를 넣는다.
 *
 *   npx tsx scripts/remote-setup.ts                 테이블, 구역(접속 코드 포함), 패스. 여러 번 실행해도 안전하다
 *   npx tsx scripts/remote-setup.ts --mock-flights  모의 운항을 지금 시각 기준으로 채운다
 *   npx tsx scripts/remote-setup.ts --clear-mock    모의 운항을 지운다
 *
 * 배포된 곳은 실제 운항 정보를 받으므로 모의 운항은 평소에 넣지 않는다.
 * 정해진 장면(마감 임박, 공동운항, 탑승구 미정)을 보여줘야 하는 시연 때만 넣었다가 지운다.
 *
 * 필요한 것 (.env.deploy.local, 저장소에 올리지 않는다):
 *   BASE_URL      배포 주소
 *   CRON_SECRET   Vercel 에 넣은 것과 같은 값
 * 접속 코드는 db/zone-codes.local.json 에서 읽는다. 값을 화면에 찍지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { readLocalCodes } from "../src/lib/zones";

function loadDeployEnv() {
  const file = path.join(process.cwd(), ".env.deploy.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

(async () => {
  loadDeployEnv();
  const base = process.env.BASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(".env.deploy.local 에 BASE_URL 과 CRON_SECRET 이 필요합니다.");
    process.exit(1);
  }

  const mock = process.argv.includes("--mock-flights");
  const clear = process.argv.includes("--clear-mock");
  const body: Record<string, unknown> = mock ? { mockFlights: true } : clear ? { clearMockFlights: true } : {};
  if (!mock && !clear) {
    const codes = readLocalCodes();
    if (!codes) {
      console.error("db/zone-codes.local.json 이 없습니다. 배포용 접속 코드를 먼저 만드세요.");
      process.exit(1);
    }
    body.codes = codes;
  }

  const res = await fetch(`${base}/api/admin/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  console.log(res.status, JSON.stringify(await res.json()));
  process.exitCode = res.ok ? 0 : 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
