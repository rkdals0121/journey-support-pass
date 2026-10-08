import {
  cancelHandler,
  deskListHandler,
  deskRegisterHandler,
  getHandler,
  linkHandler,
  morePassesHandler,
  receiptHandler,
  reissueHandler,
  summaryHandler,
  updateHandler,
} from "@/lib/api/desk";
import { fail } from "@/lib/api/dto";
import { getDb } from "@/lib/db";
import { currentSession, json, readBody, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// /api/desk/list | get | receipt | link | register | reissue | cancel | update | summary | passes
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
    case "list":
      return json(await deskListHandler(db, session, device, now));
    case "get":
      return json(await getHandler(db, session, body, device, now));
    case "receipt":
      return json(await receiptHandler(db, session, body, device, now));
    case "link":
      return json(await linkHandler(db, session, body, device, now));
    case "register":
      return json(await deskRegisterHandler(db, session, body, now));
    case "reissue":
      return json(await reissueHandler(db, session, body, device, now));
    case "cancel":
      return json(await cancelHandler(db, session, body, device, now));
    case "update":
      return json(await updateHandler(db, session, body, device, now));
    case "summary":
      return json(await summaryHandler(db, session, now));
    case "passes":
      return json(await morePassesHandler(db, session, body));
    default:
      return json(fail(404, "없는 경로입니다"));
  }
}
