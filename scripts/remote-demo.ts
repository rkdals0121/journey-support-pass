/**
 * 시연용 패스를 만들고, 그 QR 을 한 장짜리 그림과 A4 PDF 로 뽑는다.
 * 여기서 나온 QR 은 안내 키오스크 화면에 보여 주면 실제로 그 패스의 안내가 열린다.
 *
 *   npx tsx scripts/remote-demo.ts "저장할 폴더"            배포된 곳 (.env.deploy.local 의 BASE_URL, CRON_SECRET)
 *   npx tsx scripts/remote-demo.ts "저장할 폴더" --local    이 컴퓨터의 개발 서버 (http://localhost:3000)
 *
 * 다시 실행하면 모의 항공편에 걸린 등록은 모두 지워지고(그 패스는 못 쓰게 된다) 새로 만들어진다.
 * 모의 운항은 지금 시각 기준으로 1~16시간 뒤에 떠나도록 들어간다. 떠난 뒤에는 등록이 지워지므로 그때 다시 실행한다.
 * 이름은 없다. 장면 이름은 QR 을 고르기 쉽게 붙인 것이고 서버에 저장하지 않는다.
 */
import path from "node:path";
import { checkSheetWritable, loadDeployEnv, writeSheet, type DemoPass } from "./demo-sheet";

const NAME = "시연용_패스QR";

(async () => {
  const local = process.argv.includes("--local");
  const out = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? ".");
  if (!local) loadDeployEnv();
  const base = local ? "http://localhost:3000" : process.env.BASE_URL;
  // 개발 서버는 .env.local 의 값을, 없으면 개발용 기본값을 쓴다.
  const secret = local ? (process.env.CRON_SECRET ?? "dev-only-secret-change-me") : process.env.CRON_SECRET;
  if (!base || !secret) throw new Error(".env.deploy.local 에 BASE_URL 과 CRON_SECRET 이 필요합니다.");
  // 서버를 부르면 이전 패스가 바로 못 쓰게 되므로, 저장할 수 없는 상태면 그 전에 멈춘다.
  checkSheetWritable(out, NAME);

  const res = await fetch(`${base}/api/admin/demo`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  const body = (await res.json()) as { ok: boolean; error?: string; passes?: DemoPass[] };
  if (!res.ok || !body.ok || !body.passes) throw new Error(`실패 ${res.status}: ${body.error ?? ""}`);

  if (body.passes.some((p) => !p.url.startsWith(base.toUpperCase()))) {
    console.log(`주의: QR 주소가 ${base} 로 시작하지 않습니다. 서버의 BASE_URL 설정을 확인하세요.`);
  }
  // 주소(QR 값)는 화면에 찍지 않는다. 번호와 장면만 보여준다.
  // 저장보다 먼저 찍는다. 저장이 실패해도 키오스크에 고유 일련 번호를 눌러 새 패스를 쓸 수 있다.
  for (const p of body.passes) console.log(`${p.passNo.slice(0, 3)} ${p.passNo.slice(3)}  ${p.flightNo}  ${p.scene}`);
  await writeSheet(base, body.passes, out, NAME);
  console.log(`\n${path.join(out, `${NAME}.png`)} 과 .pdf 로 저장했습니다.`);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
