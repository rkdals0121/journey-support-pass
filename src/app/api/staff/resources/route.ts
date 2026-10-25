import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";
import { listResources, mutateResource } from "@/lib/dispatch-resources";
export const dynamic = "force-dynamic";
export async function GET() {
  return json(
    await listResources(await getDb(), await currentSession(), new Date()),
  );
}
export async function POST(request: Request) {
  return json(
    await mutateResource(
      await getDb(),
      await currentSession(),
      await readBody(request),
      new Date(),
    ),
  );
}
