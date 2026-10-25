import { getDb } from "@/lib/db";
import { json, readBody } from "@/lib/session-server";
import { registeredRequestProgress } from "@/lib/service-requests";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return json(
    await registeredRequestProgress(
      await getDb(),
      (await readBody(request)).token,
      new Date(),
    ),
  );
}
