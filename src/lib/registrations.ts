import { randomInt } from "node:crypto";
import { validateSelection } from "./catalog";
import { config } from "./config";
import type { Db } from "./db";
import { getFlight } from "./flights/search";

export type Route = "web" | "paper" | "assisted";
export type RegistrationStatus = "pending" | "active" | "expired" | "revoked";

export interface RegistrationInput {
  name: string;
  flightDate: string;
  flightNo: string;
  categories: string[];
  needs: string[];
  route: Route;
  consent: boolean;
  startedAt: Date;
  editCount: number;
}

export interface Registration {
  id: string;
  receiptNo: string | null;
  name: string | null;
  flightDate: string | null;
  flightNo: string | null;
  categories: string[];
  needs: string[];
  route: Route;
  status: RegistrationStatus;
  submittedAt: Date;
  linkedAt: Date | null;
}

interface Row {
  id: string;
  receipt_no: string | null;
  name: string | null;
  flight_date: string | null;
  flight_no: string | null;
  categories: string[];
  needs: string[];
  route: Route;
  status: RegistrationStatus;
  submitted_at: Date;
  linked_at: Date | null;
}

const COLUMNS = `id, receipt_no, name, flight_date::text as flight_date, flight_no, categories, needs,
  route, status, submitted_at, linked_at`;

function toRegistration(r: Row): Registration {
  return {
    id: r.id,
    receiptNo: r.receipt_no,
    name: r.name,
    flightDate: r.flight_date,
    flightNo: r.flight_no,
    categories: r.categories,
    needs: r.needs,
    route: r.route,
    status: r.status,
    submittedAt: r.submitted_at,
    linkedAt: r.linked_at,
  };
}

const RECEIPT_TRIES = 20;
const MAX_NAME = 40;

function newReceiptNo(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

export type CreateResult = { ok: true; registration: Registration } | { ok: false; error: string };

export async function createRegistration(db: Db, input: RegistrationInput, now: Date): Promise<CreateResult> {
  if (input.consent !== true) return { ok: false, error: "동의가 필요합니다" };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME) return { ok: false, error: "이름을 확인해 주세요" };

  const selectionError = validateSelection(input.categories, input.needs);
  if (selectionError) return { ok: false, error: selectionError };

  if (!["web", "paper", "assisted"].includes(input.route)) return { ok: false, error: "등록 경로가 맞지 않습니다" };

  const flight = await getFlight(db, input.flightDate, input.flightNo);
  if (!flight) return { ok: false, error: "편명을 다시 확인해 주세요" };

  // 화면이 보낸 시작 시각이 이상하면 제출 시각으로 둔다(작성 시간 0으로 집계).
  const startedAt =
    input.startedAt instanceof Date && !Number.isNaN(input.startedAt.getTime()) && input.startedAt <= now
      ? input.startedAt
      : now;
  const editCount = Number.isInteger(input.editCount) && input.editCount >= 0 ? input.editCount : 0;

  // 접수 번호는 연결 대기 중인 건 안에서만 고유하다. 겹치면 다시 뽑는다.
  for (let i = 0; i < RECEIPT_TRIES; i++) {
    const rows = await db.query<Row>(
      `insert into registrations
         (receipt_no, name, flight_date, flight_no, categories, needs, route,
          consent_at, started_at, submitted_at, edit_count, is_mock)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $10, $11)
       on conflict (receipt_no) where status = 'pending' do nothing
       returning ${COLUMNS}`,
      [
        newReceiptNo(),
        name,
        flight.flightDate,
        flight.flightNo,
        input.categories,
        input.needs,
        input.route,
        now,
        startedAt,
        editCount,
        config.dataMode === "mock",
      ],
    );
    if (rows[0]) return { ok: true, registration: toRegistration(rows[0]) };
  }
  return { ok: false, error: "접수 번호를 만들지 못했습니다. 잠시 후 다시 시도해 주세요" };
}

export interface RegistrationEdit {
  name: string;
  flightDate: string;
  flightNo: string;
  categories: string[];
  needs: string[];
}

/**
 * 안내데스크에서 등록 내용을 고친다. 패스를 기다리는 등록과 패스를 쓰고 있는 등록만 고칠 수 있다.
 * 동의 시각, 접수 번호, 연결된 패스는 그대로 둔다. edit_count 는 건드리지 않는다.
 * 그 값은 여객이 등록 화면에서 되돌아가 고친 횟수(작성 난이도 지표)이고, 직원이 고친 사실은 조회 기록(edit)에 남는다.
 */
export async function updateRegistration(
  db: Db,
  id: string,
  input: RegistrationEdit,
  now: Date,
): Promise<CreateResult> {
  if (!isUuid(id)) return { ok: false, error: "고칠 수 있는 등록이 아닙니다" };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME) return { ok: false, error: "이름을 확인해 주세요" };
  const selectionError = validateSelection(input.categories, input.needs);
  if (selectionError) return { ok: false, error: selectionError };
  const flight = await getFlight(db, input.flightDate, input.flightNo);
  if (!flight) return { ok: false, error: "편명을 다시 확인해 주세요" };

  // 이미 떠난 편으로는 바꾸지 않는다. 바꾸면 여객이 목록에서 사라지고 곧 지워진다.
  // 편을 그대로 두고 이름이나 도움만 고치는 것은 막지 않는다.
  const [current] = await db.query<{ flight_date: string | null; flight_no: string | null }>(
    "select flight_date::text as flight_date, flight_no from registrations where id = $1",
    [id],
  );
  const changed = current?.flight_date !== flight.flightDate || current?.flight_no !== flight.flightNo;
  const departed = (flight.estAt ?? flight.schedAt) <= now || flight.status.includes("출발");
  if (changed && departed) return { ok: false, error: "이미 출발한 편입니다. 편명을 다시 확인해 주세요" };

  const rows = await db.query<Row>(
    `update registrations
     set name = $2, flight_date = $3, flight_no = $4, categories = $5, needs = $6
     where id = $1 and status in ('pending', 'active')
     returning ${COLUMNS}`,
    [id, name, flight.flightDate, flight.flightNo, input.categories, input.needs],
  );
  return rows[0] ? { ok: true, registration: toRegistration(rows[0]) } : { ok: false, error: "고칠 수 있는 등록이 아닙니다" };
}

export async function getRegistration(db: Db, id: string): Promise<Registration | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.query<Row>(`select ${COLUMNS} from registrations where id = $1`, [id]);
  return row ? toRegistration(row) : null;
}

export async function findPendingByReceipt(db: Db, receiptNo: string): Promise<Registration | null> {
  if (!/^\d{4}$/.test(receiptNo)) return null;
  const [row] = await db.query<Row>(
    `select ${COLUMNS} from registrations where receipt_no = $1 and status = 'pending'`,
    [receiptNo],
  );
  return row ? toRegistration(row) : null;
}

/** 재발급용. 패스가 연결된 등록을 이름과 편명으로 찾는다. */
export async function findActiveByNameAndFlight(db: Db, name: string, flightNo: string): Promise<Registration[]> {
  const rows = await db.query<Row>(
    `select ${COLUMNS} from registrations
     where status = 'active' and name = $1 and flight_no = $2 order by submitted_at`,
    [name.trim(), flightNo.replace(/[\s-]/g, "").toUpperCase()],
  );
  return rows.map(toRegistration);
}

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
