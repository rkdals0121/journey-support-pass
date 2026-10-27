import { currentSession } from "@/lib/session-server";
import { HelpFlow } from "./HelpFlow";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { businessOf } from "@/lib/operating-profile";
import { supportTopic } from "@/lib/service-catalog";
import { PublicShell } from "../components/PublicShell";
import { redirect } from "next/navigation";
import { FieldTaskShell } from "../components/FieldTaskShell";
import { placeOf } from "@/lib/airport";
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
    topic?: string;
  }>;
}) {
  const q = await searchParams;
  if (q.topic === "lost-property")
    redirect("/services/lost-property" + (q.lang === "en" ? "?lang=en" : ""));
  const session = await currentSession();
  const business = businessOf(q.business);
  const topic = supportTopic(q.topic),
    lang = q.lang === "en" ? "en" : "ko";
  const flow = (
    <HelpFlow
      key={q.topic ?? "generic"}
      freshPrivate={!session?.isKiosk && q.fresh === "1"}
      lang={q.lang === "en" ? "en" : "ko"}
      initialPlace={
        session?.isKiosk ? (session.placeId ?? "") : (q.place ?? "")
      }
      sharedDevice={session?.isKiosk === true}
      lockedPlace={session?.isKiosk === true}
      initialService={topic?.service ?? helpService(q.service)}
      initialTopic={topic?.id}
      initialBusiness={business?.id}
      initialNote=""
      returnTo={session?.isKiosk ? kioskReturn(q.returnTo) : undefined}
      freshShared={session?.isKiosk === true && q.fresh === "1"}
      checkExisting={q.resume === "1"}
      embedded={!session?.isKiosk}
    />
  );
  if (session?.isKiosk) {
    const place = placeOf(session.placeId);
    return (
      <FieldTaskShell
        en={lang === "en"}
        returnTo={
          kioskReturn(q.returnTo) ??
          (place?.landside ? "/kiosk/entry" : "/kiosk/guide")
        }
        place={lang === "en" ? (place?.labelEn ?? "") : (place?.label ?? "")}
      >
        {flow}
      </FieldTaskShell>
    );
  }
  return <PublicShell lang={lang}>{flow}</PublicShell>;
}
