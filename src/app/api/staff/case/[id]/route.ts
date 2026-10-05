import { caseHandler } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const now = new Date();
  const { id } = await params;
  return json(await caseHandler(await getDb(), await currentSession(now), id, now));
}
