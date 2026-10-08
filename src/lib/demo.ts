import { config } from "./config";
import type { Db } from "./db";
import { ingestFlights, recordPoll } from "./flights/ingest";
import { generatePasses, linkPass, nextIdleToken } from "./passes";
import { eraseRegistration } from "./purge";
import { createRegistration } from "./registrations";
import { mockFlights } from "./setup";

// 시연용 여객. 실제로 찍으면 여객 카드가 열리는 패스를 만들어 준다. 모의 데이터 모드에서만 쓴다.
// 이름은 모두 지어낸 것이다. 마감 임박, 지연, 탑승구 미정, 공동운항, 장비·인력 요청이 골고루 들어 있다.
const DEMO: { name: string; flightNo: string; categories: string[]; needs: string[] }[] = [
  { name: "김영희", flightNo: "MK101", categories: ["cat_senior"], needs: ["mov_need_rest", "com_slow"] },
  {
    name: "박민수",
    flightNo: "MK102",
    categories: ["cat_disability"],
    needs: ["mov_wheelchair_own", "mov_no_stairs", "com_hearing", "com_written", "acc_companion"],
  },
  { name: "이정자", flightNo: "MK401", categories: ["cat_senior", "cat_disability"], needs: ["com_vision", "mov_escort"] },
  { name: "최서연", flightNo: "MK111", categories: ["cat_pregnant"], needs: ["mov_no_standing"] },
  { name: "정하준", flightNo: "MK221", categories: ["cat_infant"], needs: ["acc_stroller", "acc_companion"] },
  { name: "한미숙", flightNo: "MK250", categories: ["cat_senior"], needs: ["com_wayfinding", "env_quiet"] },
  { name: "오대기", flightNo: "MK900", categories: ["cat_disability"], needs: ["mov_wheelchair_need"] },
  { name: "윤공동", flightNo: "MC830", categories: ["cat_child"], needs: ["acc_companion"] },
  { name: "강도쿄", flightNo: "MK501", categories: ["cat_senior"], needs: ["mov_no_stairs"] },
];

// 모의 운항의 출발 시각을 이만큼 늘린다. 가장 이른 편이 약 2시간 뒤, 가장 늦은 편이 약 13시간 뒤에 떠난다.
const STRETCH = 4;

export interface DemoPass {
  name: string;
  flightNo: string;
  passNo: string;
  /** 패스 QR 에 들어가는 주소. 운영자에게만 돌려준다. */
  url: string;
}

/**
 * 시연용 여객을 넣고 패스를 연결한다. 다시 부르면 앞서 넣은 시연용 여객을 지우고 새로 넣는다.
 * 실제 여객 정보가 섞이지 않도록 모의 데이터 모드에서만 동작한다.
 */
export async function seedDemo(db: Db, now: Date): Promise<{ ok: true; passes: DemoPass[] } | { ok: false; error: string }> {
  if (config.dataMode !== "mock") return { ok: false, error: "시연용 여객은 DATA_MODE=mock 에서만 넣을 수 있습니다" };

  // 앞서 넣은 시연용 여객을 지운다. 연결된 패스는 끝낸다.
  const old = await db.query<{ id: string; needs: string[]; categories: string[] }>(
    `select id, needs, categories from registrations
     where is_mock and status in ('pending', 'active') and name = any($1) and flight_no = any($2)`,
    [DEMO.map((d) => d.name), DEMO.map((d) => d.flightNo)],
  );
  for (const r of old) await eraseRegistration(db, r.id, r.needs, r.categories, null, now, "revoked");

  await db.query("delete from flights where airline like '모의%'");
  const flights = mockFlights(now, STRETCH);
  await ingestFlights(db, flights, now);
  await recordPoll(db, { at: now, ok: true, rowCount: flights.length, durationMs: 0, gateChanges: 0 });

  const passes: DemoPass[] = [];
  for (const d of DEMO) {
    const flight = flights.find((f) => f.flightNo === d.flightNo);
    if (!flight) continue;
    const reg = await createRegistration(
      db,
      {
        name: d.name,
        flightDate: flight.flightDate,
        flightNo: flight.flightNo,
        categories: d.categories,
        needs: d.needs,
        route: "assisted",
        consent: true,
        startedAt: new Date(now.getTime() - 90_000),
        editCount: 0,
      },
      now,
    );
    if (!reg.ok) return { ok: false, error: `${d.name}: ${reg.error}` };
    let token = await nextIdleToken(db);
    if (!token) token = (await generatePasses(db, 1))[0].token;
    const link = await linkPass(db, token, reg.registration.id, now);
    if (!link.ok) return { ok: false, error: `${d.name}: 패스를 연결하지 못했습니다` };
    passes.push({ name: d.name, flightNo: d.flightNo, passNo: link.passNo, url: `${config.baseUrl}/p/${token}` });
  }
  return { ok: true, passes };
}
