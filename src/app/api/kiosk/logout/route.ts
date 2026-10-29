import { clearSessionCookie, currentSession, json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 이 기기의 키오스크 설치를 푼다. 시연에서 같은 컴퓨터로 키오스크와 여객 화면을 번갈아 보여 줄 때 쓴다.
// 키오스크로 설치된 기기에서만 지운다. 직원으로 로그인한 기기의 로그인은 건드리지 않는다.
export async function POST() {
  const session = await currentSession();
  if (!session?.isKiosk) return json({ status: 400, body: { error: "키오스크로 설치된 기기가 아닙니다" } });
  await clearSessionCookie();
  return json({ status: 200, body: { ok: true } });
}
