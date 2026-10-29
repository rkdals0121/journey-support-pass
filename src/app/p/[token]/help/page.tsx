import { lookupPass } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session-server";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { HelpFlow } from "../../../help/HelpFlow";
import { PublicShell } from "@/app/components/PublicShell";
import { FieldTaskShell } from "@/app/components/FieldTaskShell";
import { placeOf } from "@/lib/airport";
import { prefsOf } from "@/lib/catalog";
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
    lang?: string;
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
    // 키오스크 머리(FieldTaskShell)에 이미 돌아가기·언어·글자 크기가 있다. 휴대전화에서는 「내 등록으로」 줄을 남긴다.
    embedded: session?.isKiosk === true,
  };
  const found = await lookupPass(await getDb(), token, new Date());
  const place = session?.isKiosk ? placeOf(session.placeId) : undefined;
  if (found.kind !== "ok") {
    const lang = q.lang === "en" ? "en" : "ko";
    const fallback = <HelpFlow lang={lang} registrationError {...shared} />;
    return session?.isKiosk ? <FieldTaskShell en={lang === "en"} returnTo={kioskReturn(q.returnTo) ?? (place?.landside ? "/kiosk/entry" : "/kiosk/guide")} place={lang === "en" ? (place?.labelEn ?? "") : (place?.label ?? "")}>{fallback}</FieldTaskShell> : <PublicShell lang={lang}>{fallback}</PublicShell>;
  }
  const lang =
    q.lang === "en" ? "en" : q.lang === "ko" ? "ko" : found.journey.lang;
  const flow = (
    <HelpFlow
      key={token}
      lang={lang}
      {...shared}
      registrationToken={token}
      savedChoices={found.journey.choices}
      savedParty={found.journey.extra.party ?? 1}
      initialNote={found.journey.extra.note ?? ""}
    />
  );
  return session?.isKiosk ? (
    <FieldTaskShell en={lang === "en"} returnTo={kioskReturn(q.returnTo) ?? (place?.landside ? "/kiosk/entry" : "/kiosk/guide")} place={lang === "en" ? (place?.labelEn ?? "") : (place?.label ?? "")} defaultLarge={prefsOf(found.journey.choices).large}>{flow}</FieldTaskShell>
  ) : (
    <PublicShell lang={lang}>
      <div className="public-request-layout request-solo">{flow}</div>
    </PublicShell>
  );
}
