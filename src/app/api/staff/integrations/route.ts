import { getDb } from "@/lib/db";
import { currentSession, json, readBody } from "@/lib/session-server";
import {
  enqueueIntegration,
  integrationOverview,
} from "@/lib/external-integrations";
export const dynamic = "force-dynamic";
export async function GET() {
  return json(await integrationOverview(await getDb(), await currentSession()));
}
export async function POST(request: Request) {
  return json(
    await enqueueIntegration(
      await getDb(),
      await currentSession(),
      await readBody(request),
      new Date(),
    ),
  );
}
