import { lookupPass } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session-server";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { HelpFlow } from "../../../help/HelpFlow";
export const dynamic = "force-dynamic";
export default async function RegisteredHelp({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    service?: string;
    returnTo?: string;
    fresh?: string;
    resume?: string;
  }>;
}) {
  const { token } = await params;
  const session = await currentSession();
  const q = await searchParams;
  const shared = {
    initialPlace: session?.isKiosk ? (session.placeId ?? "") : "",
    sharedDevice: session?.isKiosk === true,
    lockedPlace: session?.isKiosk === true,
    initialService: helpService(q.service),
    returnTo: session?.isKiosk ? kioskReturn(q.returnTo) : undefined,
    freshShared: session?.isKiosk === true && q.fresh === "1",
    checkExisting: q.resume === "1",
  };
  const found = await lookupPass(await getDb(), token, new Date());
  if (found.kind !== "ok")
    return <HelpFlow lang="ko" registrationError {...shared} />;
  return (
    <HelpFlow
      key={token}
      lang={found.journey.lang}
      {...shared}
      registrationToken={token}
      savedChoices={found.journey.choices}
      savedParty={found.journey.extra.party ?? 1}
    />
  );
}
