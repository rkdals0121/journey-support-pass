import { getDb } from "@/lib/db";
import { linkExistingBoarding } from "@/lib/boarding-link";
import { json, readBody } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return json(
    await linkExistingBoarding(
      await getDb(),
      await readBody(request),
      new Date(),
    ),
  );
}
