import { redirect } from "next/navigation";
import type { Session } from "./auth";
import { currentSession } from "./session-server";

/**
 * 직원 화면의 문지기. 로그인하지 않았으면 로그인으로,
 * 공통 직원 코드로 들어와 아직 근무 구역을 고르지 않았으면 구역 고르기로 보낸다.
 */
export async function requireStaff(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  if (session.needsZone) redirect("/staff/zone");
  return session;
}
