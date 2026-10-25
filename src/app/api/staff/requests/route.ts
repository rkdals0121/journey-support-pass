import {
  listServiceRequests,
  actOnServiceRequest,
} from "@/lib/service-requests";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const now = new Date();
  return json(
    await listServiceRequests(await getDb(), await currentSession(now), now, {
      history: q.get("history") === "1",
      offset: Number(q.get("offset") ?? 0),
    }),
  );
}
export async function POST(request: Request) {
  const now = new Date();
  const body = await readBody(request);
  return json(
    await actOnServiceRequest(
      await getDb(),
      await currentSession(now),
      typeof body.id === "string" ? body.id : "",
      body,
      now,
    ),
  );
}
