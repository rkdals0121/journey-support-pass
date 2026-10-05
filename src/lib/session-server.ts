import { cookies, headers } from "next/headers";
import type { ApiResult } from "./api/dto";
import { deviceKey, readSession, SESSION_COOKIE, type Session } from "./auth";
import { config } from "./config";

/** 요청의 세션 쿠키를 읽는다. 경로 처리기와 서버 컴포넌트에서만 쓴다. */
export async function currentSession(now: Date = new Date()): Promise<Session | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value, now);
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: config.sessionHours * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** 입력 실패 차단에 쓰는 기기 키. IP 와 User-Agent 를 해시한 값만 남는다. */
export async function requestDeviceKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return deviceKey(ip, h.get("user-agent") ?? "");
}

export function json(result: ApiResult): Response {
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
