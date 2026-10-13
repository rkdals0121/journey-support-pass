import { searchFlightsHandler } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return json(await searchFlightsHandler(await getDb(), params.get("q") ?? "", new Date(), params.get("city") ?? ""));
}
