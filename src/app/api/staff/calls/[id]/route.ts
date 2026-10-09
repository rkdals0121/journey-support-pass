import { callActionHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const now = new Date();
  const body = await readBody(request);
  return json(await callActionHandler(await getDb(), await currentSession(now), (await params).id, body, now));
}
