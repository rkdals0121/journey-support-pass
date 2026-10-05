import type { Db } from "@/lib/db";
import { ingestFlights } from "@/lib/flights/ingest";
import type { FlightRow } from "@/lib/flights/normalize";
import { kstDate } from "@/lib/flights/normalize";
import { generatePasses, linkPass } from "@/lib/passes";
import { createRegistration, type Registration, type RegistrationInput } from "@/lib/registrations";
import { kst } from "./db";

/** 검사용 운항 한 편. sched 는 "2026-10-05 14:30" (한국 시각). */
export function flightRow(flightNo: string, sched: string, over: Partial<FlightRow> = {}): FlightRow {
  const schedAt = kst(sched);
  return {
    flightDate: kstDate(schedAt),
    flightNo,
    masterNo: "",
    airline: "대한항공",
    destCode: "JFK",
    destName: "뉴욕",
    terminal: "CONCOURSE",
    gate: 112,
    schedAt,
    estAt: null,
    status: "",
    ...over,
  };
}

export async function addFlights(db: Db, rows: FlightRow[], now: Date): Promise<void> {
  await ingestFlights(db, rows, now);
}

export function regInput(over: Partial<RegistrationInput> = {}): RegistrationInput {
  return {
    name: "홍길동",
    flightDate: "2026-10-05",
    flightNo: "KE123",
    categories: ["cat_senior"],
    needs: ["mov_no_stairs", "com_slow"],
    route: "web",
    consent: true,
    startedAt: kst("2026-10-05 11:58"),
    editCount: 0,
    ...over,
  };
}

export async function register(db: Db, now: Date, over: Partial<RegistrationInput> = {}): Promise<Registration> {
  const res = await createRegistration(db, regInput(over), now);
  if (!res.ok) throw new Error(`등록 실패: ${res.error}`);
  return res.registration;
}

/** 등록하고 새 패스를 연결한다. */
export async function registerWithPass(db: Db, now: Date, over: Partial<RegistrationInput> = {}) {
  const registration = await register(db, now, over);
  const [pass] = await generatePasses(db, 1);
  const res = await linkPass(db, pass.token, registration.id, now);
  if (!res.ok) throw new Error(`연결 실패: ${res.error}`);
  return { registration, pass };
}
