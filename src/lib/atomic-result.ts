import type { Db } from "./db";
import type { ApiResult } from "./api/dto";
class Rollback extends Error {
  constructor(readonly result: ApiResult) {
    super("Business operation rolled back");
  }
}
/** One pinned connection. Failed business outcomes roll back as well as SQL errors. */
export async function atomicResult(
  db: Db,
  work: (connection: Db) => Promise<ApiResult>,
): Promise<ApiResult> {
  if (!db.transaction)
    throw new Error("Transactional database connection required");
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (connection) => {
        const result = await work(connection);
        if (result.status >= 400) throw new Rollback(result);
        return result;
      });
    } catch (error) {
      if (error instanceof Rollback) return error.result;
      if (
        attempt < 2 &&
        ["40P01", "40001"].includes((error as { code?: string }).code ?? "")
      )
        continue;
      throw error;
    }
  }
}
