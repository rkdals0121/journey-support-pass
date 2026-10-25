import { currentSession } from "@/lib/session-server";
import { HelpFlow } from "./HelpFlow";
import { helpService, kioskReturn } from "@/lib/help-entry";
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{
    lang?: string;
    place?: string;
    service?: string;
    returnTo?: string;
    fresh?: string;
    resume?: string;
  }>;
}) {
  const q = await searchParams;
  const session = await currentSession();
  return (
    <HelpFlow
      lang={q.lang === "en" ? "en" : "ko"}
      initialPlace={
        session?.isKiosk ? (session.placeId ?? "") : (q.place ?? "")
      }
      sharedDevice={session?.isKiosk === true}
      lockedPlace={session?.isKiosk === true}
      initialService={helpService(q.service)}
      returnTo={session?.isKiosk ? kioskReturn(q.returnTo) : undefined}
      freshShared={session?.isKiosk === true && q.fresh === "1"}
      checkExisting={q.resume === "1"}
    />
  );
}
