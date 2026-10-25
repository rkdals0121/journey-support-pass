import { lookupPass } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session-server";
import { HelpFlow } from "../../../help/HelpFlow";
export const dynamic = "force-dynamic";
export default async function RegisteredHelp({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await currentSession();
  const shared = {
    initialPlace: session?.isKiosk ? (session.placeId ?? "") : "",
    sharedDevice: session?.isKiosk === true,
    lockedPlace: session?.isKiosk === true,
  };
  const found = await lookupPass(await getDb(), token, new Date());
  if (found.kind !== "ok")
    return <HelpFlow lang="ko" registrationError {...shared} />;
  return (
    <HelpFlow
      lang={found.journey.lang}
      {...shared}
      registrationToken={token}
      savedChoices={found.journey.choices}
      savedParty={found.journey.extra.party ?? 1}
    />
  );
}
