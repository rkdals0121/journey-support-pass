import { getDb } from "@/lib/db";
import { json, readBody } from "@/lib/session-server";
import { recordAlertReceipt } from "@/lib/request-alerts";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return json(
    await recordAlertReceipt(
      await getDb(),
      (await readBody(request)).token,
      new Date(),
    ),
  );
}
