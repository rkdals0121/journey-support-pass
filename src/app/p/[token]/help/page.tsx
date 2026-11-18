import { lookupPass } from "@/lib/api/public";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session-server";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { HelpFlow } from "../../../help/HelpFlow";
import { PublicShell } from "@/app/components/PublicShell";
import { FieldTaskShell } from "@/app/components/FieldTaskShell";
import { placeOf } from "@/lib/airport";
import { prefsOf } from "@/lib/catalog";
import { supportTopic } from "@/lib/service-catalog";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("도움 요청", "Request help");
export const dynamic = "force-dynamic";
export default async function RegisteredHelp({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    service?: string;
    topic?: string;
    returnTo?: string;
    fresh?: string;
    resume?: string;
    lang?: string;
  }>;
}) {
  const { token } = await params;
  const session = await currentSession();
  const q = await searchParams;
  // 키오스크 서비스 카드(시설 불편·교통·주차·그 밖의 도움)는 ?topic= 으로 주제를 넘긴다. /help 와 같이 그 주제 화면을 연다.
  const topic = supportTopic(q.topic);
  const shared = {
    initialPlace: session?.isKiosk ? (session.placeId ?? "") : "",
    sharedDevice: session?.isKiosk === true,
    lockedPlace: session?.isKiosk === true,
    initialService: topic?.service ?? helpService(q.service),
    initialTopic: topic?.id,
    returnTo: session?.isKiosk ? kioskReturn(q.returnTo) : undefined,
    freshShared: session?.isKiosk === true && q.fresh === "1",
    checkExisting: q.resume === "1",
    // 위쪽 바(키오스크 FieldTaskShell, 여객 PublicShell)에 이미 언어·글자 크기가 있다. 「내 등록으로」는 소개 박스의 「이전」 자리에 있다.
    embedded: true,
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
      key={`${token}:${topic?.id ?? "generic"}`}
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
    <PublicShell lang={lang}>{flow}</PublicShell>
  );
}
