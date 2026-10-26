import { fail } from "./api/dto";
import type { Db } from "./db";
export async function historicalServiceConflicts(
  db: Db,
  ids: string[],
): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const rows = await db.query<{ id: string; count: number }>(
    `
    select w.id,(select count(*)::int from request_work_ledger other
     where other.registration_id=w.registration_id and other.service=w.service
     and other.state in ('received','assigned','en_route','arrived','serving')) as count
    from request_work_ledger w join active_service_claims c
     on c.registration_id=w.registration_id and c.service=w.service
    where c.owner_id is null and w.id=any($1::text[])
     and w.state in ('received','assigned','en_route','arrived','serving')
  `,
    [ids],
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.count]));
}
export function isServiceClaimConflict(error: unknown): boolean {
  const value = error as { code?: string; constraint?: string } | null;
  return (
    value?.code === "23505" && value.constraint === "active_service_claims_pkey"
  );
}
export function serviceClaimConflict() {
  return fail(
    409,
    "같은 사전등록으로 진행 중인 동일 서비스 요청이 있습니다. 직원에게 기존 접수를 확인해 주세요.",
    "duplicate_service",
  );
}
export async function claimAware<T>(
  operation: () => Promise<T>,
): Promise<{ value: T } | { conflict: true }> {
  try {
    return { value: await operation() };
  } catch (error) {
    if (isServiceClaimConflict(error)) return { conflict: true };
    throw error;
  }
}
