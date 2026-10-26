import { currentSession } from "@/lib/session-server";
import { HelpFlow } from "./HelpFlow";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { businessOf } from "@/lib/operating-profile";
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
    business?: string;
  }>;
}) {
  const q = await searchParams;
  const session = await currentSession();
  const business = businessOf(q.business);
  return (
    <HelpFlow
      lang={q.lang === "en" ? "en" : "ko"}
      initialPlace={
        session?.isKiosk ? (session.placeId ?? "") : (q.place ?? "")
      }
      sharedDevice={session?.isKiosk === true}
      lockedPlace={session?.isKiosk === true}
      initialService={helpService(q.service)}
      initialNote={
        business && business.access !== "internal"
          ? q.lang === "en"
            ? `Please help me with ${business.en}.`
            : `${business.label} 관련 상담을 요청합니다.`
          : ""
      }
      returnTo={session?.isKiosk ? kioskReturn(q.returnTo) : undefined}
      freshShared={session?.isKiosk === true && q.fresh === "1"}
      checkExisting={q.resume === "1"}
    />
  );
}
