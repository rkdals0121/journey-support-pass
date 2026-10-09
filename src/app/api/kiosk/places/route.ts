import { placesHandler } from "@/lib/api/kiosk";
import { json } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(placesHandler());
}
