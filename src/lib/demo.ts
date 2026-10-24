import { config } from "./config";
import type { Db } from "./db";
import { ingestFlights, recordPoll, SEED_POLL } from "./flights/ingest";
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
    choices: ["tr_walk", "tr_see", "mov_wheelchair_own", "bug_later", "gd_large", "cmp_alone", "stf_call", "fac_restroom"],
  },
  {
    scene: "소리 안내 · 흰지팡이 · 로봇 동행",
    flightNo: "MK111",
    choices: ["tr_see", "gd_voice", "see_cane", "robot_hold", "cmp_alone", "stf_robot", "fac_restroom"],
  },
  {
    scene: "쉬운 말 · 그림 · 조용히 쉴 곳",
    flightNo: "MK112",
    choices: ["tr_understand", "gd_easy", "gd_picture", "und_slow", "cmp_with", "stf_call", "fac_calm"],
  },
  {
    scene: "영어 · 계단 어려움 · 약국",
    flightNo: "MK102",
    lang: "en",
    choices: ["tr_walk", "mov_no_stairs", "bug_no", "cmp_alone", "stf_call", "stp_pharmacy"],
  },
  {
    scene: "휠체어 대여 · 전동차 · 직원 방문 (공동운항)",
    flightNo: "MC830",
    choices: ["tr_walk", "mov_wheelchair_need", "bug_ride", "cmp_with", "stf_visit", "stf_escort"],
  },
  {
    scene: "아이와 함께 · 유모차 · 수유실 (제2여객터미널)",
    flightNo: "MK221",
    choices: ["tr_child", "chd_feed", "chd_diaper", "chd_stroller_own", "cmp_with", "stf_call", "fac_nursing", "stp_food"],
  },
  {
    scene: "큰 글씨 · 앉을 곳 (지연 편)",
    flightNo: "MK250",
    choices: ["tr_stand", "tr_see", "mov_no_standing", "gd_large", "cmp_alone", "stf_call"],
  },
  { scene: "탑승구 미정", flightNo: "MK900", choices: ["tr_walk", "mov_no_stairs", "fac_restroom"] },
  {
    scene: "글로 안내 · 수어 (제1여객터미널)",
    flightNo: "MK501",
    choices: ["tr_hear", "hear_text", "hear_sign", "cmp_alone", "stf_visit", "fac_restroom"],
  },
  { scene: "고른 것 없음 (기본 화면)", flightNo: "MK112", choices: ["tr_none", "stp_none"] },
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

  // 모의 항공편에 걸린 등록은 그 편의 행(항공사가 "모의"로 시작)으로 고른다. 편명 앞 글자로만 고르면
  // 새로 늘어난 편(MQ·MZ)을 빠뜨려, 그 등록이 다시 넣은 편에 붙어 남거나 편 없는 등록으로 남는다.
  // 편 행이 이미 지워진 등록만 편명 앞 글자로 고른다(같은 편명의 실제 편에 걸린 등록은 건드리지 않는다).
  const old = await db.query<{ id: string }>(
    `select r.id from registrations r
     left join flights f on f.flight_date = r.flight_date and f.flight_no = r.flight_no
     where r.is_mock and r.status in ('pending', 'active')
       and (f.airline like '모의%' or (f.flight_no is null and left(r.flight_no, 2) in ('MK', 'MC', 'MQ', 'MZ')))`,
  );
  for (const r of old) await eraseRegistration(db, r.id, now, "revoked");

  await db.query("delete from flights where airline like '모의%'");
  const flights = mockFlights(now, STRETCH);
  await ingestFlights(db, flights, now);
  // 실제 수집이 아니라는 표시(SEED_POLL)를 남긴다. 실제 수집이 멈춘 동안 시연용 패스를 만들어도 경고가 가려지지 않게 한다.
  await recordPoll(db, { at: now, ok: true, rowCount: flights.length, durationMs: 0, gateChanges: 0, error: SEED_POLL });

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
