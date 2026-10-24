import { cleanExtra, NO_EXTRA, validateChoices, type Extra } from "./catalog";
import { config } from "./config";
import type { Db } from "./db";
import { addDays, kstDate } from "./flights/normalize";
import { getFlight, operatingFlight } from "./flights/search";
import { departureAt, isDeparted } from "./timing";

/** 등록 경로: 여객 휴대전화(web), 공항 키오스크(kiosk), 직원이 대신 입력(assisted). */
export type Route = "web" | "kiosk" | "assisted";
export type RegistrationStatus = "pending" | "active" | "expired" | "revoked";
export type Lang = "ko" | "en";

export interface RegistrationInput {
  flightDate: string;
  flightNo: string;
  /** 여객이 고른 항목 코드 (체크리스트의 불편, 가지 안의 답, 함께 가는 분, 도움 방식, 들를 곳). */
  choices: string[];
  /** 함께 가는 분의 수, 유모차 수, 더 하고 싶은 말씀. 없으면 비워 둔다. */
  extra?: Extra;
  lang: Lang;
  route: Route;
  consent: boolean;
  startedAt: Date;
  editCount: number;
  /** 증빙서류를 냈는가. 휴대전화 등록에서만 받는다. 서류와 대상 유형은 받지 않는다(별도 서버가 맡는 구조). */
  proof?: boolean;
  /** 들어온 접점. booking 이면 항공권 예매 완료 창의 링크. */
  via?: "booking" | "";
}

export interface Registration {
  id: string;
  flightDate: string | null;
  flightNo: string | null;
  choices: string[];
  lang: Lang;
  route: Route;
  status: RegistrationStatus;
  submittedAt: Date;
  proofVerified: boolean;
}

interface Row {
  id: string;
  flight_date: string | null;
  flight_no: string | null;
  needs: string[];
  lang: string;
  route: Route;
  status: RegistrationStatus;
  submitted_at: Date;
  proof_status: string;
}

const COLUMNS = "id, flight_date::text as flight_date, flight_no, needs, lang, route, status, submitted_at, proof_status";

function toRegistration(r: Row): Registration {
  return {
    id: r.id,
    flightDate: r.flight_date,
    flightNo: r.flight_no,
    choices: r.needs,
    lang: r.lang === "en" ? "en" : "ko",
    route: r.route,
    status: r.status,
    submittedAt: r.submitted_at,
    proofVerified: r.proof_status === "verified",
  };
}

/**
 * 등록을 받지 못한 까닭. 영어 화면이 상황에 맞는 영어 문구를 고르는 데 쓴다(한국어 화면은 error 문구를 그대로 보여 준다).
 * rate(너무 자주 등록)와 pass(패스를 만들지 못함)는 등록을 받는 쪽(registerHandler)이 붙인다.
 */
// 등록 작성 시간과 고친 횟수로 받아들이는 가장 큰 값. 실제 여객은 이보다 훨씬 작다.
const MAX_WRITE_MS = 24 * 60 * 60 * 1000;
const MAX_EDIT_COUNT = 1000;

export type RegistrationErrorCode = "departed" | "date" | "flight" | "consent" | "choices" | "rate" | "pass";

export type CreateResult =
  | { ok: true; registration: Registration }
  | { ok: false; error: string; code?: RegistrationErrorCode };

/**
 * 등록을 받는다. 이름·연락처·진단명은 받지 않는다. 받는 것은 항공편과 고른 항목뿐이다.
 * 패스는 이어서 issuePass 가 만든다.
 */
export async function createRegistration(db: Db, input: RegistrationInput, now: Date): Promise<CreateResult> {
  if (input.consent !== true) return { ok: false, error: "동의가 필요합니다", code: "consent" };

  const choiceError = validateChoices(input.choices);
  if (choiceError) return { ok: false, error: choiceError, code: "choices" };

  if (!["web", "kiosk", "assisted"].includes(input.route)) return { ok: false, error: "등록 경로가 맞지 않습니다" };

  const flight = await getFlight(db, input.flightDate, input.flightNo);
  if (!flight) return { ok: false, error: "편명을 다시 확인해 주세요", code: "flight" };
  // 오늘과 내일(한국 날짜) 편만 받는다. 화면의 편명 찾기가 보여주는 범위와 같다.
  // 어제 날짜 편도 받는다. 어제 밤 편이 자정을 넘겨 늦어지면 날짜는 어제여도 오늘 떠난다.
  // 이미 떠난 어제 편은 바로 아래의 "이미 출발한 편" 검사가 막는다.
  const today = kstDate(now);
  if (![addDays(today, -1), today, addDays(today, 1)].includes(flight.flightDate)) {
    return { ok: false, error: "오늘과 내일 출발하는 편만 등록할 수 있습니다", code: "date" };
  }
  // 이미 떠난 편으로는 받지 않는다. 받으면 곧바로 지워져 패스가 쓸모없어진다.
  // 공동운항이면 실제 운항 편의 시각으로 본다.
  const operating = await operatingFlight(db, flight);
  if (isDeparted(operating) || departureAt(operating) <= now) {
    return { ok: false, error: "이미 출발한 편입니다. 편명을 다시 확인해 주세요", code: "departed" };
  }

  // 화면이 보낸 시작 시각이 이상하면 제출 시각으로 둔다(작성 시간 0으로 집계).
  // 하루보다 앞선 시각도 이상한 값으로 본다. 1900년 같은 값을 그대로 두면 작성 시간이 집계의 정수 범위를 넘어 오늘 현황이 오류로 멈춘다.
  const startedAt =
    input.startedAt instanceof Date &&
    !Number.isNaN(input.startedAt.getTime()) &&
    input.startedAt <= now &&
    now.getTime() - input.startedAt.getTime() <= MAX_WRITE_MS
      ? input.startedAt
      : now;
  // 고친 횟수도 정수 칸에 들어갈 만큼으로 자른다. 지나치게 큰 값은 저장할 때 오류가 난다.
  const editCount = Number.isInteger(input.editCount) && input.editCount >= 0 ? Math.min(input.editCount, MAX_EDIT_COUNT) : 0;

  // 증빙은 여객이 스스로 하는 등록(휴대전화, 공항 입구 키오스크)에서 받는다. 서류는 그 기기 안에서 읽어 판정하고(docscan),
  // 서버에는 "확인됨"만 온다. 안내데스크의 대신 등록에는 증빙 단계가 없다(체크인 카운터에서 확인받는다).
  const proof = input.route !== "assisted" && input.proof === true ? "verified" : "none";
  const via = input.route === "web" && input.via === "booking" ? "booking" : "";
  const extra = cleanExtra(input.extra ?? NO_EXTRA);
  const [row] = await db.query<Row>(
    `insert into registrations
       (flight_date, flight_no, needs, lang, route, consent_at, started_at, submitted_at, edit_count, is_mock, proof_status, via,
        party_size, stroller_count, note)
     values ($1, $2, $3, $4, $5, $6, $7, $6, $8, $9, $10, $11, $12, $13, $14)
     returning ${COLUMNS}`,
    [
      flight.flightDate,
      flight.flightNo,
      input.choices,
      input.lang === "en" ? "en" : "ko",
      input.route,
      now,
      startedAt,
      editCount,
      config.dataMode === "mock",
      proof,
      via,
      extra.party,
      extra.strollers,
      extra.note || null,
    ],
  );
  return { ok: true, registration: toRegistration(row) };
}

/**
 * 공항 안내 키오스크에서 여객이 미리 등록한 내용을 고친다(피드백: 키오스크에서 수정 가능해야 함).
 * 항공편은 탑승권으로 정해졌으므로 고치지 않는다. 고른 항목과 함께 받은 숫자·말씀만 바꾸고 고친 횟수를 올린다.
 */
export async function updateNeeds(db: Db, id: string, choices: string[], extra: Extra): Promise<{ ok: true } | { ok: false; error: string }> {
  const choiceError = validateChoices(choices);
  if (choiceError) return { ok: false, error: choiceError };
  if (!isUuid(id)) return { ok: false, error: "등록을 찾을 수 없습니다" };
  const clean = cleanExtra(extra);
  const rows = await db.query<{ id: string }>(
    `update registrations set needs = $2, party_size = $3, stroller_count = $4, note = $5,
       edit_count = least(edit_count + 1, ${MAX_EDIT_COUNT})
     where id = $1 and status = 'active' returning id`,
    [id, choices, clean.party, clean.strollers, clean.note || null],
  );
  return rows[0] ? { ok: true } : { ok: false, error: "등록을 찾을 수 없습니다" };
}

export async function getRegistration(db: Db, id: string): Promise<Registration | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.query<Row>(`select ${COLUMNS} from registrations where id = $1`, [id]);
  return row ? toRegistration(row) : null;
}

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
