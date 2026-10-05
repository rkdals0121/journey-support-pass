/**
 * 이 컴퓨터의 내장 DB 에 구역·패스·(선택) 모의 운항을 채운다. 미사용 패스는 30장이 되도록 채운다.
 *
 *   npm run seed                      구역과 패스만
 *   npm run seed -- --mock-flights    지금 시각 기준의 모의 운항까지
 *
 * 개발 서버가 떠 있으면 먼저 끄고 실행한다. 로컬 내장 DB 는 한 번에 한 프로세스만 연다.
 * 여러 번 실행해도 안전하다. 모의 운항은 실행할 때마다 지금 시각 기준으로 다시 맞춘다.
 *
 * 배포 DB 는 이 스크립트가 아니라 scripts/remote-setup.ts 로 채운다.
 */
import { getDb } from "../src/lib/db";
import { runSetup } from "../src/lib/setup";
import { readSeedZones } from "../src/lib/zones";

(async () => {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    console.error("배포 DB 주소가 설정되어 있습니다. 배포 DB 는 scripts/remote-setup.ts 로 채우세요.");
    process.exit(1);
  }

  // 로컬에서는 seed-zones.json 에 적힌 시범용 코드를 그대로 쓴다.
  const result = await runSetup(
    await getDb(),
    { codes: {}, requireAllCodes: false, mockFlights: process.argv.includes("--mock-flights") },
    new Date(),
  );
  if (!result.ok) throw new Error(result.error);

  console.log(`구역 ${result.zones}곳 적재`);
  console.log(`미사용 패스 ${result.idlePasses}장 (새로 만든 것 ${result.newPasses}장)`);
  if (result.mockFlights) console.log(`모의 운항 ${result.mockFlights.length}편 적재: ${result.mockFlights.join(", ")}`);

  console.log("\n시범용 접속 코드 (모의 데이터 전용)");
  for (const z of readSeedZones().filter((z) => z.active)) console.log(`  ${z.code}  ${z.label}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
