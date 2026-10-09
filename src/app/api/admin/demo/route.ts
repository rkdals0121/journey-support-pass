import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { seedDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 시연용 패스를 만든다. 안내 키오스크에 보여 주면 장면마다 다른 안내가 열리는 QR 을 뽑을 때 쓴다.
// CRON_SECRET 을 아는 사람만 부를 수 있고, 모의 데이터 모드에서만 동작한다.
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await seedDemo(await getDb(), new Date());
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
