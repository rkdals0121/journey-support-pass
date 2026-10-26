import { lookupPass } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session-server";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { HelpFlow } from "../../../help/HelpFlow";
import { PublicShell } from "@/app/components/PublicShell";
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
    lang?:string;
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
  const lang=q.lang==="en"?"en":q.lang==="ko"?"ko":found.journey.lang;
  const flow=(
    <HelpFlow
      key={token}
      lang={lang}
      {...shared}
      registrationToken={token}
      savedChoices={found.journey.choices}
      savedParty={found.journey.extra.party ?? 1}
    />
  );
  return session?.isKiosk?flow:<PublicShell lang={lang}><div className="public-request-layout request-solo">{flow}</div></PublicShell>;
}
