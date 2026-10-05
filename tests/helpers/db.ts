import { migrate, openPglite, type Db } from "@/lib/db";

export async function createTestDb(): Promise<Db> {
  const db = await openPglite();
  await migrate(db);
  return db;
}

/** 한국 시각 문자열을 Date 로. kst("2026-10-05 14:30") */
export function kst(s: string): Date {
  return new Date(s.replace(" ", "T") + ":00+09:00");
}
