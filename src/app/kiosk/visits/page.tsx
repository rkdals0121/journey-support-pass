import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session-server";
import { placeOf } from "@/lib/airport";
import { SERVICE_HUBS } from "@/lib/service-hubs";
import { config } from "@/lib/config";
import { KioskVisitFlow } from "./KioskVisitFlow";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function KioskVisits({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await currentSession();
  if (!session?.isKiosk || !session.placeId) redirect("/kiosk");
  const place = placeOf(session.placeId)!;
  const hub = SERVICE_HUBS.find((h) => h.placeId === place.id);
  return (
    <KioskVisitFlow
      en={(await searchParams).lang === "en"}
      hubId={hub?.id}
      place={place.label}
      returnTo={place.landside ? "/kiosk/entry" : "/kiosk/guide"}
      askSec={config.idleAskSec}
      answerSec={config.idleAnswerSec}
    />
  );
}
