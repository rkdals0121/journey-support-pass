import {
  listServiceRequests,
  actOnServiceRequest,
} from "@/lib/service-requests";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";
import { after } from "next/server";
import { processAlertQueue } from "@/lib/request-alerts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const now = new Date();
  const db = await getDb();
  const result = await listServiceRequests(db, await currentSession(now), now, {
    history: q.get("history") === "1",
    offset: Number(q.get("offset") ?? 0),
    limit: Number(q.get("limit") ?? 200),
    search: q.get("search") ?? "",
    service: q.get("service") ?? "all",
    topic: q.get("topic") ?? "all",
    source: q.get("source") ?? "all",
    queue: q.get("queue") ?? "all",
    scope: q.get("scope") ?? "all",
    zone: q.get("zone") ?? "all",
    order: q.get("order") ?? "newest",
  });
  if (result.status === 200)
    after(async () => {
      try {
        await processAlertQueue(db, new Date());
      } catch {
        /* persisted retry */
      }
    });
  return json(result);
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
