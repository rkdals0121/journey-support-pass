/**
 * 배포된 곳의 시범 측정값을 내려받아 out/summary.json 에 저장하고 화면에 요약을 찍는다.
 *
 *   npx tsx scripts/remote-metrics.ts          최근 14일
 *   npx tsx scripts/remote-metrics.ts 30       최근 30일
 *
 * 제안서의 "기대 효과와 확인 방법" 세 가지에 해당하는 숫자다.
 * 건수와 가운데값뿐이며, 항공편이나 여객이 고른 항목은 들어 있지 않다.
 *
 * .env.deploy.local 의 BASE_URL 과 CRON_SECRET 을 쓴다.
 */
import fs from "node:fs";
import path from "node:path";
import { loadDeployEnv } from "./demo-sheet";

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
  const res = await fetch(`${base}/api/admin/metrics?days=${days}`, { headers: { Authorization: `Bearer ${secret}` } });
  if (!res.ok) {
    console.error(res.status, await res.text());
    process.exitCode = 1;
    return;
  }
  const data = await res.json();
  const s = data.summary;
  const out = path.join(process.cwd(), "out");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(data, null, 2));

  const rate = (c: { rate: number | null; started: number; done: number }) =>
    c.rate === null ? "자료 없음" : `${c.rate}% (시작 ${c.started}, 완료 ${c.done})`;
  console.log(`최근 ${days}일`);
  console.log(`등록 ${s.registered}건: 휴대전화 ${s.byRoute.web}, 키오스크 ${s.byRoute.kiosk}, 직원이 대신 입력 ${s.byRoute.assisted}`);
  console.log(`1) 안내 화면 ${s.guideOpens}회, 만족도 ${s.survey.total}건 (도움 됨 ${s.survey.good}, 보통 ${s.survey.fair}, 안 됨 ${s.survey.poor})`);
  console.log(`2) 등록 완료 비율: 안내 방식을 켠 여객 ${rate(s.completion.adapted)}, 켜지 않은 여객 ${rate(s.completion.plain)}`);
  console.log(`3) 직원 부르기 ${s.calls.total}회 (등록 중 ${s.calls.fromRegister}, 안내 중 ${s.calls.fromGuide}), 받기까지 가운데값 ${s.calls.medianAcceptSec ?? "-"}초`);
  console.log("운항 수집", JSON.stringify(data.polls));
  console.log("out/summary.json 에 저장했습니다.");
})();
