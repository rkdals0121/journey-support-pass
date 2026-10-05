import { deskRegisterHandler, linkHandler, receiptHandler, reissueHandler } from "@/lib/api/desk";
import { fail } from "@/lib/api/dto";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// /api/desk/receipt | link | register | reissue
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const now = new Date();
  const { action } = await params;
  const [db, session, body, device] = await Promise.all([
    getDb(),
    currentSession(now),
    readBody(request),
    requestDeviceKey(),
  ]);

  switch (action) {
    case "receipt":
      return json(await receiptHandler(db, session, body, device, now));
    case "link":
      return json(await linkHandler(db, session, body, device, now));
    case "register":
      return json(await deskRegisterHandler(db, session, body, now));
    case "reissue":
      return json(await reissueHandler(db, session, body, device, now));
    default:
      return json(fail(404, "없는 경로입니다"));
  }
}
