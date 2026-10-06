/**
 * 배포된 곳의 시범 측정값을 내려받아 out/ 에 CSV 로 저장한다.
 *
 *   npx tsx scripts/remote-metrics.ts          최근 14일
 *   npx tsx scripts/remote-metrics.ts 30       최근 30일
 *
 * 만들어지는 파일
 *   out/registrations.csv   등록 경로, 시간대, 작성 시간, 수정 횟수, 패스 연결까지 걸린 시간
 *   out/encounters.csv      구역, 탑승구 위치, 시간대, 스캔→응대 시작, 응대 시간, 지원 종류
 * 이름·편명·필요한 도움은 들어 있지 않다.
 *
 * .env.deploy.local 의 BASE_URL 과 CRON_SECRET 을 쓴다.
 */
import fs from "node:fs";
import path from "node:path";

function loadDeployEnv() {
  const file = path.join(process.cwd(), ".env.deploy.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("|") : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  // 엑셀이 한글을 깨지 않게 BOM 을 붙인다.
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

(async () => {
  loadDeployEnv();
  const base = process.env.BASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(".env.deploy.local 에 BASE_URL 과 CRON_SECRET 이 필요합니다.");
    process.exitCode = 1;
    return;
  }
  const days = Number(process.argv[2]) || 14;
  const res = await fetch(`${base}/api/admin/metrics?days=${days}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(res.status, await res.text());
    process.exitCode = 1;
    return;
  }
  const data = await res.json();
  const out = path.join(process.cwd(), "out");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "registrations.csv"), toCsv(data.registrations));
  fs.writeFileSync(path.join(out, "encounters.csv"), toCsv(data.encounters));
  console.log(`최근 ${days}일: 등록 ${data.registrations.length}건, 응대 기록 ${data.encounters.length}건`);
  console.log("운항 수집", JSON.stringify(data.polls));
  console.log("out/registrations.csv, out/encounters.csv 에 저장했습니다.");
})();
