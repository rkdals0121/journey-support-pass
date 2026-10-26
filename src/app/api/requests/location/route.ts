import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";
import { changeRequestPlace } from "@/lib/service-requests";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return json(
    await changeRequestPlace(
      await getDb(),
      await currentSession(),
      await readBody(request),
      new Date(),
    ),
  );
}
