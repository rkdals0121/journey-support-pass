import { config } from "@/lib/config";
import { isCronAuthorized } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { readBody } from "@/lib/session-server";
import { runSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 배포 DB 의 초기 설정과 모의 운항 다시 채우기. DB 비밀번호를 운영자 컴퓨터로 내려받지 않고
// 서버가 직접 넣게 하려는 통로다. CRON_SECRET 을 아는 사람만 부를 수 있다.
//
//   POST { "codes": { "구역 id": "코드", ... } }   테이블과 구역 (여러 번 실행해도 된다)
//   POST { "mockFlights": true }                   모의 운항을 지금 시각 기준으로 채울 때
//   POST { "clearMockFlights": true }              모의 운항을 지울 때
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await readBody(request);
  const wantsMock = body.mockFlights === true;
  // 모의 운항은 모의 데이터 모드에서만 넣는다. 실제 운항 정보와 섞이면 안 된다.
  if (wantsMock && config.dataMode !== "mock") {
    return Response.json({ error: "모의 운항은 DATA_MODE=mock 에서만 넣을 수 있습니다" }, { status: 400 });
  }

  const codes =
    body.codes && typeof body.codes === "object" && !Array.isArray(body.codes)
      ? (body.codes as Record<string, string>)
      : null;
  const result = await runSetup(
    await getDb(),
    {
      codes,
      requireAllCodes: true,
      mockFlights: wantsMock,
      clearMockFlights: body.clearMockFlights === true,
    },
    new Date(),
  );
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
