import { callCancelHandler, callStateHandler } from "@/lib/api/kiosk";
import { getDb } from "@/lib/db";
import { currentSession, json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const now = new Date();
  return json(await callStateHandler(await getDb(), await currentSession(now), (await params).id, now));
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const now = new Date();
  return json(await callCancelHandler(await getDb(), await currentSession(now), (await params).id, now));
}
