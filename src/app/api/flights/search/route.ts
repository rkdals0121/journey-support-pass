import { searchFlightsHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return json(await searchFlightsHandler(await getDb(), q, new Date()));
}
