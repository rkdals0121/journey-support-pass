import { config } from "./config";
import type { Db } from "./db";
import { lookupPass } from "./api/public";
import { fail, ok } from "./api/dto";
import { readBoardingPayload } from "./airline-boarding";
import { bindBoardingPass, resolveBoardingRef } from "./passes";
import { TOKEN_RE } from "./pass-format";

/** Demo of the airline handoff. Links an existing boarding code; never creates a new code. */
export async function linkExistingBoarding(
  db: Db,
  body: { token?: unknown; scanned?: unknown },
  now: Date,
) {
  if (config.dataMode !== "mock")
    return fail(403, "실제 항공사 연결은 아직 제공되지 않습니다", "demo_only");
  if (typeof body.token !== "string" || !TOKEN_RE.test(body.token))
    return fail(401, "지원등록 화면에서 연결해 주세요");
  const found = await lookupPass(
    db,
    typeof body.token === "string" ? body.token : "",
    now,
  );
  if (found.kind !== "ok") return fail(404, "지원등록을 먼저 확인해 주세요");
  const bp = readBoardingPayload(
    typeof body.scanned === "string" ? body.scanned : "",
    now,
  );
  if (!bp)
    return fail(
      400,
      "이 탑승권의 연결 정보를 확인하지 못했습니다. 시연용 INHA AIR 탑승권을 사용해 주세요",
      "boarding_format",
    );
  if (
    bp.flightDate !== found.journey.flightDate ||
    bp.flightNo !== found.journey.flightNo
  )
    return fail(
      400,
      "등록한 날짜·항공편과 탑승권이 다릅니다",
      "boarding_flight",
    );
  const bound = await resolveBoardingRef(db, bp.ref);
  if (
    bound.kind === "active" &&
    bound.registrationId !== found.journey.registrationId
  )
    return fail(
      409,
      "이미 다른 지원등록에 연결된 탑승권입니다",
      "boarding_bound",
    );
  try {
    await bindBoardingPass(db, found.token, bp.ref, now);
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return fail(409, "이미 연결된 탑승권입니다", "boarding_bound");
    throw e;
  }
  return ok({ linked: true });
}
