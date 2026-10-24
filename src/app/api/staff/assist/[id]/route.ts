import { assistActionHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const now = new Date();
  const body = await readBody(request);
  return json(await assistActionHandler(await getDb(), await currentSession(now), (await params).id, body, now));
}
