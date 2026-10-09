import { config } from "./config";
import type { Db } from "./db";
import { ingestFlights, recordPoll } from "./flights/ingest";
import { issuePass, passUrl } from "./passes";
import { eraseRegistration } from "./purge";
import { createRegistration, type Lang } from "./registrations";
import { mockFlights } from "./setup";

// 시연용 패스. 키오스크에 찍으면 저마다 다른 안내가 나오도록 고른 항목을 다르게 했다. 모의 데이터 모드에서만 쓴다.
// 이름은 없다. 장면 이름은 시연하는 사람이 QR 을 고를 때 보는 것이고 어디에도 저장하지 않는다.
export const DEMO: { scene: string; flightNo: string; lang?: Lang; choices: string[] }[] = [
  {
    scene: "큰 글씨 · 휠체어 이용 (제안서 예시)",
    flightNo: "MK127",
    choices: ["gd_large", "mov_wheelchair_own", "fac_restroom", "stf_self"],
  },
  { scene: "소리 안내 · 쉬어 가기", flightNo: "MK111", choices: ["gd_voice", "mov_need_rest", "fac_rest", "stf_call"] },
  { scene: "쉬운 말 · 그림 · 심리안정실", flightNo: "MK112", choices: ["gd_easy", "gd_picture", "fac_calm", "stf_call"] },
  { scene: "영어 · 계단 어려움 · 라운지", flightNo: "MK102", lang: "en", choices: ["mov_no_stairs", "fac_lounge", "stf_self"] },
  { scene: "휠체어 필요 · 직원 호출 (공동운항)", flightNo: "MC830", choices: ["mov_wheelchair_need", "stf_call"] },
  { scene: "수유실 · 쉴 곳 (제2여객터미널)", flightNo: "MK221", choices: ["fac_nursing", "fac_rest", "stf_self"] },
  { scene: "큰 글씨 · 서 있기 어려움 (지연 편)", flightNo: "MK250", choices: ["gd_large", "mov_no_standing"] },
  { scene: "탑승구 미정", flightNo: "MK900", choices: ["mov_no_stairs", "fac_restroom"] },
  { scene: "그림 · 계단 어려움 (제1여객터미널)", flightNo: "MK501", choices: ["gd_picture", "mov_no_stairs", "fac_rest"] },
  { scene: "고른 것 없음 (기본 화면)", flightNo: "MK112", choices: [] },
];

// 모의 운항의 출발 시각을 이만큼 늘린다. 가장 이른 편이 약 1시간 뒤, 가장 늦은 편이 약 16시간 뒤에 떠난다.
const STRETCH = 4;

export interface DemoPass {
  scene: string;
  flightNo: string;
  passNo: string;
  /** 패스 QR 에 들어가는 주소. 운영자에게만 돌려준다. */
  url: string;
}

/**
 * 시연용 패스를 만든다. 다시 부르면 모의 항공편에 걸린 등록을 모두 지우고 새로 넣는다.
 * 실제 여객 정보가 섞이지 않도록 모의 데이터 모드에서만 동작한다.
 */
export async function seedDemo(db: Db, now: Date): Promise<{ ok: true; passes: DemoPass[] } | { ok: false; error: string }> {
  if (config.dataMode !== "mock") return { ok: false, error: "시연용 패스는 DATA_MODE=mock 에서만 만들 수 있습니다" };

  const old = await db.query<{ id: string }>(
    `select id from registrations
     where is_mock and status in ('pending', 'active') and (flight_no like 'MK%' or flight_no like 'MC%')`,
  );
  for (const r of old) await eraseRegistration(db, r.id, now, "revoked");

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
        flightDate: flight.flightDate,
        flightNo: flight.flightNo,
        choices: d.choices,
        lang: d.lang ?? "ko",
        route: "web",
        consent: true,
        startedAt: new Date(now.getTime() - 60_000),
        editCount: 0,
      },
      now,
    );
    if (!reg.ok) return { ok: false, error: `${d.scene}: ${reg.error}` };
    const pass = await issuePass(db, reg.registration.id, now);
    if (!pass.ok) return { ok: false, error: `${d.scene}: 패스를 만들지 못했습니다` };
    passes.push({ scene: d.scene, flightNo: d.flightNo, passNo: pass.passNo, url: passUrl(config.baseUrl, pass.token) });
  }
  return { ok: true, passes };
}
