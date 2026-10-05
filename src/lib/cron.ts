import { timingSafeEqual } from "node:crypto";
import { config } from "./config";

/** 예약 실행 경로는 Authorization: Bearer <CRON_SECRET> 로만 열린다. */
export function isCronAuthorized(request: Request): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${config.cronSecret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
