import { PublicShell } from "../components/PublicShell";
import { NavigationFlow } from "./NavigationFlow";
import { currentSession } from "@/lib/session-server";
import { placeOf } from "@/lib/airport";
import { kioskReturn } from "@/lib/help-entry";
import { FieldTaskShell } from "../components/FieldTaskShell";
import { config } from "@/lib/config";
export default async function Navigate({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; gate?: string; returnTo?: string; device?: string }>;
}) {
  const q = await searchParams;
  const en = q.lang === "en";
  const session = await currentSession();
  const place = session?.isKiosk ? placeOf(session.placeId) : undefined;
  const returnTo =
    kioskReturn(q.returnTo) ??
    (place?.landside ? "/kiosk/entry" : "/kiosk/guide");
  const flow = (
    <NavigationFlow
      en={en}
      initialGate={q.gate && /^\d{1,3}$/.test(q.gate) ? q.gate : ""}
      initialPlace={place?.id ?? ""}
      fixedPlace={!!place}
      robotGuidance={q.device === "robot" || (!!place && returnTo === "/kiosk/entry")}
      returnTo={returnTo}
      idleAskSec={config.idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
  if (place)
    return (
      <FieldTaskShell
        en={en}
        returnTo={returnTo}
        place={en ? place.labelEn : place.label}
      >
        {flow}
      </FieldTaskShell>
    );
  return <PublicShell lang={en ? "en" : "ko"}>{flow}</PublicShell>;
}
