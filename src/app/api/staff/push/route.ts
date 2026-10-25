import { currentSession, json, readBody } from "@/lib/session-server";
import { configurePush, pushConfig } from "@/lib/staff-push";
import { getDb } from "@/lib/db";
import { fail, ok } from "@/lib/api/dto";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await currentSession();
  if (!session || session.isKiosk || session.needsZone)
    return json(fail(401, "직원 로그인이 필요합니다"));
  const config = pushConfig();
  return json(
    ok({
      enabled: config.enabled,
      publicKey: config.enabled ? config.publicKey : "",
    }),
  );
}
async function change(request: Request, remove: boolean) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json(fail(403, "같은 사이트에서 설정해 주세요"));
  const now = new Date();
  return json(
    await configurePush(
      await getDb(),
      await currentSession(now),
      (await readBody(request)).subscription,
      now,
      remove,
    ),
  );
}
export const POST = (request: Request) => change(request, false);
export const DELETE = (request: Request) => change(request, true);
