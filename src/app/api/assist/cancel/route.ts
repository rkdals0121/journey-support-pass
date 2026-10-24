import { assistCancelHandler } from "@/lib/api/entry";
import { getDb } from "@/lib/db";
import { json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return json(await assistCancelHandler(await getDb(), await readBody(request), new Date()));
}
